import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  commitImportedHead,
  discardStagedImages,
  openDatabase,
  readValue,
  stageImage,
  sweepStagedImages,
} from './storage-schema'

afterEach(() => vi.unstubAllGlobals())

function fixture() {
  const range = { lower: 'import-staged:', upper: 'import-staged:￿' }
  vi.stubGlobal('IDBKeyRange', { bound: vi.fn(() => range) })
  const request = {
    result: undefined as unknown,
    error: null as unknown,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
  }
  const stores = {
    document: {
      put: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(() => request),
      getAllKeys: vi.fn(() => request),
      count: vi.fn(() => request),
    },
    preferences: {
      put: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(() => request),
      getAllKeys: vi.fn(() => request),
      count: vi.fn(() => request),
    },
    blobs: {
      put: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(() => request),
      getAllKeys: vi.fn(() => request),
      count: vi.fn(() => request),
    },
  }
  const tx = {
    objectStore: vi.fn((name: keyof typeof stores) => stores[name]),
    error: null as Error | null,
    oncomplete: null as (() => void) | null,
    onabort: null as (() => void) | null,
  }
  const database = { transaction: vi.fn(() => tx) }
  return { range, request, stores, tx, database, db: database as unknown as IDBDatabase }
}

describe('browser storage transaction contracts', () => {
  it('opens the established database identity and creates all stores on upgrade', async () => {
    const db = { createObjectStore: vi.fn() }
    const request = { result: db, onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null }
    const open = vi.fn(() => request)
    vi.stubGlobal('indexedDB', { open })

    const result = openDatabase()
    request.onupgradeneeded!()
    request.onsuccess!()

    await expect(result).resolves.toBe(db)
    expect(open).toHaveBeenCalledExactlyOnceWith('tree-browser-prototype', 1)
    expect(db.createObjectStore.mock.calls).toEqual([['document'], ['blobs'], ['preferences']])
  })

  it.each(['error', 'blocked'] as const)('rejects storage opening on %s', async (event) => {
    const failure = new Error('denied')
    const request = { error: failure, onerror: null as (() => void) | null, onblocked: null as (() => void) | null }
    vi.stubGlobal('indexedDB', { open: () => request })
    const result = openDatabase()

    request[event === 'error' ? 'onerror' : 'onblocked']!()

    if (event === 'error') await expect(result).rejects.toBe(failure)
    else await expect(result).rejects.toThrow('Another tab is blocking local storage. Close it and reload.')
  })

  it('journals an imported image atomically and waits for durable transaction completion', async () => {
    const f = fixture()
    const bytes = new Uint8Array([1, 2])
    const completed = vi.fn()
    const pending = stageImage(f.db, 'image', bytes).then(completed)

    expect(f.database.transaction).toHaveBeenCalledExactlyOnceWith(['blobs', 'preferences'], 'readwrite', {
      durability: 'strict',
    })
    expect(f.stores.blobs.put).toHaveBeenCalledExactlyOnceWith(bytes, 'image')
    expect(f.stores.preferences.put).toHaveBeenCalledExactlyOnceWith(true, 'import-staged:image')
    await Promise.resolve()
    expect(completed).not.toHaveBeenCalled()
    f.tx.oncomplete!()
    await pending
    expect(completed).toHaveBeenCalledOnce()
  })

  it('replaces the head and removes journal and recent-node state in the same transaction', async () => {
    const f = fixture()
    const head = { document: 'incoming' }
    const pending = commitImportedHead(f.db, head)

    expect(f.database.transaction).toHaveBeenCalledExactlyOnceWith(['document', 'preferences'], 'readwrite', {
      durability: 'strict',
    })
    expect(f.stores.document.put).toHaveBeenCalledExactlyOnceWith(head, 'head')
    expect(f.stores.preferences.delete.mock.calls).toEqual([['recent-nodes'], [f.range]])
    expect(IDBKeyRange.bound).toHaveBeenCalledWith('import-staged:', 'import-staged:￿')
    f.tx.oncomplete!()
    await pending
  })

  it('discards exactly journaled image IDs before deleting the journal', async () => {
    const f = fixture()
    const pending = discardStagedImages(f.db)
    expect(f.stores.preferences.getAllKeys).toHaveBeenCalledExactlyOnceWith(f.range)
    f.request.result = ['import-staged:one', 'import-staged:two']

    f.request.onsuccess!()
    f.tx.oncomplete!()
    await pending

    expect(f.database.transaction).toHaveBeenCalledExactlyOnceWith(['blobs', 'preferences'], 'readwrite', {
      durability: 'strict',
    })
    expect(f.stores.blobs.delete.mock.calls).toEqual([['one'], ['two']])
    expect(f.stores.preferences.delete).toHaveBeenCalledExactlyOnceWith(f.range)
  })

  it.each([0, 1])('writes only when startup finds %i unfinished images', async (count) => {
    const f = fixture()
    const pending = sweepStagedImages(f.db)
    f.request.result = count
    f.request.onsuccess!()
    await Promise.resolve()

    if (count > 0) {
      expect(f.database.transaction).toHaveBeenCalledTimes(2)
      f.request.result = ['import-staged:one']
      f.request.onsuccess!()
      f.tx.oncomplete!()
    } else expect(f.database.transaction).toHaveBeenCalledExactlyOnceWith('preferences')
    await pending
    expect(f.stores.preferences.count).toHaveBeenCalledExactlyOnceWith(f.range)
  })

  it.each([true, false])('propagates transaction aborts with native error=%s', async (nativeError) => {
    const f = fixture()
    const failure = new Error('quota')
    const pending = stageImage(f.db, 'image', new Uint8Array())
    f.tx.error = nativeError ? failure : null

    f.tx.onabort!()

    if (nativeError) await expect(pending).rejects.toBe(failure)
    else await expect(pending).rejects.toThrow('Local save failed.')
  })

  it('returns reads only when their transaction completes and propagates aborts', async () => {
    const f = fixture()
    const completed = vi.fn()
    const value = { stored: true }
    f.request.result = value
    const pending = readValue(f.db, 'preferences', 'key').then(completed)
    await Promise.resolve()
    expect(completed).not.toHaveBeenCalled()

    f.tx.oncomplete!()
    await pending

    expect(completed).toHaveBeenCalledExactlyOnceWith(value)
    expect(f.stores.preferences.get).toHaveBeenCalledExactlyOnceWith('key')
    const rejected = readValue(f.db, 'preferences', 'key')
    const failure = new Error('aborted')
    f.tx.error = failure
    f.tx.onabort!()
    await expect(rejected).rejects.toBe(failure)
  })

  it('propagates failure to inspect the startup journal', async () => {
    const f = fixture()
    const failure = new Error('read failed')
    const pending = sweepStagedImages(f.db)
    f.request.error = failure

    f.request.onerror!()

    await expect(pending).rejects.toBe(failure)
    expect(f.stores.blobs.delete).not.toHaveBeenCalled()
  })
})
