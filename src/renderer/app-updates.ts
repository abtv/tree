import type { TreeApi } from '../shared/ipc'
import type { RendererLifecycleStore } from './lifecycle'

/** Projects the main-process save request onto the renderer's input and persistence boundary. */
export function startAppUpdates(store: RendererLifecycleStore, api: TreeApi): () => void {
  let request: string | undefined
  let previousFocus: HTMLElement | null = null
  const root = document.getElementById('root')!
  const events = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'pointerdown', 'click']
  const block = (event: Event) => {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const unlock = () => {
    request = undefined
    root.inert = false
    for (const event of events) window.removeEventListener(event, block, true)
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    previousFocus = null
  }
  const removeRequest = api.onAppUpdateRequested?.((id) => {
    if (request !== undefined) return
    request = id
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    root.inert = true
    for (const event of events) window.addEventListener(event, block, true)
    void store
      .flushPersistence({ cancelImageRecognition: true })
      .then(async () => {
        if (request === id) await api.confirmAppUpdate?.(id, true)
      })
      .catch(async (error: unknown) => {
        if (request !== id) return
        store.reportError(error)
        try {
          await api.confirmAppUpdate?.(id, false)
        } catch (failure) {
          store.reportError(failure)
        } finally {
          unlock()
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
