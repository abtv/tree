import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ipcChannels, ipcEvents, type TreeApi } from '../../shared/ipc'

const mocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve()),
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
    await import('./index')
  })

  beforeEach(() => {
    mocks.invoke.mockClear()
  })

  it('forwards the quit handshake request ID to the main process', async () => {
    const { treeApi } = await import('./index')

    await treeApi.quit('request-1')

    expect(mocks.invoke).toHaveBeenCalledWith(ipcChannels.quit, 'request-1')
  })

  it('forwards the quit-without-saving request to the main process', async () => {
    const { treeApi } = await import('./index')

    await treeApi.quitWithoutSaving()

    expect(mocks.invoke).toHaveBeenCalledWith(ipcChannels.quitWithoutSaving)
  })

  it('forwards every request channel and argument', async () => {
    const { treeApi } = (await import('./index')) as { treeApi: TreeApi }
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
    await treeApi.writeClipboardContent?.({ kind: 'text', text: 'plain' })
    await treeApi.writeClipboardContent?.({ kind: 'image', attachmentId: 'attachment-1' })
    await treeApi.writeAttachment('attachment-1', bytes)
    await treeApi.readAttachment('attachment-1')
    await treeApi.cleanupAttachments(['attachment-1'])
    await treeApi.getAlwaysOnTop()
    await treeApi.setAlwaysOnTop(true)
    await treeApi.getVimEnabled()
    await treeApi.setVimEnabled(true)
    await treeApi.getAppearance()
    await treeApi.setAppearance('dark')
    await treeApi.getCommandHistory()
    await treeApi.setCommandHistory(['set-theme-dark'])
    await treeApi.chooseNotesExportDestination?.()
    await treeApi.startNotesExport?.()
    await treeApi.chooseNotesImportArchive?.()
    await treeApi.prepareNotesImport?.()
    await treeApi.commitNotesImport?.()
    await treeApi.cancelNotesOperation?.()
    await treeApi.takeNotesImportNotice?.()
    await treeApi.showReplacedNotesFolder?.()
    await treeApi.setNotesMenuState?.({ canExport: true, canImport: false })

    expect(mocks.invoke.mock.calls).toEqual([
      [ipcChannels.load],
      [ipcChannels.save, state],
      [ipcChannels.readClipboard],
      [ipcChannels.writeClipboard, payload],
      [ipcChannels.writeClipboardContent, { kind: 'text', text: 'plain' }],
      [ipcChannels.writeClipboardContent, { kind: 'image', attachmentId: 'attachment-1' }],
      [ipcChannels.writeAttachment, 'attachment-1', bytes],
      [ipcChannels.readAttachment, 'attachment-1'],
      [ipcChannels.cleanupAttachments, ['attachment-1']],
      [ipcChannels.getAlwaysOnTop],
      [ipcChannels.setAlwaysOnTop, true],
      [ipcChannels.getVimEnabled],
      [ipcChannels.setVimEnabled, true],
      [ipcChannels.getAppearance],
      [ipcChannels.setAppearance, 'dark'],
      [ipcChannels.getCommandHistory],
      [ipcChannels.setCommandHistory, ['set-theme-dark']],
      // Notes requests carry no arguments: the main process keeps every path.
      [ipcChannels.chooseNotesExportDestination],
      [ipcChannels.startNotesExport],
      [ipcChannels.chooseNotesImportArchive],
      [ipcChannels.prepareNotesImport],
      [ipcChannels.commitNotesImport],
      [ipcChannels.cancelNotesOperation],
      [ipcChannels.takeNotesImportNotice],
      [ipcChannels.showReplacedNotesFolder],
      [ipcChannels.setNotesMenuState, { canExport: true, canImport: false }],
    ])
  })

  it('registers and removes quit event listeners', async () => {
    const { treeApi } = (await import('./index')) as { treeApi: TreeApi }
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
    const { treeApi } = (await import('./index')) as { treeApi: TreeApi }
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
    const { treeApi } = (await import('./index')) as { treeApi: TreeApi }
    mocks.invoke.mockRejectedValueOnce(new Error('save failed'))

    await expect(treeApi.load()).rejects.toThrow('save failed')
    mocks.invoke.mockRejectedValueOnce(new Error('history failed'))
    await expect(treeApi.setCommandHistory(['set-theme-dark'])).rejects.toThrow('history failed')
    mocks.invoke.mockResolvedValueOnce('dark')
    await expect(treeApi.getAppearance()).resolves.toBe('dark')
    mocks.invoke.mockResolvedValueOnce(['set-theme-dark'])
    await expect(treeApi.getCommandHistory()).resolves.toEqual(['set-theme-dark'])
    mocks.invoke.mockRejectedValueOnce(new Error('clipboard failed'))
    await expect(treeApi.writeClipboardContent?.({ kind: 'image', attachmentId: 'picture' })).rejects.toThrow(
      'clipboard failed',
    )
  })
})

it('delivers appearance notifications and removes the listener', async () => {
  const { treeApi } = await import('./index')
  const listener = vi.fn()
  mocks.on.mockClear()
  const remove = treeApi.onAppearanceChanged?.(listener)
  const handler = mocks.on.mock.calls[0]?.[1] as (event: unknown, value: string) => void
  expect(mocks.on.mock.calls[0]?.[0]).toBe(ipcEvents.appearanceChanged)
  handler({}, 'dark')
  expect(listener).toHaveBeenCalledExactlyOnceWith('dark')
  remove?.()
  expect(mocks.removeListener).toHaveBeenCalledWith(ipcEvents.appearanceChanged, handler)
})

it('delivers notes progress and removes the listener', async () => {
  const { treeApi } = await import('./index')
  const listener = vi.fn()
  mocks.on.mockClear()

  const remove = treeApi.onNotesProgress?.(listener)
  expect(mocks.on.mock.calls[0]?.[0]).toBe(ipcEvents.notesProgress)
  expect(ipcEvents.notesProgress).toBe('tree:notes-progress')
  const handler = mocks.on.mock.calls[0]?.[1] as (event: unknown, value: unknown) => void
  handler({}, { imagesDone: 2, imageCount: 5 })
  remove?.()

  expect(listener).toHaveBeenCalledExactlyOnceWith({ imagesDone: 2, imageCount: 5 })
  expect(mocks.removeListener).toHaveBeenCalledWith(ipcEvents.notesProgress, handler)
})

// @requirement PRODUCT.md §25.1
it('delivers notes menu commands and preserves menu-state errors', async () => {
  const { treeApi } = await import('./index')
  const listener = vi.fn()
  mocks.on.mockClear()
  const remove = treeApi.onNotesMenuCommand?.(listener)
  expect(ipcEvents.notesMenuCommand).toBe('tree:notes-menu-command')
  expect(mocks.on.mock.calls[0]?.[0]).toBe(ipcEvents.notesMenuCommand)
  const handler = mocks.on.mock.calls[0]?.[1] as (event: unknown, value: string) => void
  handler({}, 'export')
  remove?.()
  expect(listener).toHaveBeenCalledExactlyOnceWith('export')
  expect(mocks.removeListener).toHaveBeenCalledWith(ipcEvents.notesMenuCommand, handler)
  mocks.invoke.mockRejectedValueOnce(new Error('Menu failed'))
  await expect(treeApi.setNotesMenuState?.({ canExport: false, canImport: false })).rejects.toThrow('Menu failed')
})
