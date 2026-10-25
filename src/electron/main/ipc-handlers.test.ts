import { describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '../../shared/ipc'
import type { FileServices } from '../../infrastructure/main/file-services'
import type { NativeClipboard } from '../../infrastructure/main/clipboard'
import { registerIpcHandlers, type IpcInvokeEvent } from './ipc-handlers'
import { MAX_CONTEXT_MENU_SELECTION_CODE_POINTS } from './ipc-security'
import { decodePngWithZlib, onePixelPng, pngIhdr, pngWith } from './png-test-utils'

const rendererUrl = 'app://tree/index.html'
const validState = {
  version: 1,
  document: { roots: [{ id: 'root', text: '', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
}

function createHarness() {
  const handlers = new Map<string, (event: IpcInvokeEvent, ...args: unknown[]) => unknown>()
  const ipcMain = {
    handle: (channel: string, listener: (event: IpcInvokeEvent, ...args: unknown[]) => unknown) =>
      handlers.set(channel, listener),
  }
  const fileServices: FileServices = {
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    writeAttachment: vi.fn(async () => undefined),
    readAttachment: vi.fn(async () => null),
    cleanupAttachments: vi.fn(async () => undefined),
  }
  const nativeClipboard = {
    read: vi.fn<NativeClipboard['read']>(async () => []),
    readText: vi.fn(async () => ''),
    writePlainText: vi.fn<(text: string) => Promise<void>>(async () => undefined),
    writeImage: vi.fn<(png: Uint8Array) => Promise<void>>(async () => undefined),
    writeRichText: vi.fn<(text: string, html: string) => Promise<void>>(async () => undefined),
  }
  const quitHandshake = { request: vi.fn(), confirm: vi.fn(() => true), force: vi.fn() }
  const onQuitConfirmed = vi.fn()
  const showEditorContextMenu = vi.fn(async () => 'copy' as const)
  const getAlwaysOnTop = vi.fn(() => false)
  const setAlwaysOnTop = vi.fn()
  const getVimEnabled = vi.fn(() => true)
  const setVimEnabled = vi.fn()
  const decodePng = vi.fn(decodePngWithZlib)
  const getAppearance = vi.fn(() => 'system' as const)
  const setAppearance = vi.fn()
  const getCommandHistory = vi.fn(() => ['set-theme-dark'])
  const setCommandHistory = vi.fn()
  const getRecentNodes = vi.fn(async () => ['node-a'])
  const getEmojiHistory = vi.fn(async () => ['cat'])
  const setEmojiHistory = vi.fn<(names: readonly string[]) => Promise<void>>(async () => undefined)
  const setRecentNodes = vi.fn<(ids: readonly string[]) => Promise<void>>(async () => undefined)
  const notesArchive = {
    chooseExportDestination: vi.fn(async () => ({ ok: true as const, fileName: 'Tree Notes 2026-10-23.zip' })),
    startExport: vi.fn(async () => ({
      ok: true as const,
      fileName: 'Tree Notes 2026-10-23.zip',
      summary: { imageCount: 1, missingImageCount: 0, archiveBytes: 10 },
    })),
    chooseImportArchive: vi.fn(async () => ({ ok: false as const, canceled: true as const })),
    prepareImport: vi.fn(async () => ({ ok: false as const, message: 'The archive is encrypted.' })),
    commitImport: vi.fn(async () => ({ ok: true as const })),
    cancel: vi.fn(async () => undefined),
    takeImportNotice: vi.fn(() => ({ fileName: 'a.zip', replacedFolder: '~/Library/Application Support/Tree/x' })),
    showReplacedFolder: vi.fn(),
    shutdown: vi.fn(() => null),
  }
  const setNotesMenuState = vi.fn()
  registerIpcHandlers({
    getEmojiHistory,
    setEmojiHistory,
    getRecentNodes,
    setRecentNodes,
    getAppearance,
    setAppearance,
    getCommandHistory,
    setCommandHistory,
    ipcMain,
    rendererUrl,
    fileServices,
    nativeClipboard,
    quitHandshake,
    decodePng,
    onQuitConfirmed,
    showEditorContextMenu,
    getAlwaysOnTop,
    setAlwaysOnTop,
    getVimEnabled,
    setVimEnabled,
    notesArchive,
    setNotesMenuState,
  })
  return {
    getEmojiHistory,
    setEmojiHistory,
    getRecentNodes,
    setRecentNodes,
    setNotesMenuState,
    notesArchive,
    getAppearance,
    setAppearance,
    getCommandHistory,
    setCommandHistory,
    handlers,
    fileServices,
    nativeClipboard,
    quitHandshake,
    onQuitConfirmed,
    decodePng,
    showEditorContextMenu,
    getAlwaysOnTop,
    setAlwaysOnTop,
    getVimEnabled,
    setVimEnabled,
  }
}

describe('main IPC handlers', () => {
  it('validates emoji history before storage and preserves read/write failures', async () => {
    const { handlers, getEmojiHistory, setEmojiHistory } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const get = handlers.get(ipcChannels.getEmojiHistory)!
    const set = handlers.get(ipcChannels.setEmojiHistory)!

    await expect(get(event)).resolves.toEqual(['cat'])
    await set(event, ['rocket', 'cat'])

    expect(setEmojiHistory).toHaveBeenCalledExactlyOnceWith(['rocket', 'cat'])
    for (const invalid of [null, [null], ['unknown'], ['cat', 'cat'], Array(101).fill('cat'), ['__proto__']])
      expect(() => set(event, invalid)).toThrow('Invalid emoji history')
    expect(() => get(event, 'extra')).toThrow()
    expect(() => set(event, [], 'extra')).toThrow()
    expect(() => get({ senderFrame: { url: 'https://untrusted.example' } })).toThrow('Untrusted')
    expect(() => set({ senderFrame: { url: 'https://untrusted.example' } }, ['cat'])).toThrow('Untrusted')

    getEmojiHistory.mockRejectedValueOnce(new Error('read failure'))
    setEmojiHistory.mockRejectedValueOnce(new Error('write failure'))

    await expect(get(event)).rejects.toThrow('read failure')
    await expect(set(event, ['cat'])).rejects.toThrow('write failure')
  })
  it('validates recent-node history, rejects untrusted calls and propagates write errors', async () => {
    const { handlers, getRecentNodes, setRecentNodes } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const get = handlers.get(ipcChannels.getRecentNodes)!
    const set = handlers.get(ipcChannels.setRecentNodes)!

    await expect(get(event)).resolves.toEqual(['node-a'])
    await set(event, ['node-b'])

    expect(getRecentNodes).toHaveBeenCalledOnce()
    expect(setRecentNodes).toHaveBeenCalledWith(['node-b'])
    expect(() => set({ senderFrame: { url: 'https://untrusted.example' } }, ['node-b'])).toThrow('Untrusted')
    expect(() => set(event, [null])).toThrow('Invalid recent')
    expect(() => set(event, Array(101).fill('a'))).toThrow('Invalid recent')
    expect(() => get(event, 'extra')).toThrow()
    setRecentNodes.mockRejectedValueOnce(new Error('disk failure'))

    await expect(set(event, ['node-b'])).rejects.toThrow('disk failure')
  })
  it('propagates oversized clipboard image errors without reading bytes or writing attachments', async () => {
    const { handlers, nativeClipboard, fileServices } = createHarness()
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(1))
    nativeClipboard.read.mockResolvedValue([
      { types: ['image/png'], getType: async () => ({ size: 25 * 1024 * 1024 + 1, arrayBuffer }) },
    ])

    expect(ipcChannels.readClipboard).toBe('tree:read-clipboard')
    await expect(handlers.get(ipcChannels.readClipboard)!({ senderFrame: { url: rendererUrl } })).rejects.toThrow(
      'Clipboard image is too large (maximum 25 MiB).',
    )
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(nativeClipboard.readText).not.toHaveBeenCalled()
    expect(fileServices.writeAttachment).not.toHaveBeenCalled()
  })

  it('validates appearance and bounded history before invoking preferences and propagates failures', () => {
    const harness = createHarness()
    const { handlers, setAppearance, setCommandHistory } = harness
    const event = { senderFrame: { url: rendererUrl } }

    expect(handlers.get(ipcChannels.getAppearance)!(event)).toBe('system')
    expect(handlers.get(ipcChannels.getCommandHistory)!(event)).toEqual(['set-theme-dark'])

    for (const value of ['system', 'light', 'dark']) handlers.get(ipcChannels.setAppearance)!(event, value)

    expect(setAppearance.mock.calls).toEqual([['system'], ['light'], ['dark']])
    for (const value of [null, true, 'auto', {}])
      expect(() => handlers.get(ipcChannels.setAppearance)!(event, value)).toThrow('Invalid appearance')

    handlers.get(ipcChannels.setCommandHistory)!(event, ['set-theme-dark'])

    expect(setCommandHistory).toHaveBeenCalledExactlyOnceWith(['set-theme-dark'])
    for (const value of [null, {}, [1], ['a'.repeat(101)], Array(101).fill('set-theme-dark')])
      expect(() => handlers.get(ipcChannels.setCommandHistory)!(event, value)).toThrow('Invalid command history')
    expect(setCommandHistory).toHaveBeenCalledTimes(1)

    setCommandHistory.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    expect(() => handlers.get(ipcChannels.setCommandHistory)!(event, [])).toThrow('disk full')

    setAppearance.mockImplementationOnce(() => {
      throw new Error('appearance failed')
    })

    expect(() => handlers.get(ipcChannels.setAppearance)!(event, 'light')).toThrow('appearance failed')
  })
  it('writes plain text and validated attachment bytes through the content channel', async () => {
    const { handlers, fileServices, nativeClipboard, decodePng } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }

    expect(ipcChannels.writeClipboardContent).toBe('tree:write-clipboard-content')

    const write = handlers.get(ipcChannels.writeClipboardContent)!

    await expect(write(event, { kind: 'text', text: 'https://example.com' })).resolves.toBeUndefined()
    expect(nativeClipboard.writePlainText).toHaveBeenCalledWith('https://example.com')

    vi.mocked(fileServices.readAttachment).mockResolvedValue(onePixelPng)

    await expect(write(event, { kind: 'image', attachmentId: 'image-1' })).resolves.toBeUndefined()
    expect(fileServices.readAttachment).toHaveBeenCalledWith('image-1')
    expect(decodePng).toHaveBeenCalledWith(onePixelPng)
    expect(nativeClipboard.writeImage).toHaveBeenCalledWith(onePixelPng)
  })

  it('rejects invalid content before native copying or attachment access', async () => {
    const { handlers, fileServices, nativeClipboard } = createHarness()
    const write = handlers.get(ipcChannels.writeClipboardContent)!
    const event = { senderFrame: { url: rendererUrl } }

    for (const payload of [
      null,
      { kind: 'text', text: 12 },
      { kind: 'other' },
      { kind: 'image', attachmentId: '../escape' },
    ])
      expect(() => write(event, payload)).toThrow()
    expect(fileServices.readAttachment).not.toHaveBeenCalled()
    expect(nativeClipboard.writePlainText).not.toHaveBeenCalled()
    expect(nativeClipboard.writeImage).not.toHaveBeenCalled()
  })

  it('propagates attachment and native failures and allows a later copy to succeed', async () => {
    const { handlers, fileServices, nativeClipboard } = createHarness()
    const write = handlers.get(ipcChannels.writeClipboardContent)!
    const event = { senderFrame: { url: rendererUrl } }

    await expect(write(event, { kind: 'image', attachmentId: 'missing' })).rejects.toThrow('attachment is missing')

    vi.mocked(fileServices.readAttachment).mockRejectedValueOnce(new Error('attachment read failed'))

    await expect(write(event, { kind: 'image', attachmentId: 'bad' })).rejects.toThrow('attachment read failed')

    vi.mocked(fileServices.readAttachment).mockResolvedValueOnce(new Uint8Array([1, 2]))

    await expect(write(event, { kind: 'image', attachmentId: 'corrupt' })).rejects.toThrow('PNG')
    expect(nativeClipboard.writeImage).not.toHaveBeenCalled()

    nativeClipboard.writePlainText.mockRejectedValueOnce(new Error('native write failed'))

    await expect(write(event, { kind: 'text', text: 'first' })).rejects.toThrow('native write failed')
    await expect(write(event, { kind: 'text', text: 'retry' })).resolves.toBeUndefined()
  })

  it('reports unavailable native writers before changing the clipboard or reading an image', async () => {
    const { handlers, fileServices, nativeClipboard } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const write = handlers.get(ipcChannels.writeClipboardContent)!

    Reflect.deleteProperty(nativeClipboard, 'writePlainText')
    Reflect.deleteProperty(nativeClipboard, 'writeImage')

    await expect(write(event, { kind: 'text', text: 'text' })).rejects.toThrow('text copying is unavailable')
    await expect(write(event, { kind: 'image', attachmentId: 'image' })).rejects.toThrow('image copying is unavailable')
    expect(fileServices.readAttachment).not.toHaveBeenCalled()
  })

  it('serializes delayed image copying before a later plain or rich copy', async () => {
    const { handlers, fileServices, nativeClipboard } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    let release!: (png: Uint8Array) => void
    vi.mocked(fileServices.readAttachment).mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve
      }),
    )
    const image = handlers.get(ipcChannels.writeClipboardContent)!(event, { kind: 'image', attachmentId: 'image' })
    const text = handlers.get(ipcChannels.writeClipboardContent)!(event, { kind: 'text', text: 'later' })
    const rich = handlers.get(ipcChannels.writeClipboard)!(event, { text: 'rich', html: '<b>rich</b>' })
    await Promise.resolve()

    expect(nativeClipboard.writePlainText).not.toHaveBeenCalled()

    release(onePixelPng)
    await Promise.all([image, text, rich])

    expect(nativeClipboard.writeImage.mock.invocationCallOrder[0]).toBeLessThan(
      nativeClipboard.writePlainText.mock.invocationCallOrder[0]!,
    )
    expect(nativeClipboard.writePlainText.mock.invocationCallOrder[0]).toBeLessThan(
      nativeClipboard.writeRichText.mock.invocationCallOrder[0]!,
    )
    expect(nativeClipboard.writeRichText).toHaveBeenCalledWith('rich', '<b>rich</b>')
  })

  it.each([
    ['an attachment path separator', { id: '../escape', mimeType: 'image/png' }, ''],
    ['a non-HTTP(S) link destination', undefined, 'javascript:alert(1)'],
  ])('rejects a save payload containing %s before filesystem persistence', async (_description, attachment, url) => {
    const { handlers, fileServices } = createHarness()
    const root = {
      id: 'root',
      text: url ? 'unsafe' : '',
      ...(attachment ? { attachment } : {}),
      ...(url ? { links: [{ start: 0, end: 6, url }] } : {}),
      children: [],
    }
    const state = {
      version: 2,
      document: { roots: [root] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }
    const event = { senderFrame: { url: rendererUrl } }

    await expect(Promise.resolve().then(() => handlers.get(ipcChannels.save)!(event, state))).rejects.toThrow()
    expect(fileServices.save).not.toHaveBeenCalled()
  })

  it('forwards a version three view state and rejects a malformed one before filesystem persistence', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const base = {
      version: 3,
      document: { roots: [{ id: 'root', text: '', children: [{ id: 'child', text: '', children: [] }] }] },
      location: { currentParentId: null, selectedNodeId: 'child' },
    }
    const state = { ...base, view: { expandedIds: ['root'], selectedRowTop: 24 } }

    await handlers.get(ipcChannels.save)!(event, state)

    expect(vi.mocked(fileServices.save).mock.calls[0]![0]).toBe(state)

    for (const view of [
      undefined,
      { expandedIds: 'root' },
      { expandedIds: [7] },
      { expandedIds: [], selectedRowTop: -5 },
    ]) {
      await expect(
        Promise.resolve().then(() => handlers.get(ipcChannels.save)!(event, { ...base, view })),
      ).rejects.toThrow()
    }
    expect(fileServices.save).toHaveBeenCalledOnce()
  })

  it('validates the maximum persisted depth before filesystem persistence', async () => {
    const { handlers, fileServices } = createHarness()
    const root = { id: 'n0', text: '', children: [] as { id: string; text: string; children: never[] }[] }
    let current = root
    for (let index = 1; index < 20; index += 1) {
      const child = { id: `n${index}`, text: '', children: [] as never[] }
      current.children.push(child)
      current = child
    }
    const state = { version: 2, document: { roots: [root] }, location: { currentParentId: null, selectedNodeId: 'n0' } }
    const event = { senderFrame: { url: rendererUrl } }

    await handlers.get(ipcChannels.save)!(event, state)

    expect(fileServices.save).toHaveBeenCalledOnce()

    current.children.push({ id: 'n20', text: '', children: [] })

    await expect(Promise.resolve().then(() => handlers.get(ipcChannels.save)!(event, state))).rejects.toThrow(
      'Nodes cannot be nested deeper than 20 levels.',
    )
    expect(fileServices.save).toHaveBeenCalledOnce()
  })

  it('registers every exposed IPC channel', () => {
    const { handlers } = createHarness()

    expect(new Set(handlers.keys())).toEqual(new Set(Object.values(ipcChannels)))
  })

  it('validates and forwards editor context-menu requests', async () => {
    const { handlers, showEditorContextMenu } = createHarness()
    const sender = { getOwnerBrowserWindow: vi.fn() }
    const event = { senderFrame: { url: rendererUrl }, sender } as unknown as IpcInvokeEvent
    const request = {
      x: 12,
      y: 34,
      selectionText: 'Test',
      canCut: true,
      canCopy: true,
      canPaste: true,
      canSelectAll: true,
    }

    await expect(handlers.get(ipcChannels.showEditorContextMenu)!(event, request)).resolves.toBe('copy')
    expect(showEditorContextMenu).toHaveBeenCalledWith(sender, request)

    await handlers.get(ipcChannels.showEditorContextMenu)!(event, {
      ...request,
      selectionText: 'x'.repeat(MAX_CONTEXT_MENU_SELECTION_CODE_POINTS + 10),
    })

    expect(showEditorContextMenu).toHaveBeenLastCalledWith(sender, {
      ...request,
      selectionText: 'x'.repeat(MAX_CONTEXT_MENU_SELECTION_CODE_POINTS - 1) + '…',
    })

    await expect(
      Promise.resolve().then(() =>
        handlers.get(ipcChannels.showEditorContextMenu)!(event, { ...request, x: Number.POSITIVE_INFINITY }),
      ),
    ).rejects.toThrow('Editor context menu request')
    expect(showEditorContextMenu).toHaveBeenCalledTimes(2)
  })

  it('forwards argument-free notes export and import requests and their results', async () => {
    const { handlers, notesArchive } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }

    expect(ipcChannels.chooseNotesExportDestination).toBe('tree:notes-choose-export-destination')
    expect(ipcChannels.startNotesExport).toBe('tree:notes-start-export')
    expect(ipcChannels.chooseNotesImportArchive).toBe('tree:notes-choose-import-archive')
    expect(ipcChannels.prepareNotesImport).toBe('tree:notes-prepare-import')
    expect(ipcChannels.commitNotesImport).toBe('tree:notes-commit-import')
    expect(ipcChannels.cancelNotesOperation).toBe('tree:notes-cancel')
    expect(ipcChannels.takeNotesImportNotice).toBe('tree:notes-take-import-notice')
    expect(ipcChannels.showReplacedNotesFolder).toBe('tree:notes-show-replaced-folder')

    await expect(handlers.get(ipcChannels.chooseNotesExportDestination)!(event)).resolves.toEqual({
      ok: true,
      fileName: 'Tree Notes 2026-10-23.zip',
    })
    await expect(handlers.get(ipcChannels.startNotesExport)!(event)).resolves.toMatchObject({ ok: true })
    await expect(handlers.get(ipcChannels.chooseNotesImportArchive)!(event)).resolves.toEqual({
      ok: false,
      canceled: true,
    })
    await expect(handlers.get(ipcChannels.prepareNotesImport)!(event)).resolves.toEqual({
      ok: false,
      message: 'The archive is encrypted.',
    })
    await expect(handlers.get(ipcChannels.commitNotesImport)!(event)).resolves.toEqual({ ok: true })
    await expect(handlers.get(ipcChannels.cancelNotesOperation)!(event)).resolves.toBeUndefined()
    expect(handlers.get(ipcChannels.takeNotesImportNotice)!(event)).toEqual({
      fileName: 'a.zip',
      replacedFolder: '~/Library/Application Support/Tree/x',
    })

    handlers.get(ipcChannels.showReplacedNotesFolder)!(event)

    for (const method of Object.values(notesArchive).filter((method) => method !== notesArchive.shutdown)) {
      expect(method).toHaveBeenCalledExactlyOnceWith()
    }
  })

  it('rejects any argument to a notes request, so the renderer cannot name a path', async () => {
    const { handlers, notesArchive } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const notesChannels = Object.values(ipcChannels).filter(
      (channel) => channel.startsWith('tree:notes-') && channel !== ipcChannels.setNotesMenuState,
    )

    expect(notesChannels).toHaveLength(8)

    for (const channel of notesChannels) {
      for (const args of [['/Users/someone/Desktop/notes.zip'], [undefined], [{ path: '/' }]]) {
        expect(() => handlers.get(channel)!(event, ...args)).toThrow('This request takes no arguments.')
      }
    }
    for (const method of Object.values(notesArchive)) expect(method).not.toHaveBeenCalled()
  })

  it('propagates notes controller failures to the renderer', async () => {
    const { handlers, notesArchive } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    notesArchive.startExport.mockRejectedValueOnce(new Error('No export destination was chosen.'))
    notesArchive.showReplacedFolder.mockImplementationOnce(() => {
      throw new Error('There is no Replaced Notes folder to show.')
    })

    await expect(handlers.get(ipcChannels.startNotesExport)!(event)).rejects.toThrow(
      'No export destination was chosen.',
    )
    expect(() => handlers.get(ipcChannels.showReplacedNotesFolder)!(event)).toThrow(
      'There is no Replaced Notes folder to show.',
    )
  })

  it('rejects every channel from an untrusted renderer', async () => {
    const { handlers } = createHarness()
    const event = { senderFrame: { url: 'https://evil.example/' } }

    for (const handler of handlers.values()) {
      await expect(Promise.resolve().then(() => handler(event, validState, 'id', new Uint8Array()))).rejects.toThrow(
        'Untrusted renderer',
      )
    }
  })

  it('forwards quit requests and confirmations through the handshake', async () => {
    const { handlers, quitHandshake, onQuitConfirmed } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const handler = handlers.get(ipcChannels.quit)!

    await handler(event)
    await handler(event, 'request-1')

    expect(quitHandshake.request).toHaveBeenCalledOnce()
    expect(quitHandshake.confirm).toHaveBeenCalledWith('request-1')
    expect(onQuitConfirmed).toHaveBeenCalledOnce()
  })

  it('reads and validates always-on-top changes through the trusted renderer contract', async () => {
    const { handlers, getAlwaysOnTop, setAlwaysOnTop } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }

    expect(handlers.get(ipcChannels.getAlwaysOnTop)!(event)).toBe(false)

    await handlers.get(ipcChannels.setAlwaysOnTop)!(event, true)

    expect(getAlwaysOnTop).toHaveBeenCalledOnce()
    expect(setAlwaysOnTop).toHaveBeenCalledWith(true)
    await expect(
      Promise.resolve().then(() => handlers.get(ipcChannels.setAlwaysOnTop)!(event, 'true')),
    ).rejects.toThrow('Invalid always-on-top setting.')
  })

  it('reads and validates Vim editing changes through the trusted renderer contract', async () => {
    const { handlers, getVimEnabled, setVimEnabled } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }

    expect(handlers.get(ipcChannels.getVimEnabled)!(event)).toBe(true)

    await handlers.get(ipcChannels.setVimEnabled)!(event, false)

    expect(getVimEnabled).toHaveBeenCalledOnce()
    expect(setVimEnabled).toHaveBeenCalledWith(false)
    await expect(Promise.resolve().then(() => handlers.get(ipcChannels.setVimEnabled)!(event, 1))).rejects.toThrow(
      'Invalid Vim editing setting.',
    )
    expect(setVimEnabled).toHaveBeenCalledOnce()
  })

  it('quits without saving through the handshake', async () => {
    const { handlers, quitHandshake, onQuitConfirmed } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }

    await handlers.get(ipcChannels.quitWithoutSaving)!(event)

    expect(quitHandshake.force).toHaveBeenCalledOnce()
    expect(onQuitConfirmed).toHaveBeenCalledOnce()
  })

  it('forwards validated persistence and attachment arguments', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const bytes = onePixelPng

    await handlers.get(ipcChannels.save)!(event, validState)
    await handlers.get(ipcChannels.writeAttachment)!(event, 'image-1', bytes)
    await handlers.get(ipcChannels.cleanupAttachments)!(event, ['image-1'])

    expect(fileServices.save).toHaveBeenCalledWith(validState)
    expect(vi.mocked(fileServices.save).mock.calls[0]![0]).toBe(validState)
    expect(fileServices.writeAttachment).toHaveBeenCalledWith('image-1', bytes)
    expect(fileServices.cleanupAttachments).toHaveBeenCalledWith(['image-1'])
  })

  it('rejects invalid attachment bytes before any filesystem write', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const invalidPng = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
    ])

    await expect(
      Promise.resolve().then(() => handlers.get(ipcChannels.writeAttachment)!(event, 'image-1', invalidPng)),
    ).rejects.toThrow('PNG')
    expect(fileServices.writeAttachment).not.toHaveBeenCalled()
  })

  it('rejects oversized attachment dimensions before decoding or writing', async () => {
    const { handlers, fileServices, decodePng } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const oversizedPng = pngWith([
      ['IHDR', pngIhdr(30_000, 30_000)],
      ['IDAT', [1, 2, 3]],
      ['IEND', []],
    ])

    await expect(
      Promise.resolve().then(() => handlers.get(ipcChannels.writeAttachment)!(event, 'image-1', oversizedPng)),
    ).rejects.toThrow('image is too large')
    expect(decodePng).not.toHaveBeenCalled()
    expect(fileServices.writeAttachment).not.toHaveBeenCalled()
  })

  it('propagates attachment write failures', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    vi.mocked(fileServices.writeAttachment).mockRejectedValueOnce(new Error('disk full'))

    await expect(
      Promise.resolve().then(() => handlers.get(ipcChannels.writeAttachment)!(event, 'image-1', onePixelPng)),
    ).rejects.toThrow('disk full')
  })

  it('decodes each accepted attachment exactly once', async () => {
    const { handlers, decodePng } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }

    await handlers.get(ipcChannels.writeAttachment)!(event, 'image-1', onePixelPng)

    expect(decodePng).toHaveBeenCalledOnce()

    await handlers.get(ipcChannels.readAttachment)!(event, 'image-1')

    expect(decodePng).toHaveBeenCalledOnce()
  })

  it('forwards cleanup ids, returns successfully, and propagates cleanup failures', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const cleanup = handlers.get(ipcChannels.cleanupAttachments)!

    await expect(cleanup(event, ['image-1', 'image-2'])).resolves.toBeUndefined()
    expect(fileServices.cleanupAttachments).toHaveBeenLastCalledWith(['image-1', 'image-2'])

    vi.mocked(fileServices.cleanupAttachments).mockRejectedValueOnce(new Error('cleanup failed'))

    await expect(Promise.resolve().then(() => cleanup(event, []))).rejects.toThrow('cleanup failed')
  })

  it('propagates handler and validation failures', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    vi.mocked(fileServices.load).mockRejectedValueOnce(new Error('load failed'))

    await expect(Promise.resolve().then(() => handlers.get(ipcChannels.load)!(event))).rejects.toThrow('load failed')
    await expect(
      Promise.resolve().then(() => handlers.get(ipcChannels.save)!(event, { invalid: true })),
    ).rejects.toThrow('unsupported format')
    await expect(
      Promise.resolve().then(() => handlers.get(ipcChannels.writeAttachment)!(event, '../escape', new Uint8Array())),
    ).rejects.toThrow('Attachment IDs')
  })

  it('preserves load results and propagates persistence failures across registered channels', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }

    await expect(handlers.get(ipcChannels.load)!(event)).resolves.toBeNull()

    vi.mocked(fileServices.load).mockResolvedValueOnce(validState)

    await expect(handlers.get(ipcChannels.load)!(event)).resolves.toEqual(validState)
    expect(fileServices.load).toHaveBeenCalledWith()

    const failure = new Error('recovery or persistence failed')
    vi.mocked(fileServices.load).mockRejectedValueOnce(failure)
    vi.mocked(fileServices.save).mockRejectedValueOnce(failure)
    vi.mocked(fileServices.cleanupAttachments).mockRejectedValueOnce(failure)

    await expect(handlers.get(ipcChannels.load)!(event)).rejects.toBe(failure)
    await expect(handlers.get(ipcChannels.save)!(event, validState)).rejects.toBe(failure)
    await expect(handlers.get(ipcChannels.cleanupAttachments)!(event, [])).rejects.toBe(failure)
  })
})

