import { describe, expect, it, vi } from 'vitest'
import { startRendererLifecycle, type RendererLifecycleStore } from './lifecycle'
import { EditorStore, type EditorServices } from '../application/editor-store'

function createHarness() {
  let quitRequested: ((requestId: string) => void) | undefined
  let quitFailed: ((message: string) => void) | undefined
  const treeApi = {
    quit: vi.fn(async () => undefined),
    onQuitRequested: vi.fn((listener: (requestId: string) => void) => {
      quitRequested = listener
      return vi.fn()
    }),
    onQuitFailed: vi.fn((listener: (message: string) => void) => {
      quitFailed = listener
      return vi.fn()
    }),
  }
  const store: RendererLifecycleStore = {
    initialize: vi.fn(async () => undefined),
    flushPersistence: vi.fn(async () => undefined),
    reportError: vi.fn(),
  }
  return {
    treeApi,
    store,
    fireQuit: (id: string) => quitRequested?.(id),
    fireQuitFailed: (message: string) => quitFailed?.(message),
  }
}

describe('renderer lifecycle', () => {
  it('initializes the store and confirms shutdown after persistence flush', async () => {
    const { treeApi, store, fireQuit } = createHarness()

    const cleanup = startRendererLifecycle(store, treeApi)
    fireQuit('request-1')
    await Promise.resolve()
    await Promise.resolve()

    expect(store.initialize).toHaveBeenCalledOnce()
    expect(store.flushPersistence).toHaveBeenCalledOnce()
    expect(treeApi.quit).toHaveBeenCalledWith('request-1')
    cleanup()
  })

  it('reports a persistence failure and does not confirm shutdown', async () => {
    const { treeApi, store, fireQuit } = createHarness()
    vi.mocked(store.flushPersistence).mockRejectedValueOnce(new Error('save failed'))

    startRendererLifecycle(store, treeApi)
    fireQuit('request-1')
    await Promise.resolve()
    await Promise.resolve()

    expect(store.reportError).toHaveBeenCalledWith(new Error('save failed'))
    expect(treeApi.quit).not.toHaveBeenCalled()
  })

  it('reports a main-process shutdown failure', () => {
    const { store, treeApi, fireQuitFailed } = createHarness()

    startRendererLifecycle(store, treeApi)
    fireQuitFailed('quit failed')

    expect(store.reportError).toHaveBeenCalledWith(new Error('quit failed'))
  })

  it.each([false, true])(
    'does not acknowledge quit before a pending attachment settles (failure: %s)',
    async (fail) => {
      const { treeApi, fireQuit } = createHarness()
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const services: EditorServices = {
        load: async () => null,
        save: vi.fn(async () => undefined),
        cleanupAttachments: async () => undefined,
        readClipboard: async () => ({ kind: 'image', png: new Uint8Array([1]) }),
        hasAttachment: async () => true,
        writeAttachment: vi.fn(async () => {
          await gate
          if (fail) throw new Error('attachment failed')
        }),
      }
      let id = 0
      const store = new EditorStore(services, () => `id-${id++}`)
      const cleanup = startRendererLifecycle(store, treeApi)
      await vi.waitFor(() => expect(store.getSnapshot().status).toBe('ready'))
      await store.flushPersistence()
      const paste = store.paste('id-0', 0).catch((error: unknown) => store.reportError(error))
      await vi.waitFor(() => expect(services.writeAttachment).toHaveBeenCalledOnce())

      fireQuit('pending-image')
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(treeApi.quit).not.toHaveBeenCalled()
      release()
      await paste
      if (fail) {
        await vi.waitFor(() => expect(store.getSnapshot()).toMatchObject({ operationError: 'attachment failed' }))
        expect(treeApi.quit).not.toHaveBeenCalled()
        fireQuit('retry')
        await vi.waitFor(() => expect(treeApi.quit).toHaveBeenCalledWith('retry'))
      } else {
        await vi.waitFor(() => expect(treeApi.quit).toHaveBeenCalledWith('pending-image'))
        expect(services.save).toHaveBeenLastCalledWith(
          expect.objectContaining({
            document: {
              roots: [{ id: 'id-0', text: '', children: [], attachment: { id: 'id-1', mimeType: 'image/png' } }],
            },
          }),
        )
      }
      cleanup()
    },
  )
})
