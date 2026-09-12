import type { TreeApi } from '../shared/ipc'

export interface RendererLifecycleStore {
  initialize(): Promise<void>
  flushPersistence(): Promise<void>
  reportError(error: unknown): void
}

export function startRendererLifecycle(
  store: RendererLifecycleStore,
  treeApi: Pick<TreeApi, 'quit' | 'onQuitRequested' | 'onQuitFailed'>,
): () => void {
  void store.initialize()
  const removeQuitRequested = treeApi.onQuitRequested((requestId) => {
    void store
      .flushPersistence()
      .then(() => treeApi.quit(requestId))
      .catch((error: unknown) => store.reportError(error))
  })
  const removeQuitFailed = treeApi.onQuitFailed((message) => store.reportError(new Error(message)))
  return () => {
    removeQuitRequested()
    removeQuitFailed()
  }
}
