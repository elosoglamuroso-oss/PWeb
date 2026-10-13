import { LineaMedicion, Concepto, RelacionEstructura } from '../types/bc3';

export interface CopiedConceptData {
  concepto: Concepto;
  relacion: RelacionEstructura;
  subEstructuras?: Record<string, RelacionEstructura[]>;
  subConceptos?: Record<string, Concepto>;
  sourceParentCode: string;
  isCut?: boolean;
  timestamp?: number;
}

export interface PrestoClipboardPayload {
  __prestoweb__: true;
  type: 'concept' | 'measurements';
  version: number;
  timestamp: number;
  data: any;
}

// In-memory caches with timestamps
let inMemoryConceptClipboard: CopiedConceptData | null = null;
let inMemoryConceptTimestamp = 0;

let inMemoryMeasurementClipboard: LineaMedicion[] = [];
let inMemoryMeasurementTimestamp = 0;

// Setup BroadcastChannel for instant inter-tab/window synchronization on same origin
let syncChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    syncChannel = new BroadcastChannel('prestoweb_clipboard_sync');
    syncChannel.onmessage = (event) => {
      if (event.data?.type === 'CONCEPT_COPIED' && event.data?.data) {
        inMemoryConceptClipboard = event.data.data;
        inMemoryConceptTimestamp = event.data.timestamp || Date.now();
      } else if (event.data?.type === 'MEASUREMENTS_COPIED' && event.data?.data) {
        inMemoryMeasurementClipboard = event.data.data;
        inMemoryMeasurementTimestamp = event.data.timestamp || Date.now();
      }
    };
  }
} catch {}

// Setup storage and focus listeners for inter-window / inter-tab synchronization
if (typeof window !== 'undefined') {
  const syncFromStorage = () => {
    try {
      const raw = localStorage.getItem('presto_concept_clipboard');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.concepto) {
          const t = parsed.timestamp || parseInt(localStorage.getItem('presto_clipboard_timestamp') || '0', 10) || Date.now();
          inMemoryConceptClipboard = parsed;
          inMemoryConceptTimestamp = t;
        }
      }
    } catch {}

    try {
      const mRaw = localStorage.getItem('minipresto_clipboard');
      if (mRaw) {
        const mParsed = JSON.parse(mRaw);
        if (Array.isArray(mParsed) && mParsed.length > 0) {
          inMemoryMeasurementClipboard = mParsed;
          inMemoryMeasurementTimestamp = parseInt(localStorage.getItem('minipresto_clipboard_timestamp') || '0', 10) || Date.now();
        }
      }
    } catch {}
  };

  window.addEventListener('storage', (e) => {
    if (e.key === 'presto_concept_clipboard' || e.key === 'minipresto_clipboard') {
      syncFromStorage();
    }
  });

  // Re-sync when switching tabs/windows
  window.addEventListener('focus', syncFromStorage);
}

/**
 * Parses raw text (JSON, BC3, TSV, CSV, or formatted text) into a CopiedConceptData object.
 * This enables pasting from system clipboard across different browser windows,
 * subdomains, domains, and external tools like Web Price Databases (CYPE, BEDEC, Centro, Presto) or Excel.
 */
