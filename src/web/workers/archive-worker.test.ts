import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  read: vi.fn(),
  commit: vi.fn(),
  discard: vi.fn(),
  stage: vi.fn(),
  export: vi.fn(),
  createImport: vi.fn(),
  prepare: vi.fn(),
  importCommit: vi.fn(),
  validate: vi.fn(),
  folderSource: vi.fn(),
  blobFile: vi.fn(),
}))
vi.mock('../storage-schema', () => ({
  BLOB_STORE: 'blobs',
  DOCUMENT_STORE: 'document',
  HEAD_KEY: 'head',
  openDatabase: mocks.open,
  readValue: mocks.read,
  commitImportedHead: mocks.commit,
  discardStagedImages: mocks.discard,
  stageImage: mocks.stage,
}))
vi.mock('../archive/export-job', () => ({ runExportJob: mocks.export }))
vi.mock('../archive/import-job', () => ({ createImportJob: mocks.createImport }))
vi.mock('../archive/blob-archive-file', () => ({ blobArchiveFile: mocks.blobFile }))
vi.mock('../archive/folder-source', () => ({ folderSource: mocks.folderSource }))
vi.mock('../attachment-validation', () => ({ validatePngAttachment: mocks.validate }))

async function fixture() {
  const db = { close: vi.fn() }
  mocks.open.mockResolvedValue(db)
  mocks.createImport.mockReturnValue({ prepare: mocks.prepare, commit: mocks.importCommit })
  const scope = {
    onmessage: undefined as undefined | ((event: { data: unknown }) => Promise<void>),
    postMessage: vi.fn(),
  }
  vi.stubGlobal('self', scope)
  await import('./archive.worker')
  return { db, scope, send: (data: unknown) => scope.onmessage!({ data }) }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
})
afterEach(() => vi.unstubAllGlobals())

describe('browser archive worker wiring', () => {
  it('ignores unknown requests and a commit without a prepared import', async () => {
    const f = await fixture()

    await f.send(null)
    await f.send({ type: 'unrelated' })
    await f.send({ type: 'commit-import' })

    expect(mocks.open).not.toHaveBeenCalled()
    expect(mocks.importCommit).not.toHaveBeenCalled()
  })

  it.each(['export', 'import', 'restore'])('reports storage opening errors for %s', async (type) => {
    const f = await fixture()
    mocks.open.mockRejectedValueOnce(new Error('denied'))

    await f.send({ type })

    expect(f.scope.postMessage).toHaveBeenCalledExactlyOnceWith(
      {
        type: 'error',
        message:
          type === 'export'
            ? 'The notes could not be read: denied'
            : type === 'restore'
              ? 'The notes could not be restored: denied'
              : 'The archive could not be imported: denied',
      },
      [],
    )
    expect(mocks.export).not.toHaveBeenCalled()
    expect(mocks.createImport).not.toHaveBeenCalled()
  })

  it.each([false, true])('closes the export database on success or failure (failure=%s)', async (fails) => {
    const f = await fixture()
    const error = new Error('export failed')
    mocks.export.mockImplementationOnce(async (source, post) => {
      await source.readHead()
      await source.readImage('image')
      const chunk = new ArrayBuffer(2)
      post({ type: 'chunk', chunk }, [chunk])
      if (fails) throw error
    })

    const result = f.send({ type: 'export' })
    if (fails) await expect(result).rejects.toBe(error)
    else await result

    expect(mocks.read.mock.calls).toEqual([
      [f.db, 'document', 'head'],
      [f.db, 'blobs', 'image'],
    ])
    const [message, transfer] = f.scope.postMessage.mock.calls[0]!
    expect(transfer).toEqual([message.chunk])
    expect(f.db.close).toHaveBeenCalledOnce()
  })

  it.each(['import', 'restore'] as const)('wires %s staging and commits without reopening storage', async (type) => {
    const f = await fixture()
    const file = new Blob(['zip'])
    const folder = { name: 'backup' }
    const source = { source: type }
    mocks.blobFile.mockReturnValueOnce(source)
    mocks.folderSource.mockReturnValueOnce(source)

    await f.send({ type, file, folder })

    expect(type === 'import' ? mocks.blobFile : mocks.folderSource).toHaveBeenCalledWith(
      type === 'import' ? file : folder,
    )
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(source)
    const [ports, validate, post] = mocks.createImport.mock.calls[0]!
    const bytes = new Uint8Array([1])
    const head = { version: 1 }
    await ports.readHead()
    await ports.readImage('id')
    await ports.writeHead(head)
    await ports.writeImage('id', bytes)
    await ports.removeImages()
    post({ type: 'committed' })
    await f.send({ type: 'commit-import' })

    expect(validate).toBe(mocks.validate)
    expect(mocks.read.mock.calls).toEqual([
      [f.db, 'document', 'head'],
      [f.db, 'blobs', 'id'],
    ])
    expect(mocks.commit).toHaveBeenCalledExactlyOnceWith(f.db, head)
    expect(mocks.stage).toHaveBeenCalledExactlyOnceWith(f.db, 'id', bytes)
    expect(mocks.discard).toHaveBeenCalledExactlyOnceWith(f.db)
    expect(f.scope.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'committed' }, [])
    expect(mocks.importCommit).toHaveBeenCalledOnce()
    expect(mocks.open).toHaveBeenCalledOnce()
    expect(f.db.close).not.toHaveBeenCalled()
  })
})