// @requirement PRODUCT.md §25.1
it('validates notes menu availability and forwards it only for a trusted caller', () => {
  const { handlers, setNotesMenuState } = createHarness()

  expect(ipcChannels.setNotesMenuState).toBe('tree:notes-set-menu-state')

  const invoke = handlers.get(ipcChannels.setNotesMenuState)!
  const event = { senderFrame: { url: rendererUrl } }

  expect(invoke(event, { canExport: true, canImport: false })).toBeUndefined()
  expect(setNotesMenuState).toHaveBeenCalledExactlyOnceWith({ canExport: true, canImport: false })
  for (const value of [
    undefined,
    null,
    [],
    true,
    {},
    { canExport: true },
    { canExport: 1, canImport: false },
    { canExport: true, canImport: false, path: '/' },
  ]) {
    expect(() => invoke(event, value)).toThrow('Invalid notes menu state.')
  }
  expect(() => invoke(event, { canExport: true, canImport: true }, 'extra')).toThrow('This request takes no arguments.')
  expect(() =>
    invoke({ senderFrame: { url: 'https://untrusted.test/' } }, { canExport: true, canImport: true }),
  ).toThrow('Untrusted renderer IPC call.')

  setNotesMenuState.mockImplementationOnce(() => {
    throw new Error('Menu failed')
  })

  expect(() => invoke(event, { canExport: false, canImport: false })).toThrow('Menu failed')
})