export function parseConceptFromText(rawText: string): CopiedConceptData | null {
  if (!rawText || !rawText.trim()) return null;
  const text = rawText.trim();

  // Helper to parse price number from string (e.g. "1.234,50 €" -> 1234.50)
  const extractPrice = (str: string): number | null => {
    if (!str) return null;
    const clean = str.replace(/[€$\s]/g, '').trim();
    if (!clean) return null;
    if (/^-?\d+(?:[.,]\d+)?$/.test(clean) || /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/.test(clean)) {
      let norm = clean;
      if (norm.includes('.') && norm.includes(',')) {
        norm = norm.replace(/\./g, '').replace(',', '.');
      } else if (norm.includes(',')) {
        norm = norm.replace(',', '.');
      }
      const val = parseFloat(norm);
      return isNaN(val) ? null : val;
    }
    return null;
  };

  // Helper to detect common construction units
  const isCommonUnit = (u: string): boolean => {
    if (!u) return false;
    const norm = u.toLowerCase().trim();
    const common = ['m2', 'm²', 'm3', 'm³', 'ud', 'uds', 'u', 'kg', 'h', 'hr', 'm', 'ml', 'pa', 'l', 't', 'tn', 'pza', 'mes', 'dia', 'km', 'pto'];
    return common.includes(norm) || (norm.length <= 4 && !/^\d+$/.test(norm));
  };

  // 1. Try PrestoWeb JSON format
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      // Format with wrapper: { __prestoweb__: true, type: 'concept', data: { ... } }
      if (parsed && (parsed.__prestoweb__ || parsed.prestoweb_format) && parsed.data?.concepto) {
        return {
          ...parsed.data,
          timestamp: parsed.timestamp || parsed.data.timestamp || Date.now(),
        };
      }
      // Direct CopiedConceptData format: { concepto: { ... }, relacion: { ... } }
      if (parsed && parsed.concepto && parsed.concepto.codigo) {
        return {
          concepto: parsed.concepto,
          relacion: parsed.relacion || {
            hijoCodigo: parsed.concepto.codigo,
            multiplicador: 1,
            cantidadBase: 1,
            cantidad: 1,
            importe: parsed.concepto.precio || 0,
            mediciones: [],
            certificaciones: {},
          },
          subEstructuras: parsed.subEstructuras,
          subConceptos: parsed.subConceptos,
          sourceParentCode: parsed.sourceParentCode || '',
          isCut: Boolean(parsed.isCut),
          timestamp: parsed.timestamp || Date.now(),
        };
      }
      // Simple concept object: { codigo: '...', resumen: '...', precio: ... }
      if (parsed && (parsed.codigo || parsed.code)) {
        const codigo = String(parsed.codigo || parsed.code || 'ITEM').trim();
        const resumen = String(parsed.resumen || parsed.description || parsed.nombre || codigo).trim();
        const unidad = String(parsed.unidad || parsed.unit || 'ud').trim();
        const precio = extractPrice(String(parsed.precio || parsed.price || 0)) ?? 0;
        return {
          concepto: {
            codigo,
            resumen,
            unidad,
            precio,
            fecha: '',
            tipoBC3: '0',
            texto: '',
          },
          relacion: {
            hijoCodigo: codigo,
            multiplicador: 1,
            cantidadBase: 1,
            cantidad: 1,
            importe: precio,
            mediciones: [],
            certificaciones: {},
          },
          sourceParentCode: '',
          isCut: false,
          timestamp: Date.now(),
        };
      }
    } catch {
      // Fall through to other formats
    }
  }

  // 2. Try standard BC3 line: ~C|codigo|unidad|resumen|precio|...
  if (text.includes('~C|')) {
    const cLine = text.split('\n').find((l) => l.startsWith('~C|') || l.includes('~C|'));
    if (cLine) {
      const seg = cLine.substring(cLine.indexOf('~C|') + 3);
      const fields = seg.split('|');
      const codigo = (fields[0] || '').replace(/#+$/, '').trim();
      const unidad = (fields[1] || '').trim();
      const resumen = (fields[2] || '').trim();
      const precio = extractPrice(fields[3] || '0') ?? 0;

      if (codigo) {
        const concepto: Concepto = {
          codigo,
          unidad,
          resumen: resumen || codigo,
          precio,
          fecha: fields[4] || '',
          tipoBC3: fields[5] || '0',
          texto: '',
        };
        const relacion: RelacionEstructura = {
          hijoCodigo: codigo,
          multiplicador: 1,
          cantidadBase: 1,
          cantidad: 1,
          importe: precio,
          mediciones: [],
          certificaciones: {},
        };
        return {
          concepto,
          relacion,
          sourceParentCode: '',
          isCut: false,
          timestamp: Date.now(),
        };
      }
    }
  }

  // 3. Try multi-line key-value format (e.g. Código: ... \n Ud: ... \n Precio: ...)
  if (text.includes('\n')) {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let kvCode = '';
    let kvUnit = '';
    let kvDesc = '';
    let kvPrice: number | null = null;

    for (const l of lines) {
      const codeMatch = l.match(/^(?:c[oó]digo|code|c[oó]d|ref)\s*[:=]\s*(.+)$/i);
      if (codeMatch) kvCode = codeMatch[1].trim();

      const unitMatch = l.match(/^(?:unidad|ud|unit)\s*[:=]\s*(.+)$/i);
      if (unitMatch) kvUnit = unitMatch[1].trim();

      const descMatch = l.match(/^(?:resumen|descripci[oó]n|concepto|t[ií]tulo)\s*[:=]\s*(.+)$/i);
      if (descMatch) kvDesc = descMatch[1].trim();

      const priceMatch = l.match(/^(?:precio|importe|coste|price)\s*[:=]\s*(.+)$/i);
      if (priceMatch) {
        const ep = extractPrice(priceMatch[1]);
        if (ep !== null) kvPrice = ep;
      }
    }

    if (kvCode && (kvDesc || kvPrice !== null)) {
      const code = kvCode;
      const price = kvPrice ?? 0;
      return {
        concepto: {
          codigo: code,
          unidad: kvUnit || 'ud',
          resumen: kvDesc || code,
          precio: price,
          fecha: '',
          tipoBC3: '0',
          texto: '',
        },
        relacion: {
          hijoCodigo: code,
          multiplicador: 1,
          cantidadBase: 1,
          cantidad: 1,
          importe: price,
          mediciones: [],
          certificaciones: {},
        },
        sourceParentCode: '',
        isCut: false,
        timestamp: Date.now(),
      };
    }
  }

  // 4. Try Tab-Separated, Semicolon, or Comma-separated row from web price database or Excel
  if (text.includes('\t') || text.includes(';') || text.includes(',')) {
    const rawLines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const firstLine = rawLines.find((l) => !/^(c[oó]digo|code|c[oó]d|ref|unidad|ud|item)\b/i.test(l)) || rawLines[0];
    const delimiter = text.includes('\t') ? '\t' : (text.includes(';') ? ';' : ',');
    const parts = firstLine.split(delimiter).map((s) => s.trim().replace(/^["']|["']$/g, ''));

    if (parts.length >= 2) {
      let code = '';
      let unit = '';
      let desc = '';
      let price = 0;

      let priceIdx = -1;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = extractPrice(parts[i]);
        if (p !== null) {
          price = p;
          priceIdx = i;
          break;
        }
      }

      let unitIdx = -1;
      for (let i = 0; i < parts.length; i++) {
        if (i !== priceIdx && isCommonUnit(parts[i])) {
          unit = parts[i];
          unitIdx = i;
          break;
        }
      }

      const remainingCols = parts
        .map((val, idx) => ({ val, idx }))
        .filter((item) => item.idx !== priceIdx && item.idx !== unitIdx && item.val.length > 0);

      if (remainingCols.length >= 2) {
        code = remainingCols[0].val;
        const descCol = remainingCols.slice(1).reduce((prev, curr) => (curr.val.length > prev.val.length ? curr : prev));
        desc = descCol.val;
      } else if (remainingCols.length === 1) {
        const singleText = remainingCols[0].val;
        const firstSpace = singleText.indexOf(' ');
        if (firstSpace > 0 && firstSpace < 20) {
          code = singleText.substring(0, firstSpace).trim();
          desc = singleText.substring(firstSpace + 1).trim();
        } else {
          code = singleText;
          desc = singleText;
        }
      }

      if (!code && parts[0]) {
        code = parts[0];
      }

      if (code) {
        return {
          concepto: {
            codigo: code,
            unidad: unit || 'ud',
            resumen: desc || code,
            precio: price,
            fecha: '',
            tipoBC3: '0',
            texto: '',
          },
          relacion: {
            hijoCodigo: code,
            multiplicador: 1,
            cantidadBase: 1,
            cantidad: 1,
            importe: price,
            mediciones: [],
            certificaciones: {},
          },
          sourceParentCode: '',
          isCut: false,
          timestamp: Date.now(),
        };
      }
    }
  }

  // 5. Try single space-separated line with price at the end (e.g. "E01AD010 m2 Demolición de tabique 15,30 €")
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 3) {
    const lastWord = words[words.length - 1];
    const prevWord = words[words.length - 2];
    const priceWithCurrency = lastWord.includes('€') || lastWord.includes('$') || prevWord.includes('€') || prevWord.includes('$');
    const ep = extractPrice(lastWord) ?? (priceWithCurrency ? extractPrice(prevWord) : null);

    if (ep !== null) {
      const price = ep;
      const code = words[0];
      let unit = 'ud';
      let descWords = words.slice(1, lastWord.includes('€') || lastWord.includes('$') ? words.length - 1 : words.length - 1);

      if (words.length >= 4 && isCommonUnit(words[1])) {
        unit = words[1];
        descWords = words.slice(2, words.length - 1);
      }

      const desc = descWords.join(' ');
      if (desc && code) {
        return {
          concepto: {
            codigo: code,
            unidad: unit,
            resumen: desc,
            precio: price,
            fecha: '',
            tipoBC3: '0',
            texto: '',
          },
          relacion: {
            hijoCodigo: code,
            multiplicador: 1,
            cantidadBase: 1,
            cantidad: 1,
            importe: price,
            mediciones: [],
            certificaciones: {},
          },
          sourceParentCode: '',
          isCut: false,
          timestamp: Date.now(),
        };
      }
    }
  }

  return null;
}

/**
 * Copies a concept item to:
 * 1. OS-level System Clipboard via navigator.clipboard.writeText
 * 2. localStorage for cross-window / cross-tab persistence
 * 3. BroadcastChannel for instant inter-tab notify
 * 4. In-memory cache
 */
export async function copyConceptItem(data: CopiedConceptData): Promise<void> {
  const timestamp = Date.now();
  const withTime: CopiedConceptData = { ...data, timestamp };

  inMemoryConceptClipboard = withTime;
  inMemoryConceptTimestamp = timestamp;

  // 1. LocalStorage
  try {
    localStorage.setItem('presto_concept_clipboard', JSON.stringify(withTime));
    localStorage.setItem('presto_clipboard_timestamp', String(timestamp));
  } catch (e) {
    console.warn('Could not write concept to localStorage:', e);
  }

  // 2. BroadcastChannel
  try {
    if (syncChannel) {
      syncChannel.postMessage({ type: 'CONCEPT_COPIED', timestamp, data: withTime });
    }
  } catch {}

  // 3. System Clipboard (OS-level)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      const payload: PrestoClipboardPayload = {
        __prestoweb__: true,
        type: 'concept',
        version: 1,
        timestamp,
        data: withTime,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    }
  } catch (e) {
    console.warn('Could not write concept to system clipboard:', e);
  }
}

