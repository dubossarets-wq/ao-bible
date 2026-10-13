// Минимальная обёртка над IndexedDB. Если хранилище недоступно (приватный режим,
// запрет сайта, превью), работает в памяти — приложение остаётся рабочим до перезагрузки.

const DB_NAME = 'ao-bible';
const DB_VERSION = 1;
export const STORES = {
  modules: 'modules', // метаданные модулей (keyPath: id)
  bookdata: 'bookdata', // книги переводов: key `${moduleId}|${bookId}`
  payload: 'payload', // словари и параллельные места целиком: key moduleId
};

let dbPromise = null;
let persistent = true;
const memory = { modules: new Map(), bookdata: new Map(), payload: new Map() };

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let r;
    try {
      r = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      persistent = false;
      return resolve(null);
    }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(STORES.modules)) db.createObjectStore(STORES.modules, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORES.bookdata)) db.createObjectStore(STORES.bookdata);
      if (!db.objectStoreNames.contains(STORES.payload)) db.createObjectStore(STORES.payload);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => {
      persistent = false;
      resolve(null);
    };
    r.onblocked = () => {
      persistent = false;
      resolve(null);
    };
  });
  return dbPromise;
}

export async function isPersistent() {
  await open();
  return persistent;
}

export async function get(store, key) {
  const db = await open();
  if (!db) return memory[store].get(key);
  return req(db.transaction(store).objectStore(store).get(key));
}

export async function getAll(store) {
  const db = await open();
  if (!db) return [...memory[store].values()];
  return req(db.transaction(store).objectStore(store).getAll());
}

export async function put(store, value, key) {
  const db = await open();
  if (!db) {
    memory[store].set(key ?? value.id, value);
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await txDone(tx);
}

// Пакетная запись: одна транзакция на весь набор — быстро даже для 66 книг.
export async function putMany(store, items) {
  const db = await open();
  if (!db) {
    for (const [key, value] of items) memory[store].set(key, value);
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const [key, value] of items) os.put(value, key);
  await txDone(tx);
}

export async function del(store, key) {
  const db = await open();
  if (!db) return memory[store].delete(key);
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await txDone(tx);
}

export async function delPrefix(store, prefix) {
  const db = await open();
  if (!db) {
    for (const k of [...memory[store].keys()]) if (String(k).startsWith(prefix)) memory[store].delete(k);
    return;
  }
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(IDBKeyRange.bound(prefix, prefix + '￿'));
  await txDone(tx);
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Транзакция прервана'));
  });
}
