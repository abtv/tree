import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcChannels, ipcEvents, type TreeApi } from '../shared/ipc'

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

  it('forwards the quit-without-saving request to the main process', async () => {
    const { treeApi } = await import('../preload/index')

    await treeApi.quitWithoutSaving()

    expect(mocks.invoke).toHaveBeenCalledWith(ipcChannels.quitWithoutSaving)
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
    await treeApi.readAttachment('attachment-1')
    await treeApi.cleanupAttachments(['attachment-1'])
    await treeApi.getAlwaysOnTop()
    await treeApi.setAlwaysOnTop(true)
    await treeApi.getVimEnabled()
    await treeApi.setVimEnabled(true)

    expect(mocks.invoke.mock.calls).toEqual([
      [ipcChannels.load],
      [ipcChannels.save, state],
      [ipcChannels.readClipboard],
      [ipcChannels.writeClipboard, payload],
      [ipcChannels.writeAttachment, 'attachment-1', bytes],
      [ipcChannels.readAttachment, 'attachment-1'],
      [ipcChannels.cleanupAttachments, ['attachment-1']],
      [ipcChannels.getAlwaysOnTop],
      [ipcChannels.setAlwaysOnTop, true],
      [ipcChannels.getVimEnabled],
      [ipcChannels.setVimEnabled, true],
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

  it('delivers menu-driven preference changes and removes the listeners', async () => {
    const { treeApi } = (await import('../preload/index')) as { treeApi: TreeApi }
    const alwaysOnTop = vi.fn()
    const vimEnabled = vi.fn()
    mocks.on.mockClear()
    mocks.removeListener.mockClear()

    const removeAlwaysOnTop = treeApi.onAlwaysOnTopChanged?.(alwaysOnTop)
    const removeVimEnabled = treeApi.onVimEnabledChanged?.(vimEnabled)
    expect(mocks.on.mock.calls.map((call) => call[0])).toEqual([
      ipcEvents.alwaysOnTopChanged,
      ipcEvents.vimEnabledChanged,
    ])
    const alwaysOnTopHandler = mocks.on.mock.calls[0]?.[1] as (event: unknown, value: boolean) => void
    const vimEnabledHandler = mocks.on.mock.calls[1]?.[1] as (event: unknown, value: boolean) => void
    alwaysOnTopHandler({}, true)
    vimEnabledHandler({}, false)
    removeAlwaysOnTop?.()
    removeVimEnabled?.()

    expect(alwaysOnTop).toHaveBeenCalledExactlyOnceWith(true)
    expect(vimEnabled).toHaveBeenCalledExactlyOnceWith(false)
    expect(mocks.removeListener).toHaveBeenCalledWith(ipcEvents.alwaysOnTopChanged, alwaysOnTopHandler)
    expect(mocks.removeListener).toHaveBeenCalledWith(ipcEvents.vimEnabledChanged, vimEnabledHandler)
  })

  it('preserves rejected IPC promises', async () => {
    const { treeApi } = (await import('../preload/index')) as { treeApi: TreeApi }
    mocks.invoke.mockRejectedValueOnce(new Error('save failed'))

    await expect(treeApi.load()).rejects.toThrow('save failed')
  })
})