/**
 * Reads concept clipboard asynchronously.
 * CRITICAL for cross-window and cross-origin workflows (e.g. two separate windows/tabs or external price bases):
 * 1. Re-syncs from localStorage
 * 2. Attempts to read from navigator.clipboard (OS system clipboard)
 * 3. Returns the newest, most recently copied item!
 */
export async function getConceptClipboardAsync(): Promise<CopiedConceptData | null> {
  let localCandidate: CopiedConceptData | null = null;
  let localTime = 0;

  // Read fresh from localStorage
  try {
    const raw = localStorage.getItem('presto_concept_clipboard');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.concepto) {
        localCandidate = parsed;
        localTime = parsed.timestamp || parseInt(localStorage.getItem('presto_clipboard_timestamp') || '0', 10) || 1;
      }
    }
  } catch {}

  if (!localCandidate && inMemoryConceptClipboard) {
    localCandidate = inMemoryConceptClipboard;
    localTime = inMemoryConceptTimestamp || 1;
  }

  // Read from OS System Clipboard
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const clipText = await navigator.clipboard.readText();
      if (clipText && clipText.trim()) {
        const sysCandidate = parseConceptFromText(clipText);
        if (sysCandidate) {
          const sysTime = sysCandidate.timestamp || Date.now();
          // If system clipboard has a candidate that differs from local candidate or is newer, use it!
          if (!localCandidate || sysCandidate.concepto.codigo !== localCandidate.concepto.codigo || sysTime >= localTime) {
            inMemoryConceptClipboard = sysCandidate;
            inMemoryConceptTimestamp = sysTime;
            try {
              localStorage.setItem('presto_concept_clipboard', JSON.stringify(sysCandidate));
              localStorage.setItem('presto_clipboard_timestamp', String(sysTime));
            } catch {}
            return sysCandidate;
          }
        }
      }
    }
  } catch (e) {
    // navigator.clipboard.readText might be restricted without user focus or permission
  }

  if (localCandidate) {
    inMemoryConceptClipboard = localCandidate;
    inMemoryConceptTimestamp = localTime;
  }

  return localCandidate;
}

