// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClipboardPayload, TreeApi } from '../../shared/ipc'
import { attachmentByteCache, createElectronEditorServices, readAttachment } from './electron-services'

describe('renderer Electron services', () => {
  const api: TreeApi = {
    quit: vi.fn(async () => undefined),
    quitWithoutSaving: vi.fn(async () => undefined),
    onQuitRequested: vi.fn(() => () => undefined),
    onQuitFailed: vi.fn(() => () => undefined),
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    readClipboard: vi.fn(async (): Promise<ClipboardPayload> => ({ kind: 'text', text: '' })),
    writeClipboard: vi.fn(async () => undefined),
    writeClipboardContent: vi.fn(async () => undefined),
    writeAttachment: vi.fn(async () => undefined),
    readAttachment: vi.fn(async () => new Uint8Array([1, 2, 3])),
    cleanupAttachments: vi.fn(async () => undefined),
    getAlwaysOnTop: vi.fn(async () => false),
    setAlwaysOnTop: vi.fn(async () => undefined),
    getVimEnabled: vi.fn(async () => false),
    setVimEnabled: vi.fn(async () => undefined),
  }

  beforeEach(() => {
    window.treeApi = api
    attachmentByteCache.clear()
    vi.clearAllMocks()
  })

  it('forwards every editor service call and preserves return values', async () => {
    const services = createElectronEditorServices()
    const state = {
      version: 2 as const,
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }
    const payload = { text: 'text', html: '<p>text</p>' }
    const bytes = new Uint8Array([1, 2, 3])

    await expect(services.load()).resolves.toBeNull()
    await services.save(state)
    await expect(services.readClipboard()).resolves.toEqual({ kind: 'text', text: '' })
    await services.writeClipboard?.(payload)
    await services.writeClipboardContent?.({ kind: 'text', text: 'plain' })
    await services.writeClipboardContent?.({ kind: 'image', attachmentId: 'attachment-1' })
    await services.writeAttachment('attachment-1', bytes)
    await services.cleanupAttachments(['attachment-1'])
    await expect(readAttachment('attachment-1')).resolves.toEqual(bytes)

    expect(api.load).toHaveBeenCalledWith()
    expect(api.save).toHaveBeenCalledWith(state)
    expect(api.readClipboard).toHaveBeenCalledWith()
    expect(api.writeClipboard).toHaveBeenCalledWith(payload)
    expect(api.writeClipboardContent).toHaveBeenCalledWith({ kind: 'text', text: 'plain' })
    expect(api.writeClipboardContent).toHaveBeenCalledWith({ kind: 'image', attachmentId: 'attachment-1' })
    expect(api.writeAttachment).toHaveBeenCalledWith('attachment-1', bytes)
    expect(api.cleanupAttachments).toHaveBeenCalledWith(['attachment-1'])
    expect(api.readAttachment).toHaveBeenCalledWith('attachment-1')
  })

  it('keeps service failures as rejected promises', async () => {
    const failure = new Error('renderer bridge failed')
    api.load = vi.fn(async () => {
      throw failure
    })
    api.readAttachment = vi.fn(async () => {
      throw failure
    })
    api.writeClipboardContent = vi.fn(async () => {
      throw failure
    })
    window.treeApi = api

    await expect(createElectronEditorServices().load()).rejects.toBe(failure)
    await expect(readAttachment('attachment-1')).rejects.toBe(failure)
    await expect(createElectronEditorServices().writeClipboardContent?.({ kind: 'text', text: 'plain' })).rejects.toBe(
      failure,
    )
  })

  it('provides a no-op optional clipboard writer when the bridge omits it', async () => {
    const { writeClipboard, ...apiWithoutWriter } = api
    window.treeApi = apiWithoutWriter

    await expect(createElectronEditorServices().writeClipboard?.({ text: '', html: '' })).resolves.toBeUndefined()
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('caches attachment reads for repeated access', async () => {
    api.readAttachment = vi.fn(async () => new Uint8Array([1, 2, 3]))
    window.treeApi = api

    await expect(attachmentByteCache.get('attachment-1')).resolves.toEqual(new Uint8Array([1, 2, 3]))
    await expect(attachmentByteCache.get('attachment-1')).resolves.toEqual(new Uint8Array([1, 2, 3]))

    expect(api.readAttachment).toHaveBeenCalledTimes(1)
  })

  it('keeps cached attachment read failures as rejected promises', async () => {
    const failure = new Error('renderer bridge failed')
    api.readAttachment = vi.fn(async () => {
      throw failure
    })
    window.treeApi = api

    await expect(attachmentByteCache.get('attachment-1')).rejects.toBe(failure)
  })
})
