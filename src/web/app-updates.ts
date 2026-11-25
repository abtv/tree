import type { EditorStore } from '../application/editor-store'
import { createRendererInputLock } from '../renderer/renderer-input-lock'
import type { DataSession } from './services'
import type { MenuFocus } from './menu-focus'
import type { BrowserMenuCommands } from './menu-commands'
import { otherWindowsMessage, pageAdmissionLock, reopenUpdateMessage, updateResponseTimeout } from './page-admission'

const runtimeAssets = () => [
  import.meta.url,
  ...Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'), (link) => link.href),
]

async function readOfflineStatus(worker: ServiceWorker, checkWindows = false) {
  const channel = new MessageChannel()
  try {
    return await bounded(
      new Promise<{ ready?: unknown; onlyWindow?: unknown } | null>((resolve) => {
        channel.port1.onmessage = (event) => resolve(event.data)
        worker.postMessage(
          { type: 'tree-offline-status', assets: runtimeAssets(), ...(checkWindows && { checkWindows }) },
          [channel.port2],
        )
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
    const timer = setTimeout(() => reject(new Error(message)), updateResponseTimeout)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

const requestedUpdateMessage = 'The update was requested. You can keep editing here and retry Update App to reload.'

async function waitForController(worker: ServiceWorker) {
  const container = navigator.serviceWorker
  let changed: (() => void) | undefined
  try {
    await bounded(
      new Promise<void>((resolve, reject) => {
        changed = () => {
          if (worker.state === 'redundant')
            reject(new Error('This update was replaced. Reconnect and try Update App again.'))
          else if (container.controller === worker && worker.state === 'activated') resolve()
        }
        container.addEventListener('controllerchange', changed)
        worker.addEventListener('statechange', changed)
        changed()
      }),
      requestedUpdateMessage,
    )
  } finally {
    if (changed) {
      container.removeEventListener('controllerchange', changed)
      worker.removeEventListener('statechange', changed)
    }
  }
}

export async function activateUpdate(worker: ServiceWorker): Promise<void> {
  const channel = new MessageChannel()
  let changed: (() => void) | undefined
  const exchange = (expected: 'prepared' | 'activating', send: () => void, timeout: string) =>
    bounded(
      new Promise<void>((resolve, reject) => {
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
          if (event.data === expected) resolve()
          else if (event.data === 'other-windows') reject(new Error(otherWindowsMessage))
          else if (event.data === 'activation-failed')
            reject(new Error('The update did not finish. Try Update App again.'))
          else if (event.data && typeof event.data === 'object' && 'ready' in event.data)
            reject(new Error(reopenUpdateMessage))
          else reject(new Error('This update was replaced. Reconnect and try Update App again.'))
        }
        send()
      }),
      timeout,
    )
  try {
    await exchange(
      'prepared',
      () =>
        worker.postMessage({ type: 'tree-offline-status', prepareUpdate: true, assets: runtimeAssets() }, [
          channel.port2,
        ]),
      'The update did not respond. Try Update App again.',
    )
    await exchange('activating', () => channel.port1.postMessage('commit'), requestedUpdateMessage)
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
      requestedUpdateMessage,
    )
  } catch (error) {
    channel.port1.postMessage('cancel')
    throw error
  } finally {
    if (changed) worker.removeEventListener('statechange', changed)
    channel.port1.onmessage = null
    channel.port1.close()
    channel.port2.close()
  }
}

/** Browser-only lifecycle; installing an update never reloads an editing session. */
export function installAppUpdates(
  store: EditorStore,
  session: DataSession,
  focus: Pick<MenuFocus, 'close'>,
  tryBeginUpdate: () => (() => void) | undefined,
  commands: BrowserMenuCommands,
) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const button = document.getElementById('app-update') as HTMLButtonElement
  const trigger = document.getElementById('tree-menu-button')!
  const status = document.getElementById('offline-status')!
  const activity = document.getElementById('data-activity')!
  const lockInput = createRendererInputLock(document.getElementById('root')!)
  let registration: ServiceWorkerRegistration | undefined
  let application: 'idle' | 'applying' | 'retry' = 'idle'
  let checkInFlight: { reconnected: boolean } | undefined
  let recheckAfterApply = false
  let assessment = 0
  let mismatchedWorker: ServiceWorker | undefined
  let requestedWorker: ServiceWorker | undefined
  const observedWorkers = new WeakSet<ServiceWorker>()
  const updateWorker = () => {
    // A mismatched first page needs the active offline package before it can retain its runtime across an upgrade.
    if (mismatchedWorker && mismatchedWorker !== requestedWorker && registration?.active === mismatchedWorker)
      return mismatchedWorker
    return (
      registration?.waiting ??
      (requestedWorker && ['activating', 'activated'].includes(requestedWorker.state) ? requestedWorker : undefined)
    )
  }
  const show = (text: string, before = activity) => {
    if (status.nextElementSibling !== before) before.before(status)
    status.hidden = false
    status.textContent = text
  }
  const render = () => {
    const waiting = updateWorker() !== undefined
    publishUpdate(waiting ? 'update-app' : undefined, application !== 'applying')
    trigger.classList.toggle('update-attention', waiting)
    trigger.setAttribute('aria-description', waiting ? 'An app update is ready' : '')
  }
  const assessOffline = async (worker: ServiceWorker) => {
    const id = ++assessment
    const current = () => id === assessment && registration?.active === worker
    try {
      const ready = (await readOfflineStatus(worker))?.ready === true
      if (!current()) return
      mismatchedWorker = ready ? undefined : worker
      if (application === 'idle') {
        if (ready) show('Ready to work offline', button)
        else show('Update App to enable offline access')
      }
      render()
    } catch {
      if (current() && application === 'idle') show('Offline setup incomplete — reconnect to try again')
    }
  }
  const observe = (worker: ServiceWorker) => {
    if (observedWorkers.has(worker)) return
    observedWorkers.add(worker)
    worker.addEventListener('statechange', () => {
      render()
      if (worker.state === 'activated') void assessOffline(worker)
      if (worker.state === 'redundant' && !registration?.active && application === 'idle') {
        show('Offline setup incomplete — reconnect to try again')
      }
    })
  }
  const check = async () => {
    if (application === 'applying') {
      recheckAfterApply = true
      return
    }
    if (checkInFlight) {
      checkInFlight.reconnected = true
      return
    }
    const request = { reconnected: false }
    checkInFlight = request
    let failed = false
    try {
      if (!registration || (!registration.active && !registration.installing && !registration.waiting)) {
        const next = await navigator.serviceWorker.register(new URL('sw.js', document.baseURI), {
          updateViaCache: 'none',
        })
        if (next !== registration) {
          registration = next
          next.addEventListener('updatefound', () => {
            if (registration === next && next.installing) observe(next.installing)
          })
        }
        if (registration.installing) observe(registration.installing)
        if (registration.active) void assessOffline(registration.active)
        else if (application === 'idle') show('Preparing offline access…')
      } else {
        await registration.update()
        if (registration.active) void assessOffline(registration.active)
      }
      render()
    } catch {
      failed = true
      if (!registration?.active && application === 'idle') show('Offline setup incomplete — reconnect to try again')
    } finally {
      checkInFlight = undefined
      if (failed && request.reconnected) void check()
    }
  }
  const apply = async () => {
    const worker = updateWorker()
    if (!worker || application === 'applying') return
    // Archive/import work owns the saved head while these actions are disabled.
    const releaseOperation = tryBeginUpdate()
    if (!releaseOperation) {
      show('Finish the current data operation before updating')
      return
    }
    application = 'applying'
    const edits = new AbortController()
    focus.close()
    const releaseInput = lockInput()
    let resume: (() => void) | undefined
    render()
    show('Saving before updating…')
    try {
      await bounded(
        store.flushPersistence({ sealEditsUntil: edits.signal }),
        'Saving took too long. Keep this tab open and try again.',
      )
      if (
        worker.state === 'redundant' ||
        (worker !== updateWorker() && worker !== registration?.active && worker !== registration?.waiting)
      )
        throw new Error('This update was replaced. Reconnect and try Update App again.')
      const admission = pageAdmissionLock(registration!.scope)
      await navigator.locks.request(admission, { ifAvailable: true }, async (lock) => {
        if (!lock) throw new Error(otherWindowsMessage)
        if (worker === mismatchedWorker && worker === registration?.active) {
          const status = await readOfflineStatus(worker, true)
          if (status?.onlyWindow === false) throw new Error(otherWindowsMessage)
          if (status?.onlyWindow !== true) throw new Error(reopenUpdateMessage)
        }
        resume = session.suspendWrites()
        requestedWorker = worker
        if (worker.state !== 'activated' && worker.state !== 'activating') await activateUpdate(worker)
        await waitForController(worker)
      })
      location.reload()
    } catch (error) {
      edits.abort()
      resume?.()
      releaseOperation()
      releaseInput()
      application = 'retry'
      show(error instanceof Error ? error.message : 'Update failed. Keep this tab open and try again.')
      render()
      document.getElementById('tree-menu')!.showPopover()
      if (button.hidden) trigger.focus()
      else button.focus()
      if (recheckAfterApply) {
        recheckAfterApply = false
        void check()
      }
    }
  }
  const publishUpdate = commands.bind(button, () => void apply())
  window.addEventListener('online', () => {
    if (application === 'retry') application = 'idle'
    void check()
  })
  void check()
}
