// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTES_REPLACED_MESSAGE, type ClipboardPayload, type TreeApi } from '../../shared/ipc'
import {
  attachmentImageCache,
  createElectronEditorServices,
  readAttachment,
  resumeNotesWrites,
  suspendNotesWrites,
} from './electron-services'
import { decodeAttachmentImage } from './attachment-image-cache'
import { dayNumberOf } from '../../domain/calendar-date'
import * as jsonEncoding from './encode-json'

describe('renderer Electron services', () => {
  it('does not send a snapshot whose encoding overlaps notes replacement', async () => {
    let release!: (text: string) => void
    const gate = new Promise<string>((resolve) => {
      release = resolve
    })
    const encode = vi.spyOn(jsonEncoding, 'encodeJson').mockReturnValueOnce(gate)
    const save = vi.fn(async () => undefined)
    window.treeApi = { ...window.treeApi, save }
    const state = {
      version: 4 as const,
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
      view: { expandedIds: [] },
    }
    const saving = createElectronEditorServices().save(state)

    suspendNotesWrites()
    release(JSON.stringify(state))
    try {
      await saving

      expect(save).not.toHaveBeenCalled()
    } finally {
      resumeNotesWrites()
      encode.mockRestore()
    }
  })

  it('preserves optional OCR availability, results and failures from the bridge', async () => {
    expect(createElectronEditorServices().imageToText).toBeUndefined()
    const imageToText = vi.fn<NonNullable<TreeApi['imageToText']>>(async () => ['First', '', 'Second'])
    window.treeApi = { ...window.treeApi, imageToText }
    const services = createElectronEditorServices()

    await expect(services.imageToText!('image-1')).resolves.toEqual(['First', '', 'Second'])

    expect(imageToText).toHaveBeenCalledExactlyOnceWith('image-1')
    const failure = new Error('Recognition unavailable')
    imageToText.mockRejectedValueOnce(failure)

    await expect(services.imageToText!('image-2')).rejects.toBe(failure)
  })

  it('propagates recent-node save failures from the bridge', async () => {
    const failure = new Error('history storage unavailable')
    window.treeApi = {
      ...window.treeApi,
      setRecentNodes: vi.fn(async () => {
        throw failure
      }),
    }

    await expect(createElectronEditorServices().saveRecentNodes!(['node-1'])).rejects.toBe(failure)
  })

  it('forwards history values and suppresses recent-node writes during replacement', async () => {
    const bridge = {
      ...window.treeApi,
      getEmojiHistory: vi.fn(async () => ['smile']),
      setEmojiHistory: vi.fn(async () => undefined),
      getRecentNodes: vi.fn(async () => ['node-1']),
      setRecentNodes: vi.fn(async () => undefined),
    }
    window.treeApi = bridge
    const services = createElectronEditorServices()

    await expect(services.loadEmojiHistory!()).resolves.toEqual(['smile'])
    await expect(services.loadRecentNodes!()).resolves.toEqual(['node-1'])
    await services.saveEmojiHistory!(['heart'])
    await services.saveRecentNodes!(['node-2'])

    expect(bridge.setEmojiHistory).toHaveBeenCalledExactlyOnceWith(['heart'])
    expect(bridge.setRecentNodes).toHaveBeenCalledExactlyOnceWith(['node-2'])
    suspendNotesWrites()
    try {
      await services.saveRecentNodes!(['stale'])
      expect(bridge.setRecentNodes).toHaveBeenCalledTimes(1)
    } finally {
      resumeNotesWrites()
    }
  })

  it('supports bridges without optional history or rich clipboard methods', async () => {
    const bridge = { ...window.treeApi }
    delete bridge.getEmojiHistory
    delete bridge.setEmojiHistory
    delete bridge.getRecentNodes
    delete bridge.setRecentNodes
    delete bridge.writeClipboardContent
    window.treeApi = bridge
    const services = createElectronEditorServices()

    await expect(services.loadEmojiHistory!()).resolves.toEqual([])
    await expect(services.loadRecentNodes!()).resolves.toEqual([])
    await expect(services.saveEmojiHistory!(['smile'])).resolves.toBeUndefined()
    await expect(services.saveRecentNodes!(['root'])).resolves.toBeUndefined()
    await expect(services.writeClipboardContent!({ kind: 'text', text: 'text' })).resolves.toBeUndefined()
  })

  it('provides the current local calendar day without an IPC call', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 9, 8, 23, 59))
      const services = createElectronEditorServices()

      expect(services.today!()).toBe(dayNumberOf({ year: 2026, month: 10, day: 8 }))

      vi.setSystemTime(new Date(2026, 9, 9, 0, 1))

      expect(services.today!()).toBe(dayNumberOf({ year: 2026, month: 10, day: 9 }))
    } finally {
      vi.useRealTimers()
    }
  })
  const api: TreeApi = {
    getAppearance: async () => 'system',
    setAppearance: async () => undefined,
    getCommandHistory: async () => [],
    setCommandHistory: async () => undefined,
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
    getLineNumbers: vi.fn(async () => false),
    setLineNumbers: vi.fn(async () => undefined),
    setVimEnabled: vi.fn(async () => undefined),
  }

  beforeEach(() => {
    window.treeApi = api
    attachmentImageCache.clear()
    vi.clearAllMocks()
    // jsdom does not decode images.
    Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: async () => undefined })
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:attachment' })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
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
    expect(api.save).toHaveBeenCalledWith(JSON.stringify(state))
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

  it('drops document and image writes while an import replaces the notes, then forwards them again', async () => {
    api.load = vi.fn(async () => null)
    window.treeApi = api
    const services = createElectronEditorServices()
    const state = {
      version: 2 as const,
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }

    suspendNotesWrites()
    try {
      await expect(services.save(state)).resolves.toBeUndefined()
      await expect(services.writeAttachment('attachment-1', new Uint8Array([1]))).resolves.toBeUndefined()
      await expect(services.cleanupAttachments([])).resolves.toBeUndefined()

      // Reads still reach the main process.
      await services.load()

      expect(api.save).not.toHaveBeenCalled()
      expect(api.writeAttachment).not.toHaveBeenCalled()
      expect(api.cleanupAttachments).not.toHaveBeenCalled()
      expect(api.load).toHaveBeenCalledOnce()
    } finally {
      resumeNotesWrites()
    }

    await services.save(state)

    expect(api.save).toHaveBeenCalledExactlyOnceWith(JSON.stringify(state))
  })

  it('suspends writes when the main process reports that the notes were replaced', async () => {
    const services = createElectronEditorServices()
    const state = {
      version: 2 as const,
      document: { roots: [{ id: 'root', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    }
    const replaced = new Error(`Error invoking remote method 'tree:save': Error: ${NOTES_REPLACED_MESSAGE}`)
    const other = new Error('disk full')
    api.save = vi.fn(async () => {
      throw replaced
    })
    api.writeAttachment = vi.fn(async () => {
      throw other
    })
    window.treeApi = api
    try {
      await expect(services.writeAttachment('attachment-1', new Uint8Array([1]))).rejects.toBe(other)
      await expect(services.save(state)).resolves.toBeUndefined()
      await expect(services.writeAttachment('attachment-1', new Uint8Array([1]))).resolves.toBeUndefined()
      expect(api.save).toHaveBeenCalledOnce()
      expect(api.writeAttachment).toHaveBeenCalledOnce()
    } finally {
      resumeNotesWrites()
      api.save = vi.fn(async () => undefined)
      api.writeAttachment = vi.fn(async () => undefined)
    }
  })

  it('provides a no-op optional clipboard writer when the bridge omits it', async () => {
    const { writeClipboard, ...apiWithoutWriter } = api
    window.treeApi = apiWithoutWriter

    await expect(createElectronEditorServices().writeClipboard?.({ text: '', html: '' })).resolves.toBeUndefined()
    expect(writeClipboard).not.toHaveBeenCalled()
  })

  it('caches decoded attachment images for repeated access', async () => {
    api.readAttachment = vi.fn(async () => new Uint8Array([1, 2, 3]))
    window.treeApi = api

    const first = await attachmentImageCache.get('attachment-1')

    expect(first).toMatchObject({ url: 'blob:attachment' })
    await expect(attachmentImageCache.get('attachment-1')).resolves.toBe(first)

    expect(api.readAttachment).toHaveBeenCalledTimes(1)
  })

  it('retains decoded images up to the configured 512 MiB budget and evicts beyond it', async () => {
    const width = vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(4096)
    const height = vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(4096)
    api.readAttachment = vi.fn(async () => new Uint8Array([1]))
    try {
      const first = await attachmentImageCache.get('image-0')
      for (let index = 1; index < 7; index += 1) await attachmentImageCache.get(`image-${index}`)

      expect(attachmentImageCache.peek('image-0')).toBe(first)

      await attachmentImageCache.get('image-7')

      expect(attachmentImageCache.peek('image-0')).toBeUndefined()
      expect(attachmentImageCache.peek('image-1')).toBeDefined()
    } finally {
      width.mockRestore()
      height.mockRestore()
    }
  })

  it('keeps cached attachment read failures as rejected promises', async () => {
    const failure = new Error('renderer bridge failed')
    api.readAttachment = vi.fn(async () => {
      throw failure
    })
    window.treeApi = api

    await expect(attachmentImageCache.get('attachment-1')).rejects.toBe(failure)
  })

  it('revokes the object URL when an image cannot be decoded', async () => {
    const failure = new Error('invalid image')
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: async () => {
        throw failure
      },
    })

    await expect(decodeAttachmentImage(new Uint8Array([1]))).rejects.toBe(failure)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:attachment')
  })

  it('keeps a decoded image until it is released', async () => {
    const image = await decodeAttachmentImage(new Uint8Array([1]))

    expect(URL.revokeObjectURL).not.toHaveBeenCalled()

    image.release()

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:attachment')
  })

  it('creates a PNG blob and drops the image source when decoded pixels are released', async () => {
    const element = document.createElement('img')
    const constructor = vi.spyOn(globalThis, 'Image').mockImplementation(function () {
      return element
    })
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    try {
      const decoded = await decodeAttachmentImage(new Uint8Array([1, 2, 3]))

      expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png', size: 3 }))
      expect(element.getAttribute('src')).toBe('blob:attachment')

      decoded.release()

      expect(element.hasAttribute('src')).toBe(false)
      expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:attachment')
    } finally {
      constructor.mockRestore()
      createUrl.mockRestore()
    }
  })
})
