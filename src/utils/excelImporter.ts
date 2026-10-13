import * as XLSX from 'xlsx';
import { Concepto, ProyectoBC3, RelacionEstructura } from '../types/bc3';
import { normCode, parseNumber } from './bc3Parser';

export interface RawRow {
  index: number;
  [key: string]: any;
}

export interface ColumnMapping {
  codeCol: string;
  summaryCol: string;
  unitCol: string;
  quantityCol: string;
  priceCol: string;
  amountCol?: string;
}

export interface DetectedItem {
  index: number;
  code: string;
  summary: string;
  unit: string;
  quantity: number;
  price: number;
  isChapter: boolean;
  level: number;
}

/**
 * Parses Excel / CSV files using ArrayBuffer to prevent encoding corruption with UTF-8 / Windows-1252.
 */
export function parseExcelFile(file: File): Promise<{ sheetNames: string[]; dataBySheet: Record<string, RawRow[]> }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetNames = workbook.SheetNames;
        const dataBySheet: Record<string, RawRow[]> = {};

        sheetNames.forEach((name) => {
          const sheet = workbook.Sheets[name];
          const json = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
          dataBySheet[name] = json.map((row, idx) => ({ ...row, index: idx + 1 }));
        });

        resolve({ sheetNames, dataBySheet });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Splits a CSV/TSV line respecting quotes and escaped characters.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export function parsePastedClipboardText(text: string): { columns: string[]; rows: RawRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { columns: [], rows: [] };

  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const headers = splitCsvLine(firstLine, delimiter).map((h, i) => h.trim() || `Columna_${i + 1}`);

  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = splitCsvLine(line, delimiter);
    const rowObj: RawRow = { index: i };
    headers.forEach((h, colIdx) => {
      rowObj[h] = values[colIdx] ?? '';
    });
    rows.push(rowObj);
  }

  return { columns: headers, rows };
}

export function guessColumnMapping(columns: string[]): ColumnMapping {
  const findMatch = (keywords: string[]): string => {
    for (const kw of keywords) {
      const found = columns.find((col) => col.toLowerCase().includes(kw));
      if (found) return found;
    }
    return '';
  };

  const codeCol = findMatch(['código', 'codigo', 'cod', 'ref', 'código partida', 'nº', 'capitulo']) || columns[0] || '';
  const summaryCol =
    findMatch(['resumen', 'descripción', 'descripcion', 'concepto', 'designación', 'partida', 'nombre', 'texto']) ||
    columns[1] ||
    '';
  const unitCol = findMatch(['unidad', 'ud', 'ud.', 'medida']) || columns[2] || '';
  const quantityCol = findMatch(['cantidad', 'medición', 'medicion', 'cant', 'canpres', 'med.']) || '';
  const priceCol = findMatch(['precio', 'precio unitario', 'p.u.', 'pu', 'tarifa', 'coste', 'precio unit.']) || '';
  const amountCol = findMatch(['importe', 'total', 'imppres', 'total presup.']) || '';

  return { codeCol, summaryCol, unitCol, quantityCol, priceCol, amountCol };
}

export function analyzeExcelRows(rows: RawRow[], mapping: ColumnMapping): DetectedItem[] {
  const items: DetectedItem[] = [];

  rows.forEach((row, idx) => {
    const rawCode = String(row[mapping.codeCol] ?? '').trim();
    const summary = String(row[mapping.summaryCol] ?? '').trim();
    const unit = String(row[mapping.unitCol] ?? '').trim();
    const parsedQty = parseNumber(row[mapping.quantityCol]);
    const parsedPrice = parseNumber(row[mapping.priceCol]);

    if (!rawCode && !summary) return;

    let isChapter = false;
    let level = 1;

    // Detect dot depth (e.g. 01 vs 01.01 vs 01.01.01)
    const dotCount = (rawCode.match(/\./g) || []).length;
    if (dotCount > 0) {
      level = dotCount + 1;
    }

    // Heuristics for chapter detection:
    // 1. Explicit # at end or starts with CAP
    // 2. No unit, and price is 0 or unassigned, or summary looks like a major chapter title
    if (rawCode.endsWith('#') || rawCode.toLowerCase().startsWith('cap')) {
      isChapter = true;
    } else if (!unit && (parsedPrice === null || parsedPrice === 0) && (parsedQty === null || parsedQty === 0)) {
      isChapter = true;
    } else if (!unit && summary.length > 0 && (parsedPrice === null || parsedPrice === 0)) {
      isChapter = true;
    }

    const code = normCode(rawCode || `P_${idx + 1}`);

    items.push({
      index: idx + 1,
      code,
      summary: summary || code,
      unit,
      quantity: parsedQty !== null ? parsedQty : (isChapter ? 1 : 1),
      price: parsedPrice !== null ? parsedPrice : 0,
      isChapter,
      level,
    });
  });

  return items;
}

