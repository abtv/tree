import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  read: vi.fn(),
  destination: vi.fn(),
  start: vi.fn(),
  saved: vi.fn(),
  stop: vi.fn(),
}))
vi.mock('../storage-schema', () => ({
  BLOB_STORE: 'blobs',
  DOCUMENT_STORE: 'document',
  HEAD_KEY: 'head',
  openDatabase: mocks.open,
  readValue: mocks.read,
}))
vi.mock('../backup/folder-destination', () => ({ folderDestination: mocks.destination }))
vi.mock('../../application/folder-backup', () => ({ startFolderBackup: mocks.start }))

async function fixture() {
  const db = { close: vi.fn(), onversionchange: undefined as (() => void) | undefined }
  mocks.open.mockResolvedValue(db)
  mocks.start.mockReturnValue({ saved: mocks.saved, stop: mocks.stop })
  const scope = {
    onmessage: undefined as undefined | ((event: { data: unknown }) => Promise<void>),
    postMessage: vi.fn(),
  }
  vi.stubGlobal('self', scope)
  await import('./backup.worker')
  return { db, scope, send: (data: unknown) => scope.onmessage!({ data }) }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('browser backup worker wiring', () => {
  it('starts once, reads the saved head and images, and closes on a storage version change', async () => {
    const f = await fixture()
    const folder = { name: 'backup' }
    const destination = {}
    mocks.destination.mockReturnValue(destination)

    await f.send({ type: 'start', folder })
    await f.send({ type: 'start', folder })
    await f.send({ type: 'unknown' })
    await f.send(null)

    expect(mocks.open).toHaveBeenCalledOnce()
    expect(mocks.saved).not.toHaveBeenCalled()
    expect(mocks.destination).toHaveBeenCalledExactlyOnceWith(folder)
    const [source, target, , notify] = mocks.start.mock.calls[0]!
    expect(target).toBe(destination)
    await source.readHead()
    await source.readImage('image')
    expect(mocks.read.mock.calls).toEqual([
      [f.db, 'document', 'head'],
      [f.db, 'blobs', 'image'],
    ])
    notify({ state: 'writing' })
    notify({ state: 'saved', missingImages: 2 })
    notify({ state: 'failed', error: new DOMException('full', 'QuotaExceededError') })
    expect(f.scope.postMessage.mock.calls).toEqual([
      [{ state: 'writing' }],
      [{ state: 'saved', missingImages: 2 }],
      [{ state: 'failed', kind: 'quota', message: 'full' }],
    ])

    f.db.onversionchange!()

    expect(mocks.stop).toHaveBeenCalledOnce()
    expect(f.db.close).toHaveBeenCalledOnce()
  })

  it('coalesces saved messages during startup and forwards later saves', async () => {
    const f = await fixture()
    let opened!: (db: typeof f.db) => void
    mocks.open.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          opened = resolve
        }),
    )
    const starting = f.send({ type: 'start', folder: {} })

    await f.send({ type: 'saved' })
    await f.send({ type: 'saved' })
    await f.send({ type: 'start', folder: {} })
    expect(mocks.saved).not.toHaveBeenCalled()
    opened(f.db)
    await starting

    expect(mocks.open).toHaveBeenCalledOnce()
    expect(mocks.saved).toHaveBeenCalledOnce()
    await f.send({ type: 'saved' })
    expect(mocks.saved).toHaveBeenCalledTimes(2)
  })

  it('reports startup failure and allows another start', async () => {
    const f = await fixture()
    mocks.open.mockRejectedValueOnce(new Error('storage denied'))

    await f.send({ type: 'start', folder: {} })

    expect(f.scope.postMessage).toHaveBeenCalledExactlyOnceWith({ state: 'stopped', message: 'storage denied' })
    await f.send({ type: 'start', folder: {} })
    expect(mocks.start).toHaveBeenCalledOnce()
  })

  it('passes a working cancelable scheduler to the backup policy', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    await f.send({ type: 'start', folder: {} })
    const scheduler = mocks.start.mock.calls[0]![2]
    const run = vi.fn()

    const handle = scheduler.setTimeout(run, 100)
    vi.advanceTimersByTime(99)
    expect(run).not.toHaveBeenCalled()
    scheduler.clearTimeout(handle)
    vi.advanceTimersByTime(1)
    expect(run).not.toHaveBeenCalled()
    scheduler.setTimeout(run, 10)
    vi.advanceTimersByTime(10)
    expect(run).toHaveBeenCalledOnce()
    expect(scheduler.now()).toBe(performance.now())
  })
})
