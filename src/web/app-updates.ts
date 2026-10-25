import type { EditorStore } from '../application/editor-store'
import type { DataSession } from './services'
import type { MenuFocus } from './menu-focus'

const runtimeAssets = () => [
  import.meta.url,
  ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (link) => link.href),
]

async function runtimeIsCached(worker: ServiceWorker): Promise<boolean> {
  const channel = new MessageChannel()
  try {
    return await bounded(
      new Promise<boolean>((resolve) => {
        channel.port1.onmessage = (event: MessageEvent<{ ready?: unknown } | null>) =>
          resolve(event.data?.ready === true)
        worker.postMessage({ type: 'tree-offline-status', assets: runtimeAssets() }, [channel.port2])
      }),
      'Offline access could not be verified',
    )
  } finally {
    channel.port1.close()
    channel.port2.close()
  }
}

function bounded<T>(promise: Promise<T>, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), 15_000)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

async function waitForController(worker: ServiceWorker) {
  const container = navigator.serviceWorker
  let changed: (() => void) | undefined
  try {
    await bounded(
      new Promise<void>((resolve) => {
        changed = () => {
          if (container.controller === worker) resolve()
        }
        container.addEventListener('controllerchange', changed)
        changed()
      }),
      'The new version did not take control. Try Update App again.',
    )
  } finally {
    if (changed) container.removeEventListener('controllerchange', changed)
  }
}

export async function activateUpdate(worker: ServiceWorker): Promise<void> {
  const channel = new MessageChannel()
  let changed: (() => void) | undefined
  try {
    await bounded(
      new Promise<void>((resolve, reject) => {
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
          if (event.data === 'activating') resolve()
          else if (event.data === 'other-windows')
            reject(new Error('Close other Tree tabs and windows, then try Update App again.'))
          else reject(new Error('This update was replaced. Reconnect and try Update App again.'))
        }
        worker.postMessage(
          {
            type: 'tree-activate-update',
            assets: runtimeAssets(),
          },
          [channel.port2],
        )
      }),
      'The update did not respond. Try Update App again.',
    )
    if (worker.state === 'activated') return
    await bounded(
      new Promise<void>((resolve, reject) => {
        changed = () => {
          if (worker.state === 'activated' || worker.state === 'redundant') {
            if (worker.state === 'activated') resolve()
            else reject(new Error('This update is no longer available. Try again when connected.'))
          }
        }
        worker.addEventListener('statechange', changed)
        changed()
      }),
      'The update did not finish. Try Update App again.',
    )
  } finally {
    if (changed) worker.removeEventListener('statechange', changed)
    channel.port1.close()
    channel.port2.close()
  }
}

/** Browser-only lifecycle; installing an update never reloads an editing session. */
export function installAppUpdates(
  store: EditorStore,
  session: DataSession,
  focus: Pick<MenuFocus, 'close'>,
  dataOperationRunning: () => boolean,
) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const button = document.getElementById('app-update') as HTMLButtonElement
  const trigger = document.getElementById('tree-menu-button')!
  const status = document.getElementById('offline-status')!
  const root = document.getElementById('root')!
  let registration: ServiceWorkerRegistration | undefined
  let applying = false
  let checking = false
  let requestedWorker: ServiceWorker | undefined
  const updateWorker = () =>
    requestedWorker && ['activating', 'activated'].includes(requestedWorker.state)
      ? requestedWorker
      : registration?.waiting
  const show = (text: string) => {
    status.hidden = false
    status.textContent = text
  }
  const render = () => {
    const waiting = updateWorker() !== undefined && updateWorker() !== null
    button.hidden = !waiting
    button.disabled = applying
    trigger.classList.toggle('update-attention', waiting)
    trigger.setAttribute('aria-description', waiting ? 'An app update is ready' : '')
  }
  const assessOffline = async (worker: ServiceWorker) => {
    try {
      const ready = await runtimeIsCached(worker)
      if (applying) return
      if (ready) show('Ready to work offline')
      else {
        requestedWorker = worker
        show('Update App to enable offline access')
        render()
      }
    } catch {
      if (!applying) show('Offline setup incomplete — reconnect to try again')
    }
  }
  const observe = (worker: ServiceWorker) => {
    worker.addEventListener('statechange', () => {
      render()
      if (worker.state === 'activated') void assessOffline(worker)
      if (worker.state === 'redundant' && !registration?.active) {
        show('Offline setup incomplete — reconnect to try again')
      }
    })
  }
  const check = async () => {
    if (checking || applying) return
    checking = true
    try {
      if (!registration || (!registration.active && !registration.installing && !registration.waiting)) {
        registration = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), {
          updateViaCache: 'none',
        })
        registration.addEventListener('updatefound', () => {
          if (registration?.installing) observe(registration.installing)
        })
        if (registration.installing) observe(registration.installing)
        if (registration.active) void assessOffline(registration.active)
        else show('Preparing offline access…')
      } else {
        await registration.update()
        if (registration.active) void assessOffline(registration.active)
      }
      render()
    } catch {
      if (!registration?.active) show('Offline setup incomplete — reconnect to try again')
    } finally {
      checking = false
    }
  }
  button.onclick = async () => {
    const worker = updateWorker()
    if (!worker || applying) return
    // Archive/import work owns the saved head while these actions are disabled.
    if (dataOperationRunning()) {
      show('Finish the current data operation before updating')
      return
    }
    applying = true
    focus.close()
    root.inert = true
    const block = (event: Event) => {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    const events = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'pointerdown', 'click']
    for (const event of events) window.addEventListener(event, block, true)
    let resume: (() => void) | undefined
    render()
    show('Saving before updating…')
    try {
      await bounded(store.flushPersistence(), 'Saving took too long. Keep this tab open and try again.')
      resume = session.suspendWrites()
      requestedWorker = worker
      if (worker.state !== 'activated' && worker.state !== 'activating') await activateUpdate(worker)
      await waitForController(worker)
      location.reload()
    } catch (error) {
      resume?.()
      root.inert = false
      applying = false
      for (const event of events) window.removeEventListener(event, block, true)
      show(error instanceof Error ? error.message : 'Update failed. Keep this tab open and try again.')
      render()
      document.getElementById('tree-menu')!.showPopover()
      button.focus()
    }
  }
  window.addEventListener('online', () => void check())
  void check()
}
