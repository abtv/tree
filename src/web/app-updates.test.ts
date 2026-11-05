// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import { activateUpdate, installAppUpdates } from './app-updates'

class Port {
  onmessage: ((event: { data: unknown }) => void) | null = null
  peer?: Port
  close = vi.fn()
  postMessage(data: unknown) {
    this.peer?.onmessage?.({ data })
  }
}
class Channel {
  port1 = new Port()
  port2 = new Port()
  constructor() {
    this.port1.peer = this.port2
    this.port2.peer = this.port1
  }
}
class Worker extends EventTarget {
  state: ServiceWorkerState = 'installed'
  postMessage = vi.fn<(data: unknown, ports: Port[]) => void>()
}

let windowListeners: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  windowListeners = vi.spyOn(window, 'addEventListener')
})
afterEach(() => {
  for (const [type, listener, options] of windowListeners.mock.calls)
    window.removeEventListener(type, listener, options)
  vi.restoreAllMocks()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('update activation contract', () => {
  it('rejects an already redundant worker immediately and releases all deadline timers', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.postMessage.mockImplementation((_, ports) => {
      worker.state = 'redundant'
      ports[0]!.postMessage('activating')
    })

    await expect(activateUpdate(worker as unknown as ServiceWorker)).rejects.toThrow(
      'This update is no longer available. Try again when connected.',
    )

    expect(vi.getTimerCount()).toBe(0)
    expect(worker.postMessage.mock.calls[0]![1][0]!.close).toHaveBeenCalledOnce()
  })

  it('releases the response deadline after a completed activation', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.state = 'activated'
    worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('activating'))

    await activateUpdate(worker as unknown as ServiceWorker)

    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects an unrecognized activation response and closes both message ports', async () => {
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('obsolete'))

    await expect(activateUpdate(worker as unknown as ServiceWorker)).rejects.toThrow(
      'This update was replaced. Reconnect and try Update App again.',
    )

    const port = worker.postMessage.mock.calls[0]![1][0]!
    expect(port.close).toHaveBeenCalledOnce()
    expect(port.peer!.close).toHaveBeenCalledOnce()
  })

  it('times out an unresponsive update and sends stylesheet assets with the request', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('MessageChannel', Channel)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://tree.test/assets/style.css'
    document.head.append(link)
    const worker = new Worker()
    try {
      const result = activateUpdate(worker as unknown as ServiceWorker)
      const rejected = expect(result).rejects.toThrow('The update did not respond. Try Update App again.')

      await vi.advanceTimersByTimeAsync(15_000)
      await rejected

      expect(worker.postMessage).toHaveBeenCalledWith(
        { type: 'tree-activate-update', assets: [expect.any(String), link.href] },
        [expect.any(Port)],
      )
      const port = worker.postMessage.mock.calls[0]![1][0]!
      expect(port.close).toHaveBeenCalledOnce()
      expect(port.peer!.close).toHaveBeenCalledOnce()
    } finally {
      link.remove()
    }
  })

  it.each(['activated', 'redundant'] as const)('settles when an activating worker becomes %s', async (state) => {
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.state = 'activating'
    worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('activating'))
    const add = vi.spyOn(worker, 'addEventListener')
    const remove = vi.spyOn(worker, 'removeEventListener')
    const result = activateUpdate(worker as unknown as ServiceWorker)
    const settled =
      state === 'activated'
        ? expect(result).resolves.toBeUndefined()
        : expect(result).rejects.toThrow('no longer available')
    await vi.waitFor(() => expect(add).toHaveBeenCalledWith('statechange', expect.any(Function)))

    worker.state = state
    worker.dispatchEvent(new Event('statechange'))
    await settled

    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(worker.postMessage.mock.calls[0]![1][0]!.close).toHaveBeenCalledOnce()
  })

  it('waits for activation and removes listeners after timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('activating'))
    const remove = vi.spyOn(worker, 'removeEventListener')
    const result = activateUpdate(worker as unknown as ServiceWorker)
    const rejected = expect(result).rejects.toThrow('did not finish')

    await vi.advanceTimersByTimeAsync(15_000)
    await rejected

    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'tree-activate-update', assets: [expect.any(String)] }, [
      expect.any(Port),
    ])
    expect(worker.postMessage.mock.calls[0]![1][0]!.close).toHaveBeenCalledOnce()
  })

  it('rejects other windows and accepts completed activation', async () => {
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('other-windows'))

    await expect(activateUpdate(worker as unknown as ServiceWorker)).rejects.toThrow('Close other Tree')

    worker.postMessage.mockImplementation((_, ports) => {
      worker.state = 'activated'
      ports[0]!.postMessage('activating')
    })

    await expect(activateUpdate(worker as unknown as ServiceWorker)).resolves.toBeUndefined()
  })
})

