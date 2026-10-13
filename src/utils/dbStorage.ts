import { ProyectoBC3 } from '../types/bc3';

const DB_NAME = 'PrestoWeb_DB';
const DB_VERSION = 1;
const STORE_NAME = 'project_store';
const KEY_ACTIVE_PROJECT = 'active_project';
const KEY_SAVED_AT = 'last_saved_timestamp';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB no está disponible en este entorno.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error || new Error('Error al abrir IndexedDB'));
    };
  });
}

/**
 * Persists the entire project into IndexedDB asynchronously without blocking the UI.
 */
export async function saveProjectToDB(project: ProyectoBC3): Promise<number> {
  try {
    const db = await openDatabase();
    const timestamp = Date.now();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      store.put(project, KEY_ACTIVE_PROJECT);
      store.put(timestamp, KEY_SAVED_AT);

      transaction.oncomplete = () => {
        resolve(timestamp);
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error('Error guardando en IndexedDB'));
      };
    });
  } catch (err) {
    console.error('Error al guardar en IndexedDB:', err);
    throw err;
  }
}

/**
 * Retrieves the persisted project from IndexedDB if available.
 */
export async function loadProjectFromDB(): Promise<{ project: ProyectoBC3; savedAt: number } | null> {
  try {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);

      const projectReq = store.get(KEY_ACTIVE_PROJECT);
      const timestampReq = store.get(KEY_SAVED_AT);

      transaction.oncomplete = () => {
        const project = projectReq.result as ProyectoBC3 | undefined;
        const savedAt = (timestampReq.result as number) || Date.now();

        if (project && project.conceptos && project.estructuras && project.codigoRaiz) {
          resolve({ project, savedAt });
        } else {
          resolve(null);
        }
      };

      transaction.onerror = () => {
        reject(transaction.error || new Error('Error leyendo de IndexedDB'));
      };
    });
  } catch (err) {
    console.warn('No se pudo recuperar el proyecto de IndexedDB:', err);
    return null;
  }
}

/**
 * Clears the active project from IndexedDB (e.g. when creating a new empty project)
 */
export async function clearProjectInDB(): Promise<void> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.delete(KEY_ACTIVE_PROJECT);
      store.delete(KEY_SAVED_AT);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Error clearing IndexedDB:', err);
  }
}
