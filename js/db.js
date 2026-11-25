// IndexedDB の薄いラッパー
const DB_NAME = 'mealapp';
const VERSION = 1;
let dbp;

function open() {
  return (dbp ||= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const entries = db.createObjectStore('entries', { keyPath: 'id' });
      entries.createIndex('date', 'date');
      db.createObjectStore('items', { keyPath: 'key' });
      db.createObjectStore('kv', { keyPath: 'k' });
      db.createObjectStore('mensa', { keyPath: 'week' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then((r) => (result = r));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const req2p = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  all: (store) => run(store, 'readonly', (os) => req2p(os.getAll())),
  get: (store, key) => run(store, 'readonly', (os) => req2p(os.get(key))),
  put: (store, value) => run(store, 'readwrite', (os) => { os.put(value); }),
  putMany: (store, values) => run(store, 'readwrite', (os) => { for (const v of values) os.put(v); }),
  del: (store, key) => run(store, 'readwrite', (os) => { os.delete(key); }),
  delMany: (store, keys) => run(store, 'readwrite', (os) => { for (const k of keys) os.delete(k); }),
  async kvGet(k, fallback = null) {
    const r = await this.get('kv', k);
    return r ? r.v : fallback;
  },
  kvSet: (k, v) => run('kv', 'readwrite', (os) => { os.put({ k, v }); }),
};
