import {
  normCode,
  parseBC3,
  getConceptType,
  wouldCreateCycle,
  recalculateBudget,
  exportBC3,
} from '../src/utils/bc3Parser';
import { detectAndDecodeText } from '../src/utils/encodingDetector';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${msg}`);
  }
}

console.log('\n--- INICIANDO SUITE DE TESTS FIEBDC-3 / PRESTOWEB ---\n');

// 1. Test normCode: preserve trailing '#'
console.log('1. Test de normCode y preservación de #:');
assert(normCode('01#') === '01#', 'normCode("01#") debe conservar el #');
assert(normCode('01') === '01', 'normCode("01") debe ser "01"');
assert(normCode('  CAD#  ') === 'CAD#', 'normCode("  CAD#  ") debe recortar espacios pero conservar #');
assert(normCode('01#') !== normCode('01'), '01# y 01 no deben colisionar');

// 2. Test encoding detector: UTF-8, BOM, windows-1252
console.log('\n2. Test de detección y decodificación de encodings:');
const utf8Str = '~C|DEM01|m2|Demolición de tabiquería y hormigón|15.50|20260101|0|';
const utf8Buffer = new TextEncoder().encode(utf8Str).buffer;
const utf8Decoded = detectAndDecodeText(utf8Buffer);
assert(utf8Decoded.encoding.includes('UTF-8'), 'Detecta UTF-8 estándar');
assert(utf8Decoded.text.includes('Demolición') && utf8Decoded.text.includes('hormigón'), 'Conserva acentos UTF-8');

// UTF-8 with BOM
const bomBytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(utf8Str)]);
const bomDecoded = detectAndDecodeText(bomBytes.buffer);
assert(bomDecoded.hasBom && bomDecoded.encoding.includes('BOM'), 'Detecta UTF-8 con BOM');

// Windows-1252 fallback simulation
// Windows-1252 byte for 'ó' is 0xF3
const win1252Bytes = new Uint8Array([
  0x7e, 0x43, 0x7c, 0x54, 0x45, 0x53, 0x54, 0x7c, 0x75, 0x64, 0x7c, // ~C|TEST|ud|
  0x44, 0x65, 0x6d, 0x6f, 0x6c, 0x69, 0x63, 0x69, 0xf3, 0x6e, // Demolici[ó]n
  0x7c, 0x31, 0x30, 0x7c, 0x7c, 0x30, 0x7c // |10||0|
]);
const winDecoded = detectAndDecodeText(win1252Bytes.buffer);
assert(winDecoded.text.includes('Demolición'), 'Decodifica caracteres windows-1252 correctamente');

// 3. Test non-destructive ~C merge: empty price does NOT overwrite valid price
console.log('\n3. Test de fusión no destructiva de ~C:');
const duplicateC_BC3 = `
~V|PrestoWeb|FIEBDC-3/2020|1.0||ANSI||2||||
~C|OBRA##||PRESUPUESTO GENERAL|0||1|
~D|OBRA##|P01\\1\\10\\
~C|P01|m2|Partida con precio inicial|45.80|20260101|0|
~C|P01||Partida con precio inicial|||0|
`;
const parseDupResult = parseBC3(duplicateC_BC3);
assert(parseDupResult.project.conceptos['P01'].precio === 45.80, 'Precio 45.80 se preserva y no se sobrescribe con 0');
assert(parseDupResult.diagnostics.duplicateConcepts.some(d => d.code === 'P01'), 'Registra duplicado en informe diagnóstico');

// 4. Test exact parent-child measurement (~M) matching:
console.log('\n4. Test de asignación exacta de mediciones ~M en múltiples padres:');
const multiParentBC3 = `
~V|PrestoWeb|FIEBDC-3/2020|1.0||ANSI||2||||
~C|OBRA##||PRESUPUESTO|0||1|
~C|CAP01#||CAPITULO 1|0||1|
~C|CAP02#||CAPITULO 2|0||1|
~C|P_SHARED|m2|Partida compartida en dos capitulos|20.00|20260101|0|
~D|OBRA##|CAP01#\\1\\1\\CAP02#\\1\\1\\
~D|CAP01#|P_SHARED\\1\\1\\
~D|CAP02#|P_SHARED\\1\\1\\
~M|CAP01#\\P_SHARED|1\\1\\1\\1\\|15|\\Subtot1\\15\\\\|
~M|CAP02#\\P_SHARED|1\\1\\1\\1\\|25|\\Subtot2\\25\\\\|
`;
const multiParentResult = parseBC3(multiParentBC3);
const relCap01 = multiParentResult.project.estructuras['CAP01#'].find(r => r.hijoCodigo === 'P_SHARED');
const relCap02 = multiParentResult.project.estructuras['CAP02#'].find(r => r.hijoCodigo === 'P_SHARED');
assert(relCap01?.cantidad === 15, 'Medición de 15 se asigna exactamente a CAP01# -> P_SHARED');
assert(relCap02?.cantidad === 25, 'Medición de 25 se asigna exactamente a CAP02# -> P_SHARED');

// 5. Test orphan measurement tracking:
console.log('\n5. Test de detección de mediciones huérfanas:');
const orphanBC3 = `
~V|PrestoWeb|FIEBDC-3/2020|1.0||ANSI||2||||
~C|OBRA##||PRESUPUESTO|0||1|
~M|CAP_INEXISTENTE\\PARTIDA_X|1\\1\\1\\1\\|100|\\Sin padre\\100\\\\|
`;
const orphanResult = parseBC3(orphanBC3);
assert(orphanResult.diagnostics.orphanedMeasurements.length === 1, 'Registra la medición huérfana en el informe diagnóstico');
assert(orphanResult.diagnostics.orphanedMeasurements[0].code === 'PARTIDA_X', 'Identifica el código de la medición huérfana');

// 6. Test getConceptType: partida compuesta vs capítulo
console.log('\n6. Test de distinción entre partida compuesta y capítulo:');
const compItemBC3 = `
~V|PrestoWeb|FIEBDC-3/2020|1.0||ANSI||2||||
~C|OBRA##||PRESUPUESTO|0||1|
~C|CAP01#||CAPITULO ESTRUCTURAS|0||1|
~C|PART_COMP|m3|Hormigón en zapatas con descompuesto|85.00||0|
~C|MO_OF1|h|Oficial de 1ª|22.00||2|
~C|MAT_HORM|m3|Hormigón HA-25|63.00||4|
~D|OBRA##|CAP01#\\1\\1\\
~D|CAP01#|PART_COMP\\1\\10\\
~D|PART_COMP|MO_OF1\\1\\0.5\\MAT_HORM\\1\\1\\
`;
const compResult = parseBC3(compItemBC3);
const capType = getConceptType(compResult.project, 'CAP01#');
const compType = getConceptType(compResult.project, 'PART_COMP');
assert(capType === 'capitulo' || capType === 'subcapitulo', 'CAP01# se clasifica como capítulo');
assert(compType === 'partida', 'PART_COMP con unidad m3 y descomposición se clasifica como partida');

// 7. Test cycle detection:
console.log('\n7. Test de protección contra ciclos:');
const estructurasCycle = {
  OBRA: [{ hijoCodigo: 'CAP01', multiplicador: 1, cantidadBase: 1, mediciones: [], certificaciones: {} }],
  CAP01: [{ hijoCodigo: 'SUB01', multiplicador: 1, cantidadBase: 1, mediciones: [], certificaciones: {} }],
  SUB01: [{ hijoCodigo: 'PART01', multiplicador: 1, cantidadBase: 1, mediciones: [], certificaciones: {} }],
};
assert(wouldCreateCycle(estructurasCycle, 'SUB01', 'CAP01'), 'Detecta ciclo al intentar pegar CAP01 dentro de SUB01');
assert(wouldCreateCycle(estructurasCycle, 'PART01', 'CAP01'), 'Detecta ciclo al intentar pegar CAP01 dentro de PART01');
assert(!wouldCreateCycle(estructurasCycle, 'CAP01', 'NUEVA_PARTIDA'), 'Permite pegar un nuevo elemento no cíclico');

// 8. Test export / import idempotency:
console.log('\n8. Test de exportación/re-importación idempotente:');
const totalBefore = recalculateBudget(compResult.project);
const exported = exportBC3(compResult.project);
const reimported = parseBC3(exported);
const totalAfter = recalculateBudget(reimported.project);
assert(Math.abs(totalBefore - totalAfter) < 0.01, `Importe total coincide antes (${totalBefore}) y después (${totalAfter})`);

// 9. Test synthetic large BC3:
console.log('\n9. Test de BC3 grande sintético:');
const largeLines: string[] = [
  '~V|PrestoWeb|FIEBDC-3/2020|1.0||UTF-8||2||||',
  '~C|OBRA##||PRESUPUESTO GENERAL MASIVO|0||1|',
];

const childRefs: string[] = [];
for (let c = 1; c <= 20; c++) {
  const capCode = `CAP${c < 10 ? '0' + c : c}#`;
  largeLines.push(`~C|${capCode}||Capítulo ${c}|0||1|`);
  childRefs.push(`${capCode}\\1\\1\\`);

  const partRefs: string[] = [];
  for (let p = 1; p <= 50; p++) {
    const partCode = `P${c}_${p}`;
    const price = (p * 3.5).toFixed(2);
    largeLines.push(`~C|${partCode}|m2|Partida ${p} del capítulo ${c}|${price}|20260101|0|`);
    partRefs.push(`${partCode}\\1\\5\\`);
    largeLines.push(`~M|${capCode}\\${partCode}|1\\1\\1\\1\\|10|\\Subline 1\\5\\\\Subline 2\\5\\\\|`);
  }
  largeLines.push(`~D|${capCode}|${partRefs.join('')}`);
}
largeLines.push(`~D|OBRA##|${childRefs.join('')}`);

const largeBC3Text = largeLines.join('\n');
const startT = performance.now();
const largeResult = parseBC3(largeBC3Text);
const elapsed = Math.round(performance.now() - startT);
assert(largeResult.diagnostics.totalConcepts === 1 + 20 + 1000, `Carga exacta de 1021 conceptos en ${elapsed}ms`);
assert(largeResult.diagnostics.appliedMeasurements === 1000, 'Aplica las 1000 mediciones sin bloqueos');

console.log('\n🎉 TODOS LOS TESTS DE PARSER BC3 Y FIABILIDAD SUPERADOS CON ÉXITO.\n');
