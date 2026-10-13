import { ProyectoBC3, ImportDiagnostics } from '../types/bc3';
import { detectAndDecodeText } from './encodingDetector';
import { parseBC3 } from './bc3Parser';

export interface ParseProgressCallback {
  (percent: number, message: string): void;
}

/**
 * Parses a BC3 File or ArrayBuffer off the main UI thread using a Web Worker.
 * Displays real-time progress percentages and status messages.
 * Includes graceful fallback to the main thread if Web Workers are restricted by the browser context.
 */
export async function parseBC3FileWithWorker(
  fileOrBuffer: File | ArrayBuffer,
  fileName: string = 'archivo.bc3',
  onProgress?: ParseProgressCallback
): Promise<{ project: ProyectoBC3; diagnostics: ImportDiagnostics }> {
  let buffer: ArrayBuffer;
  if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = fileOrBuffer;
  } else {
    onProgress?.(2, 'Leyendo datos del archivo en memoria...');
    buffer = await fileOrBuffer.arrayBuffer();
  }

  // Attempt Web Worker first
  if (typeof Worker !== 'undefined') {
    try {
      return await new Promise((resolve, reject) => {
        // Instantiate Worker using Vite's standard module worker syntax
        const worker = new Worker(new URL('../workers/bc3Worker.ts', import.meta.url), {
          type: 'module',
        });

        const cleanup = () => {
          worker.terminate();
        };

        worker.onmessage = (e: MessageEvent) => {
          const msg = e.data;
          if (!msg) return;

          if (msg.type === 'PROGRESS') {
            onProgress?.(msg.percent, msg.message);
          } else if (msg.type === 'SUCCESS') {
            cleanup();
            resolve({ project: msg.project, diagnostics: msg.diagnostics });
          } else if (msg.type === 'ERROR') {
            cleanup();
            reject(new Error(msg.error));
          }
        };

        worker.onerror = (err) => {
          cleanup();
          reject(err);
        };

        // Transfer array buffer or post message
        try {
          worker.postMessage({ type: 'PARSE_FILE', buffer, fileName }, [buffer]);
        } catch {
          // In case transfer fails in some browser environments, post by copy
          worker.postMessage({ type: 'PARSE_FILE', buffer, fileName });
        }
      });
    } catch (workerErr) {
      console.warn('Web Worker failed, falling back to main-thread parser:', workerErr);
    }
  }

  // Fallback to main thread
  onProgress?.(10, 'Analizando codificación (fallback)...');
  const { text, encoding } = detectAndDecodeText(buffer);
  onProgress?.(30, `Codificación detectada: ${encoding}...`);
  const result = parseBC3(text, encoding, onProgress);
  onProgress?.(100, 'Completado');
  return result;
}
