/*
KV store abstraction — ported from upstream `apps/web/src/interfaces/key-value.ts`
(GPL-3.0). `IndexedDBKVStore` is the production store (Electron renderer has
IndexedDB); `MemoryKVStore` is the test/fallback store. The upstream
`LocalStorageKVStore` (which depends on a `Config` util) is dropped — IndexedDB
is always available in the renderer, and tests use Memory.
*/
export interface IKVStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  setMany(entries: [string, unknown][]): Promise<void>;
  getMany<T>(keys: string[]): Promise<[string, T][]>;
  delete(key: string): Promise<void>;
  deleteMany(keys: string[]): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  values<T>(): Promise<T[]>;
  entries<T>(): Promise<[string, T][]>;
}

export class MemoryKVStore implements IKVStore {
  private storage: Record<string, unknown> = {};
  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.storage[key] as T | undefined);
  }
  set(key: string, value: unknown): Promise<void> {
    this.storage[key] = value;
    return Promise.resolve();
  }
  setMany(entries: [string, unknown][]): Promise<void> {
    for (const [k, v] of entries) this.storage[k] = v;
    return Promise.resolve();
  }
  getMany<T>(keys: string[]): Promise<[string, T][]> {
    return Promise.resolve(keys.map((k) => [k, this.storage[k] as T] as [string, T]));
  }
  delete(key: string): Promise<void> {
    delete this.storage[key];
    return Promise.resolve();
  }
  deleteMany(keys: string[]): Promise<void> {
    for (const k of keys) delete this.storage[k];
    return Promise.resolve();
  }
  clear(): Promise<void> {
    this.storage = {};
    return Promise.resolve();
  }
  keys(): Promise<string[]> {
    return Promise.resolve(Object.keys(this.storage));
  }
  values<T>(): Promise<T[]> {
    return Promise.resolve(Object.values(this.storage) as T[]);
  }
  entries<T>(): Promise<[string, T][]> {
    return Promise.resolve(Object.entries(this.storage) as [string, T][]);
  }
}

export type UseStore = <T>(
  txMode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => T | PromiseLike<T>
) => Promise<T>;

export class IndexedDBKVStore implements IKVStore {
  store: UseStore;

  constructor(databaseName: string, storeName: string) {
    this.store = this.createStore(databaseName, storeName);
  }

  private createStore(dbName: string, storeName: string): UseStore {
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    const dbp = promisifyIDBRequest(request);

    return (txMode, callback) =>
      dbp.then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
  }

  private eachCursor(store: IDBObjectStore, callback: (cursor: IDBCursorWithValue) => void): Promise<void> {
    store.openCursor().onsuccess = function () {
      if (!this.result) return;
      callback(this.result as IDBCursorWithValue);
      (this.result as IDBCursorWithValue).continue();
    };
    return promisifyIDBRequest(store.transaction);
  }

  get<T>(key: string): Promise<T | undefined> {
    return this.store("readonly", (store) => promisifyIDBRequest(store.get(key)));
  }

  set(key: string, value: unknown): Promise<void> {
    return this.store("readwrite", (store) => {
      store.put(value, key);
      return promisifyIDBRequest(store.transaction);
    });
  }

  setMany(entries: [string, unknown][]): Promise<void> {
    return this.store("readwrite", (store) => {
      for (const [k, v] of entries) store.put(v, k);
      return promisifyIDBRequest(store.transaction);
    });
  }

  getMany<T>(keys: string[]): Promise<[string, T][]> {
    return this.store("readonly", (store) =>
      Promise.all(
        keys.map(async (key) => [key, (await promisifyIDBRequest(store.get(key))) as T] as [string, T])
      )
    );
  }

  delete(key: string): Promise<void> {
    return this.store("readwrite", (store) => {
      store.delete(key);
      return promisifyIDBRequest(store.transaction);
    });
  }

  deleteMany(keys: string[]): Promise<void> {
    return this.store("readwrite", (store) => {
      for (const k of keys) store.delete(k);
      return promisifyIDBRequest(store.transaction);
    });
  }

  clear(): Promise<void> {
    return this.store("readwrite", (store) => {
      store.clear();
      return promisifyIDBRequest(store.transaction);
    });
  }

  keys(): Promise<string[]> {
    return this.store("readonly", (store) =>
      promisifyIDBRequest(store.getAllKeys() as unknown as IDBRequest<string[]>)
    );
  }

  values<T>(): Promise<T[]> {
    return this.store("readonly", (store) => promisifyIDBRequest(store.getAll() as IDBRequest<T[]>));
  }

  entries<T>(): Promise<[string, T][]> {
    return this.store("readonly", (store) =>
      Promise.all([
        promisifyIDBRequest(store.getAllKeys() as unknown as IDBRequest<string[]>),
        promisifyIDBRequest(store.getAll() as IDBRequest<T[]>)
      ]).then(([ks, vs]) => ks.map((k, i) => [k, vs[i] as T] as [string, T]))
    );
  }
}

function promisifyIDBRequest<T = undefined>(request: IDBRequest<T> | IDBTransaction): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    // A request has onsuccess/onerror/result; a transaction has
    // oncomplete/onabort. The same helper promisifies either (upstream uses
    // @ts-ignore for the same reason).
    const r = request as unknown as IDBRequest<T> & {
      oncomplete: ((ev: Event) => void) | null;
      onabort: ((ev: Event) => void) | null;
    };
    r.oncomplete = r.onsuccess = () => resolve(r.result);
    r.onabort = r.onerror = () => reject(r.error);
  });
}