async function controller(
  flush: () => Promise<void>,
  options: {
    busy?: boolean
    active?: Worker
    waiting?: Worker | null
    installing?: Worker | null
    registrationError?: Error
  } = {},
) {
  vi.stubEnv('PROD', true)
  vi.stubGlobal('MessageChannel', Channel)
  const worker = new Worker()
  const registration = Object.assign(new EventTarget(), {
    waiting: options.waiting === undefined ? worker : options.waiting,
    installing: options.installing ?? null,
    active: options.active ?? null,
    update: vi.fn(),
  })
  const container = Object.assign(new EventTarget(), {
    register: vi.fn(async () => {
      if (options.registrationError) throw options.registrationError
      return registration
    }),
    controller: null as Worker | null,
  })
  vi.stubGlobal('navigator', { serviceWorker: container })
  document.body.innerHTML =
    '<div id="root"></div><button id="tree-menu-button"></button><div id="tree-menu"></div><button id="app-update"></button><button id="data-export"></button><span id="offline-status"></span>'
  Object.assign(document.getElementById('tree-menu')!, { showPopover: vi.fn() })
  const resume = vi.fn()
  const suspendWrites = vi.fn(() => resume)
  installAppUpdates(
    { flushPersistence: flush } as EditorStore,
    { suspendWrites, onSaved: () => () => {}, discardStagedImages: async () => {} },
    { close: vi.fn() },
    () => options.busy ?? false,
  )
  await Promise.resolve()
  return {
    worker,
    resume,
    suspendWrites,
    registration,
    container,
    button: document.getElementById('app-update') as HTMLButtonElement,
  }
}

