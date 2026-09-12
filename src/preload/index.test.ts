import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcChannels, type TreeApi } from '../shared/ipc'

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    removeListener: mocks.removeListener,
  },
}))

describe('preload bridge', () => {
  beforeAll(async () => {
    await import('../preload/index')
  })

  beforeEach(() => {
    mocks.invoke.mockClear()
  })

  it('forwards the quit handshake request ID to the main process', async () => {
    const { treeApi } = await import('../preload/index')

    await treeApi.quit('request-1')

    expect(mocks.invoke).toHaveBeenCalledWith(ipcChannels.quit, 'request-1')
  })

  it('forwards every request channel and argument', async () => {
    const { treeApi } = (await import('../preload/index')) as { treeApi: TreeApi }
    const state = {
      version: 1 as const,
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }
    const payload = { text: 'text', html: '<p>text</p>' }
    const bytes = new Uint8Array([1, 2, 3])

    await treeApi.load()
    await treeApi.save(state)
    await treeApi.readClipboard()
    await treeApi.writeClipboard?.(payload)
    await treeApi.writeAttachment('attachment-1', bytes)
    await treeApi.hasAttachment('attachment-1')
    await treeApi.readAttachment('attachment-1')
    await treeApi.cleanupAttachments(['attachment-1'])

    expect(mocks.invoke.mock.calls).toEqual([
      [ipcChannels.load],
      [ipcChannels.save, state],
      [ipcChannels.readClipboard],
      [ipcChannels.writeClipboard, payload],
      [ipcChannels.writeAttachment, 'attachment-1', bytes],
      [ipcChannels.hasAttachment, 'attachment-1'],
      [ipcChannels.readAttachment, 'attachment-1'],
      [ipcChannels.cleanupAttachments, ['attachment-1']],
    ])
  })

  it('registers and removes quit event listeners', async () => {
    const { treeApi } = (await import('../preload/index')) as { treeApi: TreeApi }
    const requested = vi.fn()
    const failed = vi.fn()

    const removeRequested = treeApi.onQuitRequested(requested)
    const removeFailed = treeApi.onQuitFailed(failed)
    const requestedHandler = mocks.on.mock.calls[0]?.[1] as (event: unknown, requestId: string) => void
    const failedHandler = mocks.on.mock.calls[1]?.[1] as (event: unknown, message: string) => void
    requestedHandler({}, 'request-1')
    failedHandler({}, 'quit failed')
    removeRequested()
    removeFailed()

    expect(requested).toHaveBeenCalledWith('request-1')
    expect(failed).toHaveBeenCalledWith('quit failed')
    expect(mocks.removeListener).toHaveBeenCalledWith('tree:quit-requested', requestedHandler)
    expect(mocks.removeListener).toHaveBeenCalledWith('tree:quit-failed', failedHandler)
  })

  it('preserves rejected IPC promises', async () => {
    const { treeApi } = (await import('../preload/index')) as { treeApi: TreeApi }
    mocks.invoke.mockRejectedValueOnce(new Error('save failed'))

    await expect(treeApi.load()).rejects.toThrow('save failed')
  })
})
