import { Concepto, ImportDiagnostics, LineaMedicion, ProyectoBC3, RelacionEstructura, VersionBC3 } from '../types/bc3';

/**
 * Normalizes a BC3 concept code.
 * Preserves trailing '#' as per FIEBDC-3 specifications, differentiating chapters/subchapters (e.g., 01# vs 01).
 */
export const normCode = (c: unknown): string => {
  return String(c ?? '').trim();
};

export const parseNumber = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const cleaned = String(v).replace(/\s+/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
};

export const round2 = (n: number): number => {
  return Math.round((n + Number.EPSILON) * 100) / 100;
};

export const round4 = (n: number): number => {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
};

export function getPrestoPhaseDate(phaseNumber: number, baseYear: number = 2026): string {
  const months = [
    { name: 'Ene', days: 31 },
    { name: 'Feb', days: 28 },
    { name: 'Mar', days: 31 },
    { name: 'Abr', days: 30 },
    { name: 'May', days: 31 },
    { name: 'Jun', days: 30 },
    { name: 'Jul', days: 31 },
    { name: 'Ago', days: 31 },
    { name: 'Sep', days: 30 },
    { name: 'Oct', days: 31 },
    { name: 'Nov', days: 30 },
    { name: 'Dic', days: 31 },
  ];
  const idx = Math.max(0, phaseNumber - 1);
  const monthIdx = idx % 12;
  const yearOffset = Math.floor(idx / 12);
  const year = baseYear + yearOffset;
  const yrShort = String(year).slice(-2);
  const m = months[monthIdx];
  const days = (monthIdx === 1 && year % 4 === 0) ? 29 : m.days;
  return `${days}-${m.name}-${yrShort}`;
}

export function getNextPhaseDate(existingPhases?: { fecha: string }[]): string {
  if (!existingPhases || existingPhases.length === 0) {
    return getPrestoPhaseDate(1);
  }
  const lastPhase = existingPhases[existingPhases.length - 1];
  const nextNum = existingPhases.length + 1;
  const lastDate = lastPhase?.fecha || '';

  const monthsMap: Record<string, number> = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11,
  };
  const months = [
    { name: 'Ene', days: 31 },
    { name: 'Feb', days: 28 },
    { name: 'Mar', days: 31 },
    { name: 'Abr', days: 30 },
    { name: 'May', days: 31 },
    { name: 'Jun', days: 30 },
    { name: 'Jul', days: 31 },
    { name: 'Ago', days: 31 },
    { name: 'Sep', days: 30 },
    { name: 'Oct', days: 31 },
    { name: 'Nov', days: 30 },
    { name: 'Dic', days: 31 },
  ];

  const match = lastDate.match(/(\d{1,2})-([A-Za-z]{3})-(\d{2,4})/);
  if (match) {
    const mesStr = match[2].toLowerCase();
    let yr = parseInt(match[3], 10);
    if (yr < 100) yr += 2000;
    if (monthsMap[mesStr] !== undefined) {
      const curMonthIdx = monthsMap[mesStr];
      const nextMonthIdx = (curMonthIdx + 1) % 12;
      const nextYr = curMonthIdx === 11 ? yr + 1 : yr;
      const yrShort = String(nextYr).slice(-2);
      const m = months[nextMonthIdx];
      const days = (nextMonthIdx === 1 && nextYr % 4 === 0) ? 29 : m.days;
      return `${days}-${m.name}-${yrShort}`;
    }
  }

  return getPrestoPhaseDate(nextNum);
}

