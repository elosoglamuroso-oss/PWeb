import { detectAndDecodeText } from '../utils/encodingDetector';
import { parseBC3 } from '../utils/bc3Parser';

export interface WorkerParseRequest {
  type: 'PARSE_FILE';
  buffer: ArrayBuffer;
  fileName?: string;
}

export type WorkerMessage =
  | { type: 'PROGRESS'; percent: number; message: string }
  | { type: 'SUCCESS'; project: any; diagnostics: any }
  | { type: 'ERROR'; error: string };

self.onmessage = (event: MessageEvent<WorkerParseRequest>) => {
  const data = event.data;
  if (!data || data.type !== 'PARSE_FILE') return;

  try {
    self.postMessage({
      type: 'PROGRESS',
      percent: 5,
      message: 'Analizando codificación del archivo (UTF-8 / Windows-1252 / BOM)...',
    });

    const { text, encoding } = detectAndDecodeText(data.buffer);

    self.postMessage({
      type: 'PROGRESS',
      percent: 15,
      message: `Codificación detectada: ${encoding}. Iniciando análisis sintáctico FIEBDC-3...`,
    });

    const { project, diagnostics } = parseBC3(text, encoding, (percent, message) => {
      // Map parser progress (0 - 100) to overall progress (15 - 95)
      const scaledPct = Math.round(15 + (percent * 0.8));
      self.postMessage({
        type: 'PROGRESS',
        percent: scaledPct,
        message,
      });
    });

    self.postMessage({
      type: 'PROGRESS',
      percent: 100,
      message: 'Presupuesto procesado con éxito.',
    });

    self.postMessage({
      type: 'SUCCESS',
      project,
      diagnostics,
    });
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      error: err?.message || String(err),
    });
  }
};
