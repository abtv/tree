import { describe, expect, it, vi } from 'vitest'
import { startRendererLifecycle, type RendererLifecycleStore } from './lifecycle'

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
})
