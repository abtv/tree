import type { TreeApi } from '../shared/ipc'
import type { RendererLifecycleStore } from './lifecycle'

interface UpdateAttempt {
  id: string
  previousFocus: HTMLElement | null
}

/** Projects the main-process save request onto the renderer's input and persistence boundary. */
export function startAppUpdates(store: RendererLifecycleStore, api: TreeApi): () => void {
  let attempt: UpdateAttempt | undefined
  const root = document.getElementById('root')!
  const events = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'pointerdown', 'click']
  const block = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const unlock = (current = attempt) => {
    if (current === undefined || attempt !== current) return
    const previousFocus = current.previousFocus
    current.previousFocus = null
    attempt = undefined
    root.inert = false
    for (const event of events) window.removeEventListener(event, block, true)
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
  }
  const removeRequest = api.onAppUpdateRequested?.((id) => {
    if (attempt !== undefined) return
    const current: UpdateAttempt = {
      id,
      previousFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    }
    attempt = current
    root.inert = true
    for (const event of events) window.addEventListener(event, block, true)
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
