import { RawDataset } from '../types/game';

const DB_NAME = 'pitchcommand_fm_datasets';
const STORE_NAME = 'datasets';
const CUSTOM_KEY = 'custom_base_v1';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Erro ao abrir IndexedDB'));
  });
}

export async function saveCustomBaseDataset(dataset: RawDataset): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(dataset, CUSTOM_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadCustomBaseDataset(): Promise<RawDataset | null> {
  try {
    const db = await openDb();
    const res = await new Promise<RawDataset | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(CUSTOM_KEY);
      req.onsuccess = () => resolve((req.result as RawDataset) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return res && Array.isArray(res.players) && res.players.length > 0 ? res : null;
  } catch {
    return null;
  }
}

export async function clearCustomBaseDataset(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(CUSTOM_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore cleanup failures
  }
}