export function evaluateFormula(str: string): number | null {
  if (!str || typeof str !== 'string') return null;
  const expr = str.trim().replace(/,/g, '.');
  if (!expr) return null;

  let pos = 0;
  const peek = () => expr[pos];
  const next = () => expr[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    while (pos < expr.length && (peek() === '+' || peek() === '-')) {
      const op = next();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseFactor();
    while (pos < expr.length && (peek() === '*' || peek() === '/')) {
      const op = next();
      const right = parseFactor();
      left = op === '*' ? left * right : right !== 0 ? left / right : 0;
    }
    return left;
  }

  function parseFactor(): number {
    while (pos < expr.length && peek() === ' ') pos++;
    if (peek() === '-') {
      next();
      return -parseFactor();
    }
    if (peek() === '+') {
      next();
      return parseFactor();
    }
    if (peek() === '(') {
      next();
      const val = parseExpression();
      if (peek() === ')') next();
      return val;
    }
    const start = pos;
    while (pos < expr.length && ((peek() >= '0' && peek() <= '9') || peek() === '.')) {
      pos++;
    }
    if (start === pos) return 0;
    return parseFloat(expr.substring(start, pos)) || 0;
  }

  try {
    const res = parseExpression();
    return isFinite(res) ? res : null;
  } catch {
    return null;
  }
}

export function computeLineQuantity(line: LineaMedicion): number {
  if (!line) return 0;
  if (line.formula && String(line.formula).trim() !== '') {
    const r = evaluateFormula(String(line.formula));
    if (r !== null) return round4(r);
  }
  const n = parseNumber(line.n);
  const l = parseNumber(line.longitud);
  const a = parseNumber(line.anchura);
  const h = parseNumber(line.altura);

  const hasDims = l !== null || a !== null || h !== null;
  if (!hasDims) {
    return n !== null ? round4(n) : 0;
  }
  const factorN = n !== null ? n : 1;
  const factorL = l !== null ? l : 1;
  const factorA = a !== null ? a : 1;
  const factorH = h !== null ? h : 1;

  return round4(factorN * factorL * factorA * factorH);
}

export function parsePrestoSublinesExact(field: string, totalCant: number): LineaMedicion[] {
  if (!field || !field.trim()) {
    if (totalCant > 0) {
      return [
        {
          id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          espacio: '',
          comentario: '',
          n: String(totalCant),
          longitud: '',
          anchura: '',
          altura: '',
          formula: '',
          cantidad: totalCant,
        },
      ];
    }
    return [];
  }

  let str = field.replace(/\\1\\*$/, '');
  const rawChunks = str.split(/\\{2,}/).filter(Boolean);
  const lines: LineaMedicion[] = [];

  for (let idx = 0; idx < rawChunks.length; idx++) {
    const chunk = rawChunks[idx];
    const cleanedChunk = chunk.replace(/^\\+|\\+$/g, '');
    if (!cleanedChunk) continue;

    if (cleanedChunk === '1' && (rawChunks.length > 1 || totalCant !== 1)) {
      continue;
    }

    const parts = cleanedChunk.split('\\');

    let comentario = '';
    let n = '';
    let l = '';
    let a = '';
    let h = '';

    const firstIsNumber = parseNumber(parts[0]) !== null;

    if (parts.length === 1) {
      if (firstIsNumber) {
        n = parts[0];
      } else {
        comentario = parts[0];
        n = '1';
      }
    } else if (firstIsNumber) {
      n = parts[0];
      if (parts[1]) l = parts[1];
      if (parts[2]) a = parts[2];
      if (parts[3]) h = parts[3];
    } else {
      comentario = parts[0];
      if (parts[1]) n = parts[1];
      if (parts[2]) l = parts[2];
      if (parts[3]) a = parts[3];
      if (parts[4]) h = parts[4];
    }

    const lineObj: LineaMedicion = {
      id: `line_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      espacio: '',
      comentario,
      n: n || '1',
      longitud: l,
      anchura: a,
      altura: h,
      formula: '',
    };
    lineObj.cantidad = computeLineQuantity(lineObj);
    lines.push(lineObj);
  }

  if (totalCant > 0 && lines.length === 1 && lines[0].cantidad !== totalCant) {
    lines[0].cantidad = totalCant;
    lines[0].n = String(totalCant);
  }

  if (lines.length === 0 && totalCant > 0) {
    lines.push({
      id: `line_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      espacio: '',
      comentario: '',
      n: String(totalCant),
      longitud: '',
      anchura: '',
      altura: '',
      formula: '',
      cantidad: totalCant,
    });
  }

  return lines;
}

export function createEmptyProject(): ProyectoBC3 {
  const rootCode = 'OBRA';
  return {
    versionInfo: {
      programa: 'PrestoWeb',
      version: 'FIEBDC-3/2020',
      programaVersion: '1.0',
      encoding: 'ANSI',
    },
    codigoRaiz: rootCode,
    conceptos: {
      [rootCode]: {
        codigo: rootCode,
        resumen: 'PRESUPUESTO GENERAL',
        unidad: '',
        precio: 0,
        tipoBC3: '1',
        texto: '',
        importePresupuestado: 0,
      },
    },
    estructuras: {
      [rootCode]: [],
    },
    fases: [
      { id: '1', numero: 1, nombre: 'Fase 1', fecha: '31-Ene-26', estado: 'abierta' },
      { id: '2', numero: 2, nombre: 'Fase 2', fecha: '28-Feb-26', estado: 'abierta' },
    ],
  };
}

