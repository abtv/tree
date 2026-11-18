import type { TreeApi } from '../shared/ipc'

export interface RendererLifecycleStore {
  initialize(): Promise<void>
  flushPersistence(options?: { cancelImageRecognition?: boolean; sealEditsUntil?: AbortSignal }): Promise<void>
  reportError(error: unknown): void
  requestQuitWithoutSavingPrompt(): void
}

export function startRendererLifecycle(
  store: RendererLifecycleStore,
  treeApi: Pick<TreeApi, 'quit' | 'cancelQuit' | 'onQuitRequested' | 'onQuitFailed'>,
  lockInput: () => () => void = () => () => undefined,
): () => void {
  void store.initialize()
  let current: { id: string; edits: AbortController; releaseInput?: () => void } | undefined
  const cancel = (): void => {
    current?.edits.abort()
    current?.releaseInput?.()
    current = undefined
  }
  const removeQuitRequested = treeApi.onQuitRequested((requestId) => {
    cancel()
    const attempt: NonNullable<typeof current> = { id: requestId, edits: new AbortController() }
    current = attempt
    void store
      .flushPersistence({ cancelImageRecognition: true, sealEditsUntil: attempt.edits.signal })
      .then(() => {
        if (current !== attempt) return
        attempt.releaseInput = lockInput()
        return treeApi.quit(requestId)
      })
      .catch((error: unknown) => {
        if (current !== attempt) return
        cancel()
        void treeApi.cancelQuit?.(requestId).catch((failure: unknown) => store.reportError(failure))
        store.reportError(error)
        store.requestQuitWithoutSavingPrompt()
      })
  })
  const removeQuitFailed = treeApi.onQuitFailed((id, message) => {
    if (current?.id !== id) return
    cancel()
    store.reportError(new Error(message))
  })
  return () => {
    cancel()
    removeQuitRequested()
    removeQuitFailed()
  }
}