/**
 * Synchronous read of concept clipboard from memory and fresh localStorage.
 */
export function getConceptClipboard(): CopiedConceptData | null {
  try {
    const raw = localStorage.getItem('presto_concept_clipboard');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.concepto) {
        const localTime = parsed.timestamp || parseInt(localStorage.getItem('presto_clipboard_timestamp') || '0', 10) || 0;
        if (
          !inMemoryConceptClipboard ||
          parsed.concepto.codigo !== inMemoryConceptClipboard.concepto.codigo ||
          localTime >= inMemoryConceptTimestamp
        ) {
          inMemoryConceptClipboard = parsed;
          inMemoryConceptTimestamp = localTime || Date.now();
        }
      }
    }
  } catch {}

  return inMemoryConceptClipboard;
}

export function hasConceptClipboard(): boolean {
  if (inMemoryConceptClipboard !== null) return true;
  try {
    return !!localStorage.getItem('presto_concept_clipboard');
  } catch {}
  return false;
}

export function clearConceptClipboard(): void {
  inMemoryConceptClipboard = null;
  inMemoryConceptTimestamp = 0;
  try {
    localStorage.removeItem('presto_concept_clipboard');
    localStorage.removeItem('presto_clipboard_timestamp');
  } catch {}
}

export function setConceptClipboardDirectly(data: CopiedConceptData): void {
  const timestamp = data.timestamp || Date.now();
  const withTime = { ...data, timestamp };
  inMemoryConceptClipboard = withTime;
  inMemoryConceptTimestamp = timestamp;
  try {
    localStorage.setItem('presto_concept_clipboard', JSON.stringify(withTime));
    localStorage.setItem('presto_clipboard_timestamp', String(timestamp));
  } catch {}
}