export interface ParseBC3Result {
  project: ProyectoBC3;
  diagnostics: ImportDiagnostics;
}

/**
 * Checks whether adding childCode under parentCode would cause a cycle in the structure.
 */
export function wouldCreateCycle(
  estructuras: Record<string, RelacionEstructura[]>,
  parentCode: string,
  childCode: string
): boolean {
  if (!parentCode || !childCode) return false;
  if (parentCode === childCode) return true;

  const visited = new Set<string>();
  const queue = [childCode];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === parentCode) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const rels = estructuras[current] || [];
    for (const r of rels) {
      if (!visited.has(r.hijoCodigo)) {
        queue.push(r.hijoCodigo);
      }
    }
  }

  return false;
}

/**
 * Parses BC3 / FIEBDC text incrementally with full diagnostic reporting.
 * P0 & P1 fixes:
 * - Preserves trailing '#' in codes
 * - Incremental record scanner instead of heavy regex split
 * - Non-destructive ~C merging: empty price fields never overwrite valid prices with 0
 * - Exact parent-child measurement (~M) matching
 * - Diagnostic log of orphaned measurements, duplicates, and unsupported records
 */
export function parseBC3(
  text: string,
  detectedEncoding: string = 'Autodetectado',
  onProgress?: (percent: number, message: string) => void
): ParseBC3Result {
  const conceptos: Record<string, Concepto> = {};
  const estructuras: Record<string, RelacionEstructura[]> = {};
  let versionInfo: VersionBC3 | null = null;

  const conceptOccurrenceMap = new Map<string, number>();
  const unsupportedRecordsMap = new Map<string, number>();
  const orphanedMeasurements: ImportDiagnostics['orphanedMeasurements'] = [];
  const warnings: string[] = [];

  // Incremental record scanner
  // Find all record boundaries: ~ followed by uppercase letter and pipe
  const recordRegex = /(?:^|\r?\n)\s*~([A-Z])\|/g;
  const matches: { type: string; start: number; contentStart: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = recordRegex.exec(text)) !== null) {
    matches.push({
      type: match[1],
      start: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  const totalMatches = matches.length;
  const pendingM: { fields: string[]; rawPadre?: string; rawPartida: string }[] = [];

  for (let i = 0; i < totalMatches; i++) {
    const cur = matches[i];
    const nextStart = i + 1 < totalMatches ? matches[i + 1].start : text.length;
    let content = text.substring(cur.contentStart, nextStart).trim();
    if (content.endsWith('|')) {
      content = content.slice(0, -1);
    }

    const fields = content.split('|');
    const type = cur.type;

    if (onProgress && i % 250 === 0) {
      const pct = Math.round((i / (totalMatches || 1)) * 100);
      onProgress(pct, `Procesando registro ${i + 1} de ${totalMatches}...`);
    }

    if (type === 'V') {
      versionInfo = {
        programa: fields[0] || '',
        version: fields[1] || '',
        programaVersion: fields[2] || '',
        encoding: fields[4] || detectedEncoding || 'ANSI',
      };
    } else if (type === 'C') {
      const code = normCode(fields[0]);
      if (!code) continue;

      const occ = (conceptOccurrenceMap.get(code) || 0) + 1;
      conceptOccurrenceMap.set(code, occ);

      const rawUnit = fields[1];
      const rawResumen = fields[2];
      const rawPrice = fields[3];
      const parsedPrice = parseNumber(rawPrice);
      const rawFecha = fields[4];
      const rawTipo = fields[5];

      if (!conceptos[code]) {
        conceptos[code] = {
          codigo: code,
          unidad: rawUnit || '',
          resumen: rawResumen || '',
          precio: parsedPrice !== null ? parsedPrice : 0,
          fecha: rawFecha || '',
          tipoBC3: rawTipo || '0',
          texto: '',
        };
      } else {
        // NON-DESTRUCTIVE MERGE: never overwrite existing valid price if incoming price is empty!
        if (rawUnit && rawUnit.trim()) {
          conceptos[code].unidad = rawUnit.trim();
        }
        if (rawResumen && rawResumen.trim()) {
          conceptos[code].resumen = rawResumen.trim();
        }
        if (parsedPrice !== null) {
          conceptos[code].precio = parsedPrice;
        }
        if (rawFecha && rawFecha.trim()) {
          conceptos[code].fecha = rawFecha.trim();
        }
        if (rawTipo && rawTipo.trim()) {
          conceptos[code].tipoBC3 = rawTipo.trim();
        }
      }
    } else if (type === 'D') {
      const padre = normCode(fields[0]);
      if (!padre) continue;
      const childrenStr = fields[1] || '';
      let parts = childrenStr.split('\\');
      while (parts.length && parts[0] === '') parts.shift();
      while (parts.length && parts[parts.length - 1] === '') parts.pop();

      if (!conceptos[padre]) {
        conceptos[padre] = {
          codigo: padre,
          unidad: '',
          resumen: padre,
          precio: 0,
          fecha: '',
          tipoBC3: padre.endsWith('#') ? '1' : '',
          texto: '',
        };
      }
      if (!estructuras[padre]) estructuras[padre] = [];

      const limit = Math.floor(parts.length / 3) * 3;
      for (let j = 0; j < limit; j += 3) {
        const codHijo = normCode(parts[j]);
        const m = parseNumber(parts[j + 1]);
        const b = parseNumber(parts[j + 2]);
        if (!codHijo) continue;
        const mult = m !== null ? m : 1;
        const base = b !== null ? b : 1;

        if (!estructuras[padre].some((h) => h.hijoCodigo === codHijo)) {
          estructuras[padre].push({
            hijoCodigo: codHijo,
            multiplicador: mult,
            cantidadBase: base,
            cantidad: mult * base,
            mediciones: [],
            certificaciones: {},
          });
        }
        if (!conceptos[codHijo]) {
          conceptos[codHijo] = {
            codigo: codHijo,
            unidad: '',
            resumen: codHijo,
            precio: 0,
            fecha: '',
            tipoBC3: codHijo.endsWith('#') ? '1' : '',
            texto: '',
          };
        }
      }
    } else if (type === 'T') {
      let code = '';
      let textLines: string[] = [];
      if (fields[0].includes('\\')) {
        const parts = fields[0].split('\\');
        code = normCode(parts[0]);
        textLines = parts.slice(1).filter((s) => s.length > 0);
        if (fields.length > 1) {
          fields.slice(1).forEach((f) => {
            if (f) textLines.push(...f.split('\\').filter((s) => s.length > 0));
          });
        }
      } else {
        code = normCode(fields[0]);
        const rest = fields.slice(1).join('|');
        if (rest) {
          textLines = rest.split('\\').filter((s) => s.length > 0);
        }
      }
      if (!code) continue;
      const desc = textLines.join('\n').trim();
      if (!conceptos[code]) {
        conceptos[code] = {
          codigo: code,
          unidad: '',
          resumen: code,
          precio: 0,
          fecha: '',
          tipoBC3: '',
          texto: '',
        };
      }
      conceptos[code].texto = conceptos[code].texto ? conceptos[code].texto + '\n' + desc : desc;
    } else if (type === 'M') {
      const refs = (fields[0] || '').split('\\');
      const codPartida = normCode(refs[refs.length - 1]);
      const codPadre = refs.length > 1 ? normCode(refs[refs.length - 2]) : undefined;
      pendingM.push({ fields, rawPadre: codPadre, rawPartida: codPartida });
    } else {
      // Record unsupported records (~R, ~L, ~B, ~K, etc.)
      const curCount = unsupportedRecordsMap.get(type) || 0;
      unsupportedRecordsMap.set(type, curCount + 1);
    }
  }

  // Exact parent-child measurement (~M) processing
  let appliedMeasurementsCount = 0;

  for (const mItem of pendingM) {
    const { fields, rawPadre, rawPartida } = mItem;
    if (!rawPartida) continue;

    const cantBC3 = parseNumber(fields[2]) ?? 0;
    const subStr = fields[3] || '';

    let targetRel: RelacionEstructura | null = null;

    if (rawPadre) {
      // Parent is explicitly stated in ~M record
      if (estructuras[rawPadre]) {
        targetRel = estructuras[rawPadre].find((r) => r.hijoCodigo === rawPartida) || null;
      }
      if (!targetRel) {
        orphanedMeasurements.push({
          code: rawPartida,
          parentCode: rawPadre,
          quantity: cantBC3,
          reason: `Relación padre-hijo no encontrada (${rawPadre} -> ${rawPartida})`,
        });
        continue;
      }
    } else {
      // No parent specified in ~M: determine if rawPartida has exactly one parent
      const candidateParents = Object.keys(estructuras).filter((p) =>
        estructuras[p].some((r) => r.hijoCodigo === rawPartida)
      );

      if (candidateParents.length === 1) {
        const singleParent = candidateParents[0];
        targetRel = estructuras[singleParent].find((r) => r.hijoCodigo === rawPartida) || null;
      } else if (candidateParents.length > 1) {
        // Ambiguous: belongs to multiple parents but line didn't specify parent!
        orphanedMeasurements.push({
          code: rawPartida,
          quantity: cantBC3,
          reason: `Partida presente en múltiples capítulos (${candidateParents.join(', ')}); medición ambigua omitida para evitar corrupción`,
        });
        continue;
      } else {
        // Concept is orphan, not in any structure
        orphanedMeasurements.push({
          code: rawPartida,
          quantity: cantBC3,
          reason: `Partida no encontrada en ninguna estructura del presupuesto`,
        });
        continue;
      }
    }

    if (targetRel) {
      targetRel.mediciones = parsePrestoSublinesExact(subStr, cantBC3);
      const sumLines = round4(targetRel.mediciones.reduce((s, l) => s + (l.cantidad || 0), 0));
      targetRel.cantidad = cantBC3 > 0 ? cantBC3 : sumLines;
      appliedMeasurementsCount++;
    }
  }

  // Determine root concept
  const parents = new Set(Object.keys(estructuras));
  const children = new Set<string>();
  Object.values(estructuras).forEach((list) => list.forEach((item) => children.add(item.hijoCodigo)));
  const roots = Array.from(parents).filter((p) => !children.has(p));

  let rootCode: string | null = null;
  const explicitRoot = roots.find(
    (r) => r === '0' || r === '0##' || r === '##' || r === '0#' || r === 'OBRA' || r === 'OBRA##'
  );

  if (explicitRoot) {
    rootCode = explicitRoot;
  } else if (roots.length === 1) {
    rootCode = roots[0];
  } else if (roots.length > 1) {
    const genCode = '__ROOT__';
    conceptos[genCode] = {
      codigo: genCode,
      unidad: '',
      resumen: 'PRESUPUESTO GENERAL',
      precio: 0,
      fecha: '',
      tipoBC3: '1',
      texto: '',
    };
    estructuras[genCode] = roots.map((r) => ({
      hijoCodigo: r,
      multiplicador: 1,
      cantidadBase: 1,
      mediciones: [],
      certificaciones: {},
    }));
    rootCode = genCode;
  } else if (Object.keys(conceptos).length > 0) {
    const genCode = '__ROOT__';
    conceptos[genCode] = {
      codigo: genCode,
      unidad: '',
      resumen: 'PRESUPUESTO GENERAL',
      precio: 0,
      fecha: '',
      tipoBC3: '1',
      texto: '',
    };
    estructuras[genCode] = Object.keys(conceptos)
      .filter((k) => k !== genCode && !estructuras[k])
      .map((k) => ({
        hijoCodigo: k,
        multiplicador: 1,
        cantidadBase: 1,
        mediciones: [],
        certificaciones: {},
      }));
    rootCode = genCode;
  }

  const project: ProyectoBC3 = {
    conceptos,
    estructuras,
    codigoRaiz: rootCode,
    versionInfo,
    fases: [
      {
        id: '1',
        numero: 1,
        nombre: 'Fase 1',
        fecha: '31-Ene-26',
        estado: 'abierta',
        observaciones: 'Fase inicial de certificación',
      },
      {
        id: '2',
        numero: 2,
        nombre: 'Fase 2',
        fecha: '28-Feb-26',
        estado: 'abierta',
        observaciones: 'Segunda fase de certificación',
      },
    ],
    faseActivaId: '1',
  };

  recalculateBudget(project);

  // Prepare duplicate concepts list
  const duplicateConcepts: ImportDiagnostics['duplicateConcepts'] = [];
  conceptOccurrenceMap.forEach((occurrences, code) => {
    if (occurrences > 1) {
      duplicateConcepts.push({ code, occurrences });
    }
  });

  const unsupportedRecords: ImportDiagnostics['unsupportedRecords'] = [];
  unsupportedRecordsMap.forEach((count, type) => {
    unsupportedRecords.push({ type: `~${type}`, count });
  });

  let totalRelationsCount = 0;
  Object.values(estructuras).forEach((rels) => {
    totalRelationsCount += rels.length;
  });

  const diagnostics: ImportDiagnostics = {
    detectedEncoding,
    totalConcepts: Object.keys(conceptos).length,
    totalRelations: totalRelationsCount,
    totalMeasurements: pendingM.length,
    appliedMeasurements: appliedMeasurementsCount,
    orphanedMeasurements,
    duplicateConcepts,
    unsupportedRecords,
    warnings,
  };

  return { project, diagnostics };
}

/**
 * Accurately determines if a concept is a Chapter, Subchapter, or Partida (Unidad de obra).
 * Distinguishes composite items (partidas compuestas / con descomposición) from chapters:
 * - A concept with unit measurement (m2, m3, ud, etc.) or price > 0 that has children is a composite partida.
 * - Only concepts with empty units, or explicit typeBC3 === '1', or ending in '#' are chapters/subchapters.
 */
export function getConceptType(
  project: ProyectoBC3,
  code: string,
  parentCode?: string | null
): 'capitulo' | 'subcapitulo' | 'partida' {
  if (!project) return 'partida';
  const co = project.conceptos[code];
  if (co?.tipoConcepto) return co.tipoConcepto;

  const isRoot = code === project.codigoRaiz;
  if (isRoot) return 'capitulo';

  const hasChildren = (project.estructuras[code] || []).length > 0;
  const endsWithHash = code.endsWith('#');
  const isDirectChildOfRoot = parentCode === project.codigoRaiz;

  // Explicit chapter markers
  if (co?.tipoBC3 === '1' || endsWithHash) {
    return isDirectChildOfRoot ? 'capitulo' : 'subcapitulo';
  }

  // If it has children:
  if (hasChildren) {
    // If it has a unit of measurement and isn't marked as chapter, it is a partida compuesta (composite item)!
    if (co?.unidad && co.unidad.trim() !== '') {
      return 'partida';
    }
    // No unit: treat as chapter or subchapter
    return isDirectChildOfRoot ? 'capitulo' : 'subcapitulo';
  }

  // If unit is empty and price is 0 and is direct child of root, could be empty chapter
  if (co && (!co.unidad || co.unidad.trim() === '') && co.precio === 0 && isDirectChildOfRoot) {
    return 'capitulo';
  }

  return 'partida';
}

export interface CertificationStats {
  canPres: number;
  precio: number;
  impPres: number;
  canCert: number;
  porcCert: number;
  impCert: number;
  canAcum: number;
  porcAcum: number;
  impAcum: number;
  canPend: number;
  impPend: number;
}

export function getRelCertificationStats(
  project: ProyectoBC3,
  parentCode: string,
  childCode: string,
  faseId?: string
): CertificationStats {
  const activeFaseId = faseId || project.faseActivaId || '1';
  const co = project.conceptos[childCode] || { codigo: childCode, resumen: childCode, unidad: '', precio: 0 };
  const parentRels = project.estructuras[parentCode] || [];
  const rel = parentRels.find((r) => r.hijoCodigo === childCode);

  const conceptType = getConceptType(project, childCode, parentCode);
  const isChapter = conceptType === 'capitulo' || conceptType === 'subcapitulo';

  if (isChapter) {
    const childRels = project.estructuras[childCode] || [];
    let sumPres = 0;
    let sumCert = 0;
    let sumAcum = 0;

    childRels.forEach((cr) => {
      const stats = getRelCertificationStats(project, childCode, cr.hijoCodigo, activeFaseId);
      sumPres += stats.impPres;
      sumCert += stats.impCert;
      sumAcum += stats.impAcum;
    });

    const impPres = round2(sumPres);
    const impCert = round2(sumCert);
    const impAcum = round2(sumAcum);
    const impPend = round2(Math.max(0, impPres - impAcum));
    const porcCert = impPres > 0 ? round2((impCert / impPres) * 100) : 0;
    const porcAcum = impPres > 0 ? round2((impAcum / impPres) * 100) : 0;

    return {
      canPres: 1,
      precio: impPres,
      impPres,
      canCert: 0,
      porcCert,
      impCert,
      canAcum: 0,
      porcAcum,
      impAcum,
      canPend: 0,
      impPend,
    };
  }

  const canPres = rel?.cantidad !== undefined ? rel.cantidad : (rel?.multiplicador ?? 1) * (rel?.cantidadBase ?? 1);
  const precio = co.precio || 0;
  const impPres = rel?.importe !== undefined ? rel.importe : round2(canPres * precio);

  const phaseLines = [
    ...(rel?.mediciones || []).filter((m) => String(m.fase) === String(activeFaseId)),
    ...(rel?.certificaciones?.[activeFaseId] || []),
  ];
  let phaseCantFromLines = 0;
  if (phaseLines.length > 0) {
    phaseCantFromLines = phaseLines.reduce((s, l) => s + (l.cantidad || computeLineQuantity(l)), 0);
  }

  const directCant = rel?.cantidadesCertificadas?.[activeFaseId];
  const canCert = round4(phaseCantFromLines > 0 ? phaseCantFromLines : (directCant !== undefined ? directCant : 0));
  const impCert = round2(canCert * precio);
  const porcCert = canPres > 0 ? round2((canCert / canPres) * 100) : 0;

  const phases = project.fases || [];
  const activeFaseIdx = phases.findIndex((f) => f.id === activeFaseId);
  const targetPhases = activeFaseIdx >= 0 ? phases.slice(0, activeFaseIdx + 1) : phases;

  let canAcum = 0;
  targetPhases.forEach((p) => {
    const pLines = [
      ...(rel?.mediciones || []).filter((m) => String(m.fase) === String(p.id)),
      ...(rel?.certificaciones?.[p.id] || []),
    ];
    let pCant = 0;
    if (pLines.length > 0) {
      pCant = pLines.reduce((s, l) => s + (l.cantidad || computeLineQuantity(l)), 0);
    }
    const pDirect = rel?.cantidadesCertificadas?.[p.id];
    const val = pCant > 0 ? pCant : (pDirect !== undefined ? pDirect : 0);
    canAcum += val;
  });
  canAcum = round4(canAcum);
  const impAcum = round2(canAcum * precio);
  const porcAcum = canPres > 0 ? round2((canAcum / canPres) * 100) : 0;

  const canPend = round4(Math.max(0, canPres - canAcum));
  const impPend = round2(canPend * precio);

  return {
    canPres,
    precio,
    impPres,
    canCert,
    porcCert,
    impCert,
    canAcum,
    porcAcum,
    impAcum,
    canPend,
    impPend,
  };
}

export function recalculateBudget(project: ProyectoBC3): number {
  if (!project.codigoRaiz) return 0;

  function calcRel(rel: RelacionEstructura, path: string[]): number {
    const childConcept = project.conceptos[rel.hijoCodigo];
    if (!childConcept) return 0;
    if (path.includes(rel.hijoCodigo)) return 0; // Avoid circular reference
    const nextPath = [...path, rel.hijoCodigo];

    const childRels = project.estructuras[rel.hijoCodigo] || [];
    const conceptType = getConceptType(project, rel.hijoCodigo);
    const isChapter = conceptType === 'capitulo' || conceptType === 'subcapitulo';
    const factor = (rel.multiplicador ?? 1) * (rel.cantidadBase ?? 1);

    if (isChapter) {
      let childSum = 0;
      childRels.forEach((cr) => {
        childSum += calcRel(cr, nextPath);
      });
      rel.cantidad = factor;
      rel.importe = round2(childSum * factor);
      childConcept.precio = round2(childSum);
      childConcept.importePresupuestado = rel.importe;
    } else {
      // It is a partida or partida compuesta
      // If it has decomposed components, optionally compute unit price from them
      if (childRels.length > 0) {
        let decompPrice = 0;
        childRels.forEach((cr) => {
          const compConcept = project.conceptos[cr.hijoCodigo];
          const unitRate = (cr.multiplicador ?? 1) * (cr.cantidadBase ?? 1);
          decompPrice += unitRate * (compConcept?.precio || 0);
        });
        if (decompPrice > 0 && (!childConcept.precio || childConcept.precio === 0)) {
          childConcept.precio = round2(decompPrice);
        }
      }

      let quantity = 0;
      const budgetLines = (rel.mediciones || []).filter((m) => !m.fase || String(m.fase) === '0');
      if (budgetLines.length > 0) {
        let sumLines = 0;
        budgetLines.forEach((m) => {
          m.cantidad = computeLineQuantity(m);
          sumLines += m.cantidad;
        });
        quantity = round4(sumLines);
      } else if (rel.cantidad !== undefined && rel.cantidad !== null) {
        quantity = rel.cantidad;
      } else {
        quantity = factor;
      }

      (rel.mediciones || []).forEach((m) => {
        m.cantidad = computeLineQuantity(m);
      });
      rel.cantidad = quantity;
      rel.importe = round2(quantity * (childConcept.precio || 0));
    }
    return rel.importe || 0;
  }

  const rootRels = project.estructuras[project.codigoRaiz] || [];
  let total = 0;
  rootRels.forEach((rel) => {
    total += calcRel(rel, [project.codigoRaiz!]);
  });

  const rootConcept = project.conceptos[project.codigoRaiz];
  if (rootConcept) {
    rootConcept.importePresupuestado = round2(total);
  }
  return round2(total);
}

export function exportBC3(project: ProyectoBC3): string {
  if (!project.codigoRaiz) return '';
  const lines: string[] = [];

  const encodingDecl = project.versionInfo?.encoding || 'UTF-8';
  lines.push(`~V|PrestoWeb|FIEBDC-3/2020|PrestoWeb 1.0||${encodingDecl}||2||||`);

  const formatCode = (code: string) => {
    if (code === project.codigoRaiz) {
      if (code.endsWith('##')) return code;
      if (code.endsWith('#')) return `${code}#`;
      return `${code}##`;
    }
    const type = getConceptType(project, code);
    const isChap = type === 'capitulo' || type === 'subcapitulo';
    if (isChap && !code.endsWith('#')) {
      return `${code}#`;
    }
    return code;
  };

  // ~C records
  Object.values(project.conceptos).forEach((c) => {
    if (c.codigo.startsWith('__')) return;
    const cCode = formatCode(c.codigo);
    const typeCode = getConceptType(project, c.codigo) === 'capitulo' ? '1' : (c.tipoBC3 || '0');
    lines.push(`~C|${cCode}|${c.unidad || ''}|${c.resumen || ''}|${c.precio || 0}|${c.fecha || ''}|${typeCode}|`);
  });

  // ~D records
  Object.entries(project.estructuras).forEach(([padre, rels]) => {
    if (padre.startsWith('__')) return;
    let s = '';
    rels.forEach((r) => {
      s += `${r.hijoCodigo}\\${r.multiplicador ?? 1}\\${r.cantidadBase ?? 1}\\`;
    });
    lines.push(`~D|${formatCode(padre)}|${s}`);
  });

  // ~T records
  Object.values(project.conceptos).forEach((c) => {
    if (c.codigo.startsWith('__') || !c.texto) return;
    lines.push(`~T|${formatCode(c.codigo)}|${c.texto}|`);
  });

  // ~M records
  Object.entries(project.estructuras).forEach(([padre, rels]) => {
    if (padre.startsWith('__')) return;
    rels.forEach((r) => {
      if (!r.mediciones || r.mediciones.length === 0) return;
      const totalCant = round4(r.mediciones.reduce((s, l) => s + (l.cantidad || computeLineQuantity(l)), 0));
      const sublinesStr = r.mediciones
        .map((l) => {
          const parts = [
            l.comentario || '',
            l.n ?? '',
            l.longitud ?? '',
            l.anchura ?? '',
            l.altura ?? '',
            l.formula || '1',
          ];
          return '\\' + parts.join('\\') + '\\';
        })
        .join('\\\\');
      lines.push(`~M|${formatCode(padre)}\\${r.hijoCodigo}|1\\1\\1\\1\\|${totalCant}|${sublinesStr}|`);
    });
  });

  return lines.join('\r\n') + '\r\n';
}
