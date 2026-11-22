import type { Board, ThemePreference } from '../types/canvas';

const DB_NAME = 'vellum-canvas-db';
const DB_VERSION = 1;
const STORE_BOARDS = 'boards';
const STORE_META = 'meta';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BOARDS)) {
        db.createObjectStore(STORE_BOARDS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
  return dbPromise;
}

export async function loadAllBoards(): Promise<Board[]> {
  try {
    const db = await openDatabase();
    return await new Promise<Board[]>((resolve, reject) => {
      const tx = db.transaction(STORE_BOARDS, 'readonly');
      const store = tx.objectStore(STORE_BOARDS);
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result as Board[]) ?? [];
        list.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function saveBoard(board: Board): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BOARDS, 'readwrite');
      tx.objectStore(STORE_BOARDS).put(board);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Graceful silent fallback if storage quota or private mode blocks IDB
  }
}

export async function deleteBoardFromDb(boardId: string): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_BOARDS, 'readwrite');
      tx.objectStore(STORE_BOARDS).delete(boardId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export async function getMetaValue<T>(key: string, fallback: T): Promise<T> {
  try {
    const db = await openDatabase();
    return await new Promise<T>((resolve) => {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => {
        resolve(req.result ? (req.result.value as T) : fallback);
      };
      req.onerror = () => resolve(fallback);
    });
  } catch {
    return fallback;
  }
}

export async function setMetaValue<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore
  }
}

export function loadThemePref(): ThemePreference {
  try {
    const raw = localStorage.getItem('vellum-theme');
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // ignore
  }
  return 'system';
}

export function saveThemePref(pref: ThemePreference): void {
  try {
    localStorage.setItem('vellum-theme', pref);
  } catch {
    // ignore
  }
}
