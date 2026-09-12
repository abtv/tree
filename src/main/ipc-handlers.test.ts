import { describe, expect, it, vi } from 'vitest'
import { ipcChannels } from '../shared/ipc'
import type { FileServices } from '../infrastructure/main/file-services'
import { registerIpcHandlers, type IpcInvokeEvent } from './ipc-handlers'

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
    hasAttachment: vi.fn(async () => true),
    readAttachment: vi.fn(async () => null),
    cleanupAttachments: vi.fn(async () => undefined),
  }
  const nativeClipboard = {
    read: vi.fn(async () => []),
    readText: vi.fn(async () => ''),
  }
  const quitHandshake = { request: vi.fn(), confirm: vi.fn(() => true) }
  const onQuitConfirmed = vi.fn()
  registerIpcHandlers({ ipcMain, rendererUrl, fileServices, nativeClipboard, quitHandshake, onQuitConfirmed })
  return { handlers, fileServices, nativeClipboard, quitHandshake, onQuitConfirmed }
}

describe('main IPC handlers', () => {
  it('registers every exposed IPC channel', () => {
    const { handlers } = createHarness()

    expect([...handlers.keys()]).toEqual(Object.values(ipcChannels))
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

  it('forwards validated persistence and attachment arguments', async () => {
    const { handlers, fileServices } = createHarness()
    const event = { senderFrame: { url: rendererUrl } }
    const bytes = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
    ])

    await handlers.get(ipcChannels.save)!(event, validState)
    await handlers.get(ipcChannels.writeAttachment)!(event, 'image-1', bytes)
    await handlers.get(ipcChannels.cleanupAttachments)!(event, ['image-1'])

    expect(fileServices.save).toHaveBeenCalledWith({ ...validState, version: 2 })
    expect(fileServices.writeAttachment).toHaveBeenCalledWith('image-1', bytes)
    expect(fileServices.cleanupAttachments).toHaveBeenCalledWith(['image-1'])
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
})
