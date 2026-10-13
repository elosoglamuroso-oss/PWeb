/**
 * Encoding detector for BC3 / FIEBDC files.
 * Accurately detects UTF-8 (with or without BOM), UTF-16 LE/BE, and falls back to windows-1252 / ISO-8859-1.
 */

export interface DetectedTextResult {
  text: string;
  encoding: string;
  hasBom: boolean;
}

export function detectAndDecodeText(buffer: ArrayBuffer): DetectedTextResult {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;

  if (len === 0) {
    return { text: '', encoding: 'utf-8', hasBom: false };
  }

  // 1. Check for UTF-8 BOM (EF BB BF)
  if (len >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(bytes.subarray(3));
    return { text, encoding: 'UTF-8 (BOM)', hasBom: true };
  }

  // 2. Check for UTF-16 LE BOM (FF FE)
  if (len >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    const decoder = new TextDecoder('utf-16le');
    const text = decoder.decode(bytes.subarray(2));
    return { text, encoding: 'UTF-16 LE', hasBom: true };
  }

  // 3. Check for UTF-16 BE BOM (FE FF)
  if (len >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const decoder = new TextDecoder('utf-16be');
    const text = decoder.decode(bytes.subarray(2));
    return { text, encoding: 'UTF-16 BE', hasBom: true };
  }

  // 4. Try UTF-8 with fatal: true to strictly check byte validity
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    const text = utf8Decoder.decode(bytes);
    
    // Additional heuristic: if text contains ~V or ~C and no common mojibake sequences
    return { text, encoding: 'UTF-8', hasBom: false };
  } catch {
    // If fatal UTF-8 fails, bytes contain non-UTF8 sequences (e.g. 0xE1 for 'á', 0xF1 for 'ñ')
    // Fall back to windows-1252 / ANSI
  }

  // 5. Windows-1252 / ANSI fallback
  try {
    const win1252Decoder = new TextDecoder('windows-1252');
    const text = win1252Decoder.decode(bytes);
    return { text, encoding: 'windows-1252 (ANSI)', hasBom: false };
  } catch {
    // Fallback if windows-1252 is not implemented in the JS engine
    const isoDecoder = new TextDecoder('iso-8859-1');
    const text = isoDecoder.decode(bytes);
    return { text, encoding: 'ISO-8859-1', hasBom: false };
  }
}
