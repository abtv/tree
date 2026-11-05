import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchiveWorkerChannel, ArchiveWorkerReply, ArchiveWorkerTask } from './archive-worker-protocol'

const mocks = vi.hoisted(() => ({
  parent: true,
  task: {
    type: 'export',
    snapshotDirectory: 'snapshot',
    attachmentsDirectory: 'images',
    temporaryPath: 'tmp',
  } as ArchiveWorkerTask,
  on: vi.fn(),
  postMessage: vi.fn(),
  export: vi.fn(),
  import: vi.fn(),
}))

vi.mock('node:worker_threads', () => ({
  get parentPort() {
    return mocks.parent ? { on: mocks.on, postMessage: mocks.postMessage } : null
  },
  get workerData() {
    return mocks.task
  },
}))
vi.mock('./desktop-export-job', () => ({ runDesktopExport: mocks.export }))
vi.mock('./desktop-import-job', () => ({ runDesktopImport: mocks.import }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.parent = true
})

describe('archive worker channel', () => {
  it.each(['export', 'import'] as const)('routes %s messages and replies', async (type) => {
    mocks.task =
      type === 'export'
        ? { type, snapshotDirectory: 'snapshot', attachmentsDirectory: 'images', temporaryPath: 'tmp' }
        : { type, archivePath: 'archive.zip', stagingDirectory: 'staging' }

    await import('./archive-worker')

    const job = type === 'export' ? mocks.export : mocks.import
    expect(job).toHaveBeenCalledExactlyOnceWith(mocks.task, expect.any(Object))
    expect(type === 'export' ? mocks.import : mocks.export).not.toHaveBeenCalled()
    expect(mocks.on).toHaveBeenCalledWith('message', expect.any(Function))
    const channel = job.mock.calls[0]![1] as ArchiveWorkerChannel
    const reply = mocks.on.mock.calls[0]![1] as (value: ArchiveWorkerReply) => void
    expect(() => reply({ type: 'pinned' })).not.toThrow()
    channel.post({ type: 'progress', imagesDone: 0, imageCount: 1 })
    expect(mocks.postMessage).toHaveBeenLastCalledWith({ type: 'progress', imagesDone: 0, imageCount: 1 })

    const first = channel.request({ type: 'pin', ids: ['image'] })
    expect(mocks.postMessage).toHaveBeenLastCalledWith({ type: 'pin', ids: ['image'] })
    reply({ type: 'pinned' })
    await expect(first).resolves.toEqual({ type: 'pinned' })

    const second = channel.request({ type: 'staged' })
    expect(mocks.postMessage).toHaveBeenLastCalledWith({ type: 'staged' })
    reply({ type: 'count', snapshotDirectory: 'current' })
    await expect(second).resolves.toEqual({ type: 'count', snapshotDirectory: 'current' })
  })

  it('rejects execution outside a worker before dispatching a job', async () => {
    mocks.parent = false

    await expect(import('./archive-worker')).rejects.toThrow('The notes archive worker must run in a worker thread.')

    expect(mocks.export).not.toHaveBeenCalled()
    expect(mocks.import).not.toHaveBeenCalled()
  })
})
