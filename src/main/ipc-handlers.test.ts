import { describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '../shared/ipc'
import type { FileServices } from '../infrastructure/main/file-services'
import { registerIpcHandlers, type IpcInvokeEvent } from './ipc-handlers'
import { MAX_CONTEXT_MENU_SELECTION_CODE_POINTS } from './ipc-security'
import { decodePngWithZlib, onePixelPng, pngIhdr, pngWith } from './png-test-utils'

const rendererUrl = 'file:///app/out/renderer/index.html'
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
    read: vi.fn(async () => []),
    readText: vi.fn(async () => ''),
  }
  const quitHandshake = { request: vi.fn(), confirm: vi.fn(() => true), force: vi.fn() }
  const onQuitConfirmed = vi.fn()
  const showEditorContextMenu = vi.fn(async () => 'copy' as const)
  const getAlwaysOnTop = vi.fn(() => false)
  const setAlwaysOnTop = vi.fn()
  const decodePng = vi.fn(decodePngWithZlib)
  registerIpcHandlers({
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
  })
  return {
    handlers,
    fileServices,
    nativeClipboard,
    quitHandshake,
    onQuitConfirmed,
    decodePng,
    showEditorContextMenu,
    getAlwaysOnTop,
    setAlwaysOnTop,
  }
}

describe('main IPC handlers', () => {
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
    const state = { ...base, view: { expandedIds: ['root'], scrollTop: 24 } }

    await handlers.get(ipcChannels.save)!(event, state)
    expect(vi.mocked(fileServices.save).mock.calls[0]![0]).toBe(state)

    for (const view of [undefined, { expandedIds: 'root' }, { expandedIds: [7] }, { expandedIds: [], scrollTop: -5 }]) {
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

    expect([...handlers.keys()]).toEqual(Object.values(ipcChannels))
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
