import { describe, expect, it, vi } from 'vitest'
import { startRendererLifecycle, type RendererLifecycleStore } from './lifecycle'
import { EditorStore, type EditorServices } from '../application/editor-store'

function createHarness() {
  let quitRequested: ((requestId: string) => void) | undefined
  let quitFailed: ((requestId: string, message: string) => void) | undefined
  const treeApi = {
    quit: vi.fn(async () => undefined),
    cancelQuit: vi.fn(async () => undefined),
    onQuitRequested: vi.fn((listener: (requestId: string) => void) => {
      quitRequested = listener
      return vi.fn()
    }),
    onQuitFailed: vi.fn((listener: (requestId: string, message: string) => void) => {
      quitFailed = listener
      return vi.fn()
    }),
  }
  const store: RendererLifecycleStore = {
    initialize: vi.fn(async () => undefined),
    flushPersistence: vi.fn(async () => undefined),
    reportError: vi.fn(),
    requestQuitWithoutSavingPrompt: vi.fn(),
  }
  return {
    treeApi,
    store,
    fireQuit: (id: string) => quitRequested?.(id),
    fireQuitFailed: (id: string, message: string) => quitFailed?.(id, message),
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
    expect(store.flushPersistence).toHaveBeenCalledWith({
      cancelImageRecognition: true,
      sealEditsUntil: expect.any(AbortSignal),
    })
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
    expect(store.requestQuitWithoutSavingPrompt).toHaveBeenCalledOnce()
    expect(treeApi.quit).not.toHaveBeenCalled()
    expect(treeApi.cancelQuit).toHaveBeenCalledExactlyOnceWith('request-1')
  })

  it('reports a main-process shutdown failure', () => {
    const { store, treeApi, fireQuit, fireQuitFailed } = createHarness()

    startRendererLifecycle(store, treeApi)
    fireQuit('current')
    fireQuitFailed('current', 'quit failed')

    expect(store.reportError).toHaveBeenCalledWith(new Error('quit failed'))
  })

  it.each(['resolve', 'reject'] as const)(
    'keeps the retry sealed when an obsolete acknowledgement later %ss',
    async (outcome) => {
      const h = createHarness()
      const release = vi.fn()
      const lock = vi.fn(() => release)
      let resolve!: () => void
      let reject!: (error: Error) => void
      h.treeApi.quit.mockImplementationOnce(
        () =>
          new Promise<undefined>((yes, no) => {
            resolve = () => yes(undefined)
            reject = no
          }),
      )
      const dispose = startRendererLifecycle(h.store, h.treeApi, lock)

      h.fireQuit('old')
      expect(lock).not.toHaveBeenCalled()
      await vi.waitFor(() => expect(h.treeApi.quit).toHaveBeenCalledWith('old'))
      const signal = vi.mocked(h.store.flushPersistence).mock.calls[0]![0]!.sealEditsUntil!
      h.fireQuitFailed('old', 'timeout')
      expect(signal.aborted).toBe(true)
      expect(release).toHaveBeenCalledOnce()
      h.fireQuit('new')
      await vi.waitFor(() => expect(h.treeApi.quit).toHaveBeenCalledWith('new'))
      h.fireQuitFailed('old', 'stale failure')
      if (outcome === 'resolve') resolve()
      else reject(new Error('stale acknowledgement'))
      await new Promise<void>((done) => setTimeout(done, 0))

      expect(lock).toHaveBeenCalledTimes(2)
      expect(release).toHaveBeenCalledOnce()
      expect(h.store.reportError).toHaveBeenCalledExactlyOnceWith(new Error('timeout'))
      expect(h.store.requestQuitWithoutSavingPrompt).not.toHaveBeenCalled()
      dispose()
      expect(release).toHaveBeenCalledTimes(2)
    },
  )

  it('rejects document edits only after a drained quit flush and accepts them again after cancellation', async () => {
    const noop = async () => undefined
    const store = new EditorStore(
      {
        load: async () => null,
        save: noop,
        cleanupAttachments: noop,
        readClipboard: async () => ({ kind: 'text', text: 'P' }),
        writeAttachment: noop,
      },
      () => 'one',
    )
    await store.initialize()
    const attempt = new AbortController()
    const flushed = store.flushPersistence({ sealEditsUntil: attempt.signal })
    store.editText('one', 'before')
    await flushed

    const obsolete = new AbortController()
    obsolete.abort()
    await store.flushPersistence({ sealEditsUntil: obsolete.signal })

    store.editText('one', 'late')
    await store.paste('one', 0)
    store.undo()
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'before' }] } })

    attempt.abort()
    store.editText('one', 'resumed')
    expect(store.getSnapshot()).toMatchObject({ document: { roots: [{ text: 'resumed' }] } })
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
