import type { TreeApi } from '../shared/ipc'
import type { RendererLifecycleStore } from './lifecycle'
import { createRendererInputLock } from './renderer-input-lock'

interface UpdateAttempt {
  id: string
  releaseInput(): void
}

/** Projects the main-process save request onto the renderer's input and persistence boundary. */
export function startAppUpdates(
  store: RendererLifecycleStore,
  api: TreeApi,
  lockInput = createRendererInputLock(document.getElementById('root')!),
): () => void {
  let attempt: UpdateAttempt | undefined
  const unlock = (current = attempt) => {
    if (current === undefined || attempt !== current) return
    attempt = undefined
    current.releaseInput()
  }
  const removeRequest = api.onAppUpdateRequested?.((id) => {
    if (attempt !== undefined) return
    const current: UpdateAttempt = {
      id,
      releaseInput: lockInput(),
    }
    attempt = current
    void store
      .flushPersistence({ cancelImageRecognition: true })
      .then(async () => {
        if (attempt === current) await api.confirmAppUpdate?.(current.id, true)
      })
      .catch(async (error: unknown) => {
        if (attempt !== current) return
        store.reportError(error)
        try {
          await api.confirmAppUpdate?.(current.id, false)
        } catch (failure) {
          if (attempt === current) store.reportError(failure)
        } finally {
          unlock(current)
        }
      })
  })
  const removeFinished = api.onAppUpdateFinished?.((message) => {
    unlock()
    if (message !== null) store.reportError(new Error(message))
  })
  const online = () => {
    void api.checkAppUpdate?.().catch((error: unknown) => store.reportError(error))
  }
  window.addEventListener('online', online)
  return () => {
    unlock()
    removeRequest?.()
    removeFinished?.()
    window.removeEventListener('online', online)
  }
}
