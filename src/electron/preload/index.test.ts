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
  // @requirement PRODUCT.md §15.2
  it('forwards the complete summarization contract and preserves native failures', async () => {
    const { treeApi } = await import('./index')
    const port = treeApi.summarization!
    mocks.invoke.mockResolvedValueOnce(true)
    await expect(port.available()).resolves.toBe(true)
    expect(mocks.invoke).toHaveBeenLastCalledWith(ipcChannels.summaryAvailable)
    await port.begin('job')
    expect(mocks.invoke).toHaveBeenLastCalledWith(ipcChannels.summaryBegin, 'job')
    mocks.invoke.mockResolvedValueOnce('Result')
    await expect(port.reduce('job', 'Notes', true)).resolves.toBe('Result')
    expect(mocks.invoke).toHaveBeenLastCalledWith(ipcChannels.summaryReduce, 'job', 'Notes', true)
    await port.finish('job', 'Result')
    expect(mocks.invoke).toHaveBeenLastCalledWith(ipcChannels.summaryFinish, 'job', 'Result')
    await port.cancel('job')
    expect(mocks.invoke).toHaveBeenLastCalledWith(ipcChannels.summaryCancel, 'job')
    mocks.invoke.mockRejectedValueOnce(new Error('Native unavailable'))
    await expect(port.reduce('job', 'Notes', false)).rejects.toThrow('Native unavailable')
  })
  it('forwards encoded saves unchanged and retains IPC rejection', async () => {
    const { treeApi } = await import('./index')
    const encoded = '{"version":4}'

    await treeApi.save(encoded)

    expect(mocks.invoke).toHaveBeenLastCalledWith(ipcChannels.save, encoded)
    const failure = new Error('disk unavailable')
    mocks.invoke.mockRejectedValueOnce(failure)

    await expect(treeApi.save(encoded)).rejects.toBe(failure)
  })

  it.each([
    ['darwin', 'arm64', true],
    ['darwin', 'x64', false],
    ['linux', 'arm64', false],
  ] as const)('exposes OCR only on supported %s/%s', async (platform, arch, supported) => {
    vi.resetModules()
    vi.stubGlobal('process', { ...process, platform, arch })
    try {
      const { treeApi } = await import('./index')
      expect(typeof treeApi.imageToText === 'function').toBe(supported)
      if (supported) {
        mocks.invoke.mockResolvedValueOnce(['text'])
        await expect(treeApi.imageToText!('image')).resolves.toEqual(['text'])
        expect(mocks.invoke).toHaveBeenLastCalledWith(ipcChannels.imageToText, 'image')
      }
    } finally {
      vi.unstubAllGlobals()
      vi.resetModules()
    }
  })
  it('exposes the bridge object under the renderer API name', async () => {
    vi.resetModules()
    mocks.exposeInMainWorld.mockClear()
    const { treeApi } = await import('./index')

    expect(mocks.exposeInMainWorld).toHaveBeenCalledExactlyOnceWith('treeApi', treeApi)
  })

  it.each([undefined, null, 'ready', 'failed', 'installing', 0, 100])(
    'delivers the supported update status %j without requiring a version',
    async (status) => {
      const { treeApi } = await import('./index')
      const listener = vi.fn()
      const stop = treeApi.onUpdateCommandsChanged!(listener)
      const handler = mocks.on.mock.lastCall![1]
      const state = {
        'check-for-updates': false,
        'update-app': true,
        ...(status === undefined ? {} : { status }),
      }

      handler({}, state)

      expect(listener).toHaveBeenCalledExactlyOnceWith(state)
      stop()
    },
  )

  it.each(['12.34.56', '1.2.3+ci.123', '1.2.3+' + 'x'.repeat(122)])(
    'delivers the supported update version %s',
    async (version) => {
      const { treeApi } = await import('./index')
      const listener = vi.fn()
      const stop = treeApi.onUpdateCommandsChanged!(listener)
      const handler = mocks.on.mock.lastCall![1]
      const state = { 'check-for-updates': true, 'update-app': false, version }

      handler({}, state)

      expect(listener).toHaveBeenCalledExactlyOnceWith(state)
      stop()
    },
  )

  it('ignores malformed update states without throwing into the renderer', async () => {
    const { treeApi } = await import('./index')
    const listener = vi.fn()
    const stop = treeApi.onUpdateCommandsChanged!(listener)
    const handler = mocks.on.mock.lastCall![1]
    const state = { 'check-for-updates': true, 'update-app': false }
    const invalid = [
      undefined,
      true,
      42,
      'state',
      [],
      { ...state, 'check-for-updates': 'yes' },
      { ...state, version: ['1.2.3'] },
      { ...state, version: 'bad1.2.3' },
      { ...state, version: '1.2.3+bad?' },
      { ...state, version: '1.2.3+' + 'x'.repeat(123) },
    ]

    for (const value of invalid) expect(() => handler({}, value)).not.toThrow()

    expect(listener).not.toHaveBeenCalled()
    stop()
  })

  it('forwards context-menu requests, selected commands and native errors', async () => {
    const { treeApi } = await import('./index')
    const request = {
      x: 12,
      y: 34,
      selectionText: 'selected',
      canCut: true,
      canCopy: true,
      canPaste: false,
      canSelectAll: true,
    }
    mocks.invoke.mockResolvedValueOnce('copy')

    await expect(treeApi.showEditorContextMenu!(request)).resolves.toBe('copy')

    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith(ipcChannels.showEditorContextMenu, request)
    const failure = new Error('Native menu unavailable')
    mocks.invoke.mockRejectedValueOnce(failure)
    await expect(treeApi.showEditorContextMenu!(request)).rejects.toBe(failure)
  })

  it('validates update lifecycle notifications and removes both listeners', async () => {
    const { treeApi } = await import('./index')
    const requested = vi.fn()
    const finished = vi.fn()
    mocks.on.mockClear()
    const removeRequested = treeApi.onAppUpdateRequested!(requested)
    const removeFinished = treeApi.onAppUpdateFinished!(finished)
    const requestHandler = mocks.on.mock.calls.find(([channel]) => channel === ipcEvents.appUpdateRequested)![1]
    const finishHandler = mocks.on.mock.calls.find(([channel]) => channel === ipcEvents.appUpdateFinished)![1]

    for (const value of ['request-id', null, undefined, false, 1, {}]) requestHandler({}, value)
    for (const value of ['failure', null, undefined, false, 1, {}]) finishHandler({}, value)

    expect(requested.mock.calls).toEqual([['request-id']])
    expect(finished.mock.calls).toEqual([['failure'], [null]])
    removeRequested()
    removeFinished()
    expect(mocks.removeListener).toHaveBeenCalledWith(ipcEvents.appUpdateRequested, requestHandler)
    expect(mocks.removeListener).toHaveBeenCalledWith(ipcEvents.appUpdateFinished, finishHandler)
  })

  it('forwards update command state, execution, errors and validated notifications', async () => {
    const { treeApi } = await import('./index')
    const state = { 'check-for-updates': true, 'update-app': false, status: 42, version: '1.2.4' }
    mocks.invoke.mockResolvedValueOnce(state)

    await expect(treeApi.getUpdateCommands!()).resolves.toEqual(state)
    await treeApi.runUpdateCommand!('check-for-updates')

    expect(mocks.invoke).toHaveBeenCalledWith('tree:get-update-commands')
    expect(mocks.invoke).toHaveBeenCalledWith('tree:run-update-command', 'check-for-updates')
    mocks.invoke.mockRejectedValueOnce(new Error('unavailable'))
    await expect(treeApi.runUpdateCommand!('update-app')).rejects.toThrow('unavailable')
    const listener = vi.fn()
    const stop = treeApi.onUpdateCommandsChanged!(listener)
    const handler = mocks.on.mock.calls.findLast(([name]) => name === 'tree:update-commands-changed')![1]

    handler({}, null)
    handler({}, { 'check-for-updates': true, 'update-app': 'yes' })
    for (const status of [-1, 101, 0.5, NaN, 'download', {}]) handler({}, { ...state, status })
    for (const version of [1, {}, '', 'invalid', '1.2.3&Quit']) handler({}, { ...state, version })
    handler({}, state)

    expect(listener).toHaveBeenCalledExactlyOnceWith(state)
    stop()
    expect(mocks.removeListener).toHaveBeenCalledWith('tree:update-commands-changed', handler)
  })
  it('forwards About state and propagates errors', async () => {
    const { treeApi } = await import('./index')

    await expect(treeApi.setAboutOpen!(true)).resolves.toBeUndefined()

    expect(mocks.invoke).toHaveBeenCalledWith('tree:set-about-open', true)
    mocks.invoke.mockRejectedValueOnce(new Error('unavailable'))

    await expect(treeApi.setAboutOpen!(false)).rejects.toThrow('unavailable')
  })
  it('subscribes to argument-free About menu requests and releases its listener', async () => {
    const { treeApi } = await import('./index')
    const listener = vi.fn()
    const stop = treeApi.onAboutRequested!(listener)
    const handler = mocks.on.mock.calls.findLast(([channel]) => channel === 'tree:about-requested')![1]

    handler({})
    expect(listener).toHaveBeenCalledExactlyOnceWith()
    handler({}, 'extra')

    expect(listener).toHaveBeenCalledExactlyOnceWith()
    stop()
    expect(mocks.removeListener).toHaveBeenCalledWith('tree:about-requested', handler)
  })
  it('forwards update acknowledgments and errors', async () => {
    const { treeApi } = await import('./index')
    await treeApi.checkAppUpdate!()
    await treeApi.setAppUpdateBlocked!(true)
    await treeApi.confirmAppUpdate!('id', true)
    expect(mocks.invoke).toHaveBeenCalledWith('tree:check-app-update')
    expect(mocks.invoke).toHaveBeenCalledWith('tree:set-app-update-blocked', true)
    expect(mocks.invoke).toHaveBeenCalledWith('tree:confirm-app-update', 'id', true)
    mocks.invoke.mockRejectedValueOnce(new Error('stale'))
    await expect(treeApi.confirmAppUpdate!('id', false)).rejects.toThrow('stale')
  })
  beforeAll(async () => {
    await import('./index')
  })

  beforeEach(() => {
    mocks.invoke.mockClear()
    mocks.on.mockClear()
    mocks.removeListener.mockClear()
  })

  it('forwards the quit handshake request ID to the main process', async () => {
    const { treeApi } = await import('./index')

    await treeApi.quit('request-1')

    expect(mocks.invoke).toHaveBeenCalledWith(ipcChannels.quit, 'request-1')
  })

  it('forwards recent-node reads, writes, results and errors', async () => {
    const { treeApi } = await import('./index')
    mocks.invoke.mockResolvedValueOnce(['a'])

    await expect(treeApi.getRecentNodes!()).resolves.toEqual(['a'])
    await treeApi.setRecentNodes!(['b', 'a'])

    expect(mocks.invoke.mock.calls).toEqual([['tree:get-recent-nodes'], ['tree:set-recent-nodes', ['b', 'a']]])
    mocks.invoke.mockRejectedValueOnce(new Error('disk failure'))

    await expect(treeApi.setRecentNodes!(['a'])).rejects.toThrow('disk failure')
  })

  it('forwards emoji-history channels, values and errors', async () => {
    const { treeApi } = await import('./index')
    mocks.invoke.mockResolvedValueOnce(['cat'])

    await expect(treeApi.getEmojiHistory!()).resolves.toEqual(['cat'])
    await treeApi.setEmojiHistory!(['rocket', 'cat'])

    expect(mocks.invoke.mock.calls).toEqual([['tree:get-emoji-history'], ['tree:set-emoji-history', ['rocket', 'cat']]])
    mocks.invoke.mockRejectedValueOnce(new Error('disk failure'))

    await expect(treeApi.setEmojiHistory!(['cat'])).rejects.toThrow('disk failure')
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
    await treeApi.getLineNumbers()
    await treeApi.setLineNumbers(true)
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
      [ipcChannels.getLineNumbers],
      [ipcChannels.setLineNumbers, true],
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
    expect(mocks.on.mock.calls.map(([channel]) => channel)).toEqual(['tree:quit-requested', 'tree:quit-failed'])
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

it('validates search menu commands and disposes their listener', async () => {
  const { treeApi } = await import('./index')
  const listener = vi.fn()
  mocks.on.mockClear()
  mocks.removeListener.mockClear()
  const remove = treeApi.onFindMenuCommand?.(listener)
  const handler = mocks.on.mock.calls[0]?.[1] as (event: unknown, value: unknown) => void

  for (const value of ['find', 'next', 'previous', 'all', 'invalid', null, {}]) handler({}, value)

  expect(mocks.on.mock.calls[0]?.[0]).toBe('tree:find-menu-command')
  expect(listener.mock.calls).toEqual([['find'], ['next'], ['previous'], ['all']])

  remove?.()

  expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(ipcEvents.findMenuCommand, handler)
})

// @requirement PRODUCT.md §9.3
it('delivers only supported view commands and removes the exact menu listener', async () => {
  const { treeApi } = await import('./index')
  const listener = vi.fn()
  mocks.on.mockClear()
  mocks.removeListener.mockClear()
  const remove = treeApi.onViewMenuCommand?.(listener)

  expect(ipcEvents.viewMenuCommand).toBe('tree:view-menu-command')
  expect(mocks.on.mock.calls[0]?.[0]).toBe(ipcEvents.viewMenuCommand)

  const handler = mocks.on.mock.calls[0]?.[1] as (event: unknown, value: unknown) => void

  handler({}, 'tree')
  handler({}, 'agenda')
  for (const value of ['export', '', undefined, null, {}, ['tree']]) handler({}, value)

  expect(listener.mock.calls).toEqual([['tree'], ['agenda']])

  remove?.()

  expect(mocks.removeListener).toHaveBeenCalledExactlyOnceWith(ipcEvents.viewMenuCommand, handler)
})
