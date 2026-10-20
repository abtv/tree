// The browser storage identity. PRODUCT §1.4 and src/web/AGENTS.md keep these values
// unchanged: a new name or version would hide or migrate existing notes.
export const DATABASE_NAME = 'tree-browser-prototype'
export const DATABASE_VERSION = 1
export const DOCUMENT_STORE = 'document'
export const BLOB_STORE = 'blobs'
export const PREFERENCE_STORE = 'preferences'
export const HEAD_KEY = 'head'

export function openDatabase(): Promise<IDBDatabase> {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
  request.onupgradeneeded = () => {
    request.result.createObjectStore(DOCUMENT_STORE)
    request.result.createObjectStore(BLOB_STORE)
    request.result.createObjectStore(PREFERENCE_STORE)
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Another tab is blocking local storage. Close it and reload.'))
  })
}

export function readValue<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store)
    const value = tx.objectStore(store).get(key)
    tx.oncomplete = () => resolve(value.result)
    tx.onabort = () => reject(tx.error)
  })
}