// -----------------------------------------------------------------------------
// Measurement Lines Clipboard (also synchronized across windows & system clipboard)
// -----------------------------------------------------------------------------

export function parseMeasurementLinesFromText(rawText: string): LineaMedicion[] | null {
  if (!rawText || !rawText.trim()) return null;
  const text = rawText.trim();

  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.__prestoweb__ && parsed.type === 'measurements' && Array.isArray(parsed.data)) {
        return parsed.data;
      }
    } catch {}
  }

  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && ('cantidad' in parsed[0] || 'comentario' in parsed[0])) {
        return parsed;
      }
    } catch {}
  }

  return null;
}

export async function copyMeasurementLines(lines: LineaMedicion[]): Promise<void> {
  const timestamp = Date.now();
  const cloned = lines.map((l) => ({
    ...l,
    id: `line_copy_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  }));

  inMemoryMeasurementClipboard = cloned;
  inMemoryMeasurementTimestamp = timestamp;

  try {
    localStorage.setItem('minipresto_clipboard', JSON.stringify(cloned));
    localStorage.setItem('minipresto_clipboard_timestamp', String(timestamp));
  } catch {}

  try {
    if (syncChannel) {
      syncChannel.postMessage({ type: 'MEASUREMENTS_COPIED', timestamp, data: cloned });
    }
  } catch {}

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      const payload: PrestoClipboardPayload = {
        __prestoweb__: true,
        type: 'measurements',
        version: 1,
        timestamp,
        data: cloned,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    }
  } catch (e) {
    console.warn('Could not write measurements to system clipboard:', e);
  }
}

export async function getMeasurementClipboardAsync(): Promise<LineaMedicion[]> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
      const clipText = await navigator.clipboard.readText();
      const parsed = parseMeasurementLinesFromText(clipText);
      if (parsed && parsed.length > 0) {
        inMemoryMeasurementClipboard = parsed;
        inMemoryMeasurementTimestamp = Date.now();
        return parsed.map((l) => ({ ...l }));
      }
    }
  } catch {}

  return getMeasurementClipboard();
}

export function getMeasurementClipboard(): LineaMedicion[] {
  try {
    const raw = localStorage.getItem('minipresto_clipboard');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryMeasurementClipboard = parsed;
      }
    }
  } catch {}

  return inMemoryMeasurementClipboard.map((l) => ({ ...l }));
}

export function hasMeasurementClipboard(): boolean {
  if (inMemoryMeasurementClipboard.length > 0) return true;
  try {
    return !!localStorage.getItem('minipresto_clipboard');
  } catch {}
  return false;
}

export function clearMeasurementClipboard(): void {
  inMemoryMeasurementClipboard = [];
  inMemoryMeasurementTimestamp = 0;
  try {
    localStorage.removeItem('minipresto_clipboard');
    localStorage.removeItem('minipresto_clipboard_timestamp');
  } catch {}
}