export function buildProjectFromDetectedItems(
  items: DetectedItem[],
  projectName: string = 'Presupuesto Importado'
): ProyectoBC3 {
  const conceptos: Record<string, Concepto> = {};
  const estructuras: Record<string, RelacionEstructura[]> = {};
  const rootCode = '0##';

  conceptos[rootCode] = {
    codigo: rootCode,
    unidad: '',
    resumen: projectName,
    precio: 0,
    fecha: new Date().toISOString().slice(2, 10).replace(/-/g, ''),
    tipoBC3: '1',
    texto: `Importado masivamente desde archivo externo`,
  };
  estructuras[rootCode] = [];

  const chapterStack: { code: string; level: number }[] = [{ code: rootCode, level: 0 }];

  items.forEach((item) => {
    conceptos[item.code] = {
      codigo: item.code,
      unidad: item.isChapter ? '' : item.unit,
      resumen: item.summary,
      precio: item.price,
      fecha: new Date().toISOString().slice(2, 10).replace(/-/g, ''),
      tipoBC3: item.isChapter ? '1' : '0',
      texto: '',
    };

    if (item.isChapter) {
      if (!estructuras[item.code]) {
        estructuras[item.code] = [];
      }

      while (chapterStack.length > 1 && chapterStack[chapterStack.length - 1].level >= item.level) {
        chapterStack.pop();
      }
      const parent = chapterStack[chapterStack.length - 1].code;

      if (!estructuras[parent]) estructuras[parent] = [];
      if (!estructuras[parent].some((r) => r.hijoCodigo === item.code)) {
        estructuras[parent].push({
          hijoCodigo: item.code,
          multiplicador: 1,
          cantidadBase: 1,
          cantidad: 1,
          mediciones: [],
          certificaciones: {},
        });
      }

      chapterStack.push({ code: item.code, level: item.level });
    } else {
      const parent = chapterStack[chapterStack.length - 1].code;
      if (!estructuras[parent]) estructuras[parent] = [];

      const initialLines = item.quantity > 0 ? [
        {
          id: `line_xl_${item.index}`,
          fase: '0',
          espacio: '',
          comentario: 'Medición importada',
          n: String(item.quantity),
          longitud: '',
          anchura: '',
          altura: '',
          formula: '',
          cantidad: item.quantity,
        }
      ] : [];

      estructuras[parent].push({
        hijoCodigo: item.code,
        multiplicador: 1,
        cantidadBase: item.quantity,
        cantidad: item.quantity,
        importe: item.quantity * item.price,
        mediciones: initialLines,
        certificaciones: {},
      });
    }
  });

  return {
    codigoRaiz: rootCode,
    conceptos,
    estructuras,
    versionInfo: {
      programa: 'PrestoWeb',
      version: 'FIEBDC-3/2020',
      programaVersion: '1.0',
      encoding: 'UTF-8',
    },
    fases: [
      { id: '1', numero: 1, nombre: 'Fase 1', fecha: '31-Ene-26', estado: 'abierta' },
      { id: '2', numero: 2, nombre: 'Fase 2', fecha: '28-Feb-26', estado: 'abierta' },
    ],
    faseActivaId: '1',
  };
}