describe('update save boundary', () => {
  it('keeps the save status when an outstanding offline assessment times out', async () => {
    vi.useFakeTimers()
    const active = new Worker()
    active.state = 'activated'
    let rejectSave!: (error: Error) => void
    const f = await controller(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject
        }),
      { active },
    )
    await vi.advanceTimersByTimeAsync(1_000)
    f.button.click()

    await vi.advanceTimersByTimeAsync(14_000)

    expect(document.getElementById('offline-status')!.textContent).toBe('Saving before updating…')
    expect(f.button.disabled).toBe(true)
    rejectSave(new Error('Save interrupted'))
    await vi.advanceTimersByTimeAsync(0)
    expect(document.getElementById('offline-status')!.textContent).toBe('Save interrupted')
    expect(f.button.disabled).toBe(false)
  })

  it.each(['development', 'unsupported-browser'] as const)(
    'leaves update controls alone in %s',
    async (environment) => {
      vi.stubEnv('PROD', environment !== 'development')
      const register = vi.fn()
      vi.stubGlobal('navigator', environment === 'development' ? { serviceWorker: { register } } : {})
      document.body.innerHTML = '<button id="app-update" hidden></button><span id="offline-status" hidden></span>'
      const flushPersistence = vi.fn()
      const suspendWrites = vi.fn()

      installAppUpdates(
        { flushPersistence } as unknown as EditorStore,
        { suspendWrites, onSaved: () => () => {}, discardStagedImages: async () => {} },
        { close: vi.fn() },
        () => false,
      )
      await Promise.resolve()

      expect(register).not.toHaveBeenCalled()
      expect(flushPersistence).not.toHaveBeenCalled()
      expect(suspendWrites).not.toHaveBeenCalled()
      expect(document.getElementById('app-update')!.hidden).toBe(true)
      expect(document.getElementById('offline-status')!.hidden).toBe(true)
    },
  )

  it('keeps verified offline access when a newer installation becomes redundant', async () => {
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: true }))
    const installing = new Worker()
    installing.state = 'installing'
    const f = await controller(async () => undefined, { active, installing, waiting: null })
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline'))

    installing.state = 'redundant'
    f.registration.installing = null
    installing.dispatchEvent(new Event('statechange'))

    expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline')
    expect(f.button.hidden).toBe(true)
  })

  it.each([true, false])(
    'does not replace the save status with a late offline assessment (ready=%s)',
    async (ready) => {
      const active = new Worker()
      active.state = 'activated'
      let rejectSave!: (error: Error) => void
      const f = await controller(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectSave = reject
          }),
        { active },
      )
      const response = active.postMessage.mock.calls[0]![1][0]!

      f.button.click()
      response.postMessage({ ready })
      await Promise.resolve()
      await Promise.resolve()

      expect(document.getElementById('offline-status')!.textContent).toBe('Saving before updating…')
      expect(f.button.disabled).toBe(true)
      rejectSave(new Error('save canceled'))
      await vi.waitFor(() => expect(f.button.disabled).toBe(false))
      expect(document.getElementById('offline-status')!.textContent).toBe('save canceled')
    },
  )

  it.each([null, { ready: 'true' }])('requires an explicit boolean readiness response for %j', async (response) => {
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage(response))
    const f = await controller(async () => undefined, { active, waiting: null })

    await vi.waitFor(() =>
      expect(document.getElementById('offline-status')!.textContent).toBe('Update App to enable offline access'),
    )

    expect(f.button.hidden).toBe(false)
    expect(active.postMessage.mock.calls[0]![1][0]!.close).toHaveBeenCalledOnce()
  })

  it('coalesces online checks until the current registration update settles', async () => {
    const f = await controller(async () => undefined)
    let finish!: () => void
    const update = new Promise<void>((resolve) => {
      finish = resolve
    })
    f.registration.update.mockReturnValueOnce(update)

    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))

    expect(f.registration.update).toHaveBeenCalledOnce()
    finish()
    await update
    window.dispatchEvent(new Event('online'))
    await Promise.resolve()

    expect(f.registration.update).toHaveBeenCalledTimes(2)
    expect(f.container.register).toHaveBeenCalledOnce()
  })

  it('preserves verified offline availability when a later network update check fails', async () => {
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: true }))
    const f = await controller(async () => undefined, { active, waiting: null })
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline'))
    const failed = Promise.reject(new Error('offline'))
    f.registration.update.mockReturnValueOnce(failed)

    window.dispatchEvent(new Event('online'))
    await failed.catch(() => {})

    expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline')
    expect(f.button.hidden).toBe(true)
    expect(f.registration.update).toHaveBeenCalledOnce()
  })

  it.each(['initial', 'updatefound'] as const)(
    'observes an %s worker and announces an update only after installation',
    async (source) => {
      const installing = new Worker()
      installing.state = 'installing'
      const f = await controller(async () => undefined, {
        waiting: null,
        installing: source === 'initial' ? installing : null,
      })
      expect(f.button.hidden).toBe(true)
      expect(document.getElementById('tree-menu-button')!.getAttribute('aria-description')).toBe('')
      expect(f.container.register).toHaveBeenCalledExactlyOnceWith(new URL('sw.js', document.baseURI), {
        updateViaCache: 'none',
      })
      if (source === 'updatefound') {
        f.registration.installing = installing
        f.registration.dispatchEvent(new Event('updatefound'))
      }

      f.registration.waiting = installing
      f.registration.installing = null
      installing.state = 'installed'
      installing.dispatchEvent(new Event('statechange'))

      expect(f.button.hidden).toBe(false)
      expect(installing.postMessage).not.toHaveBeenCalled()
      expect(document.getElementById('offline-status')!.textContent).toBe('Preparing offline access…')
      expect(document.getElementById('tree-menu-button')!.classList.contains('update-attention')).toBe(true)
      expect(document.getElementById('tree-menu-button')!.getAttribute('aria-description')).toBe(
        'An app update is ready',
      )
    },
  )

  it('reports a redundant first installation and retries registration when the browser comes online', async () => {
    const installing = new Worker()
    installing.state = 'installing'
    const f = await controller(async () => undefined, { waiting: null, installing })

    f.registration.installing = null
    installing.state = 'redundant'
    installing.dispatchEvent(new Event('statechange'))

    expect(document.getElementById('offline-status')!.textContent).toBe(
      'Offline setup incomplete — reconnect to try again',
    )
    expect(f.button.hidden).toBe(true)
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(f.container.register).toHaveBeenCalledTimes(2))
    expect(f.registration.update).not.toHaveBeenCalled()
  })

  it('recovers from failed registration on the next online event', async () => {
    const f = await controller(async () => undefined, { registrationError: new Error('offline') })
    await vi.waitFor(() =>
      expect(document.getElementById('offline-status')!.textContent).toBe(
        'Offline setup incomplete — reconnect to try again',
      ),
    )
    f.container.register.mockResolvedValueOnce(f.registration)

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(f.button.hidden).toBe(false))

    expect(f.container.register).toHaveBeenCalledTimes(2)
    expect(document.getElementById('offline-status')!.textContent).toBe('Preparing offline access…')
  })

  it('assesses the first worker after activation and hides the update command when its package is cached', async () => {
    const installing = new Worker()
    installing.state = 'installing'
    installing.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: true }))
    const f = await controller(async () => undefined, { waiting: null, installing })

    f.registration.installing = null
    f.registration.active = installing
    installing.state = 'activated'
    installing.dispatchEvent(new Event('statechange'))
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline'))

    expect(f.button.hidden).toBe(true)
    expect(installing.postMessage).toHaveBeenCalledWith({ type: 'tree-offline-status', assets: [expect.any(String)] }, [
      expect.any(Port),
    ])
  })

  it('reports an offline readiness timeout and closes its communication ports', async () => {
    vi.useFakeTimers()
    const active = new Worker()
    active.state = 'activated'
    await controller(async () => undefined, { active, waiting: null })

    await vi.advanceTimersByTimeAsync(15_000)

    expect(document.getElementById('offline-status')!.textContent).toBe(
      'Offline setup incomplete — reconnect to try again',
    )
    const port = active.postMessage.mock.calls[0]![1][0]!
    expect(port.close).toHaveBeenCalledOnce()
    expect(port.peer!.close).toHaveBeenCalledOnce()
  })

  it('reloads only after the activated update takes control and keeps writes suspended until reload', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const f = await controller(async () => undefined)
    const add = vi.spyOn(f.container, 'addEventListener')
    const remove = vi.spyOn(f.container, 'removeEventListener')
    f.worker.postMessage.mockImplementation((_, ports) => {
      f.worker.state = 'activated'
      ports[0]!.postMessage('activating')
    })

    f.button.click()
    await vi.waitFor(() => expect(add).toHaveBeenCalledWith('controllerchange', expect.any(Function)))

    f.container.controller = new Worker()
    f.container.dispatchEvent(new Event('controllerchange'))
    expect(reload).not.toHaveBeenCalled()
    expect(f.suspendWrites).toHaveBeenCalledOnce()
    expect(f.resume).not.toHaveBeenCalled()
    f.container.controller = f.worker
    f.container.dispatchEvent(new Event('controllerchange'))
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())

    expect(remove).toHaveBeenCalledWith('controllerchange', expect.any(Function))
    expect(f.resume).not.toHaveBeenCalled()
    expect(document.getElementById('root')!.inert).toBe(true)
  })

  it('resumes editing after controller transfer times out and can retry without reactivating the worker', async () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const f = await controller(async () => undefined)
    const remove = vi.spyOn(f.container, 'removeEventListener')
    f.worker.postMessage.mockImplementation((_, ports) => {
      f.worker.state = 'activated'
      ports[0]!.postMessage('activating')
    })

    f.button.click()
    await vi.advanceTimersByTimeAsync(15_000)

    expect(document.getElementById('offline-status')!.textContent).toBe(
      'The new version did not take control. Try Update App again.',
    )
    expect(remove).toHaveBeenCalledWith('controllerchange', expect.any(Function))
    expect(f.resume).toHaveBeenCalledOnce()
    expect(document.getElementById('root')!.inert).toBe(false)
    expect(document.activeElement).toBe(f.button)
    expect(reload).not.toHaveBeenCalled()

    f.container.controller = f.worker
    f.button.click()
    await vi.advanceTimersByTimeAsync(0)

    expect(reload).toHaveBeenCalledOnce()
    expect(f.worker.postMessage).toHaveBeenCalledOnce()
    expect(f.suspendWrites).toHaveBeenCalledTimes(2)
  })

  it('blocks editing input while saving and restores every input handler after a save timeout', async () => {
    vi.useFakeTimers()
    const f = await controller(() => new Promise<void>(() => {}))
    const events = ['keydown', 'beforeinput', 'paste', 'cut', 'drop', 'pointerdown', 'click']

    f.button.click()
    for (const type of events) {
      expect(window.dispatchEvent(new Event(type, { cancelable: true }))).toBe(false)
    }
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(15_000)

    expect(document.getElementById('offline-status')!.textContent).toBe(
      'Saving took too long. Keep this tab open and try again.',
    )
    expect(f.registration.update).not.toHaveBeenCalled()
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(f.worker.postMessage).not.toHaveBeenCalled()
    for (const type of events) {
      expect(window.dispatchEvent(new Event(type, { cancelable: true }))).toBe(true)
    }
  })

  it('refuses to update during a data operation without flushing or suspending writes', async () => {
    const flush = vi.fn(async () => undefined)
    const f = await controller(flush, { busy: true })

    f.button.click()

    expect(document.getElementById('offline-status')!.textContent).toBe(
      'Finish the current data operation before updating',
    )
    expect(flush).not.toHaveBeenCalled()
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(f.worker.postMessage).not.toHaveBeenCalled()
  })

  it.each([true, false])('assesses offline readiness of the active worker (cached=%s)', async (ready) => {
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready }))
    const f = await controller(async () => undefined, { active })
    await vi.waitFor(() =>
      expect(document.getElementById('offline-status')!.textContent).toBe(
        ready ? 'Ready to work offline' : 'Update App to enable offline access',
      ),
    )

    expect(active.postMessage).toHaveBeenCalledWith({ type: 'tree-offline-status', assets: [expect.any(String)] }, [
      expect.any(Port),
    ])
    const port = active.postMessage.mock.calls[0]![1][0]!
    expect(port.close).toHaveBeenCalledOnce()
    expect(port.peer!.close).toHaveBeenCalledOnce()
    expect(f.container.register).toHaveBeenCalledWith(new URL('sw.js', document.baseURI), { updateViaCache: 'none' })
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(f.registration.update).toHaveBeenCalledOnce())
    expect(f.container.register).toHaveBeenCalledOnce()
  })

  it('does not request activation when saving fails and restores interaction', async () => {
    const f = await controller(async () => {
      throw new Error('Local save failed')
    })
    f.button.click()
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Local save failed'))

    expect(f.worker.postMessage).not.toHaveBeenCalled()
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(document.getElementById('root')!.inert).toBe(false)
    expect(f.button.disabled).toBe(false)
  })

  it('coalesces repeated requests, suspends only after save, and resumes after refusal', async () => {
    let finish!: () => void
    const flush = vi.fn(
      () =>
        new Promise<void>((done) => {
          finish = done
        }),
    )
    const f = await controller(flush)
    f.worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('other-windows'))
    f.button.click()
    f.button.click()

    expect(flush).toHaveBeenCalledOnce()
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(document.getElementById('root')!.inert).toBe(true)

    finish()
    await vi.waitFor(() => expect(f.resume).toHaveBeenCalledOnce())

    expect(f.worker.postMessage).toHaveBeenCalledOnce()
    expect(document.getElementById('root')!.inert).toBe(false)
  })
})
