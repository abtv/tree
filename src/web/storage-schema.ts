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

// An import journals each image it stores under this preference-key prefix, in the same
// transaction as the image, until the import replaces the head or its images are removed. A
// journal left by a closed tab or a crash names images that no stored head references.
const STAGED_IMAGE_PREFIX = 'import-staged:'
const stagedImageKeys = IDBKeyRange.bound(STAGED_IMAGE_PREFIX, `${STAGED_IMAGE_PREFIX}￿`)

function complete(tx: IDBTransaction, failure: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error(failure))
  })
}

/** Stores an imported image together with its journal entry. */
export function stageImage(db: IDBDatabase, id: string, bytes: Uint8Array): Promise<void> {
  const tx = db.transaction([BLOB_STORE, PREFERENCE_STORE], 'readwrite', { durability: 'strict' })
  tx.objectStore(BLOB_STORE).put(bytes, id)
  tx.objectStore(PREFERENCE_STORE).put(true, STAGED_IMAGE_PREFIX + id)
  return complete(tx, 'Local save failed.')
}

/** Replaces the head with an imported document and ends the journal in one transaction. */
export function commitImportedHead(db: IDBDatabase, head: unknown): Promise<void> {
  const tx = db.transaction([DOCUMENT_STORE, PREFERENCE_STORE], 'readwrite', { durability: 'strict' })
  tx.objectStore(DOCUMENT_STORE).put(head, HEAD_KEY)
  tx.objectStore(PREFERENCE_STORE).delete(stagedImageKeys)
  return complete(tx, 'Local save failed.')
}

/** Removes every journaled image of an unfinished import, and the journal, in one transaction. */
export function discardStagedImages(db: IDBDatabase): Promise<void> {
  const tx = db.transaction([BLOB_STORE, PREFERENCE_STORE], 'readwrite', { durability: 'strict' })
  const journal = tx.objectStore(PREFERENCE_STORE)
  const keys = journal.getAllKeys(stagedImageKeys)
  keys.onsuccess = () => {
    for (const key of keys.result) tx.objectStore(BLOB_STORE).delete(String(key).slice(STAGED_IMAGE_PREFIX.length))
    journal.delete(stagedImageKeys)
  }
  return complete(tx, 'Local storage could not be changed.')
}

/** Discards the images of an import that a closed tab or crash left unfinished; reads only when there are none. */
export async function sweepStagedImages(db: IDBDatabase): Promise<void> {
  const count = await new Promise<number>((resolve, reject) => {
    const request = db.transaction(PREFERENCE_STORE).objectStore(PREFERENCE_STORE).count(stagedImageKeys)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  if (count > 0) await discardStagedImages(db)
}

export function readValue<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store)
    const value = tx.objectStore(store).get(key)
    tx.oncomplete = () => resolve(value.result)
    tx.onabort = () => reject(tx.error)
  })
}
