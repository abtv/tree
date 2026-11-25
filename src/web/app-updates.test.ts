// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorStore } from '../application/editor-store'
import { activateUpdate, installAppUpdates } from './app-updates'
import { BrowserMenuCommands } from './menu-commands'

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
function prepare(port: Port, onCommit?: () => void) {
  port.onmessage = ({ data }) => {
    if (data !== 'commit') return
    onCommit?.()
    port.postMessage('activating')
  }
  port.postMessage('prepared')
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
    worker.postMessage.mockImplementation((_, ports) =>
      prepare(ports[0]!, () => {
        worker.state = 'redundant'
      }),
    )

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
    worker.postMessage.mockImplementation((_, ports) => prepare(ports[0]!))

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
    const received = vi.fn()
    worker.postMessage.mockImplementation((_, ports) => {
      ports[0]!.onmessage = ({ data }) => received(data)
    })
    try {
      const result = activateUpdate(worker as unknown as ServiceWorker)
      const rejected = expect(result).rejects.toThrow('The update did not respond. Try Update App again.')

      await vi.advanceTimersByTimeAsync(15_000)
      await rejected

      expect(received).toHaveBeenCalledExactlyOnceWith('cancel')
      expect(worker.postMessage).toHaveBeenCalledWith(
        { type: 'tree-offline-status', prepareUpdate: true, assets: [expect.any(String), link.href] },
        [expect.any(Port)],
      )
      const port = worker.postMessage.mock.calls[0]![1][0]!
      expect(port.close).toHaveBeenCalledOnce()
      expect(port.peer!.close).toHaveBeenCalledOnce()
    } finally {
      link.remove()
    }
  })

  it('reports a retryable failure when the worker cannot finish the requested activation', async () => {
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.postMessage.mockImplementation((_, [port]) => {
      port!.onmessage = ({ data }) => {
        if (data === 'commit') port!.postMessage('activation-failed')
      }
      port!.postMessage('prepared')
    })

    await expect(activateUpdate(worker as unknown as ServiceWorker)).rejects.toThrow(
      'The update did not finish. Try Update App again.',
    )
  })

  it.each(['activated', 'redundant'] as const)('settles when an activating worker becomes %s', async (state) => {
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.state = 'activating'
    worker.postMessage.mockImplementation((_, ports) => prepare(ports[0]!))
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
    worker.postMessage.mockImplementation((_, ports) => prepare(ports[0]!))
    const remove = vi.spyOn(worker, 'removeEventListener')
    const result = activateUpdate(worker as unknown as ServiceWorker)
    const rejected = expect(result).rejects.toThrow('update was requested')

    await vi.advanceTimersByTimeAsync(15_000)
    await rejected

    expect(remove).toHaveBeenCalledWith('statechange', expect.any(Function))
    expect(worker.postMessage).toHaveBeenCalledWith(
      { type: 'tree-offline-status', prepareUpdate: true, assets: [expect.any(String)] },
      [expect.any(Port)],
    )
    expect(worker.postMessage.mock.calls[0]![1][0]!.close).toHaveBeenCalledOnce()
  })

  it('rejects other windows and accepts completed activation', async () => {
    vi.stubGlobal('MessageChannel', Channel)
    const worker = new Worker()
    worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('other-windows'))

    await expect(activateUpdate(worker as unknown as ServiceWorker)).rejects.toThrow('Close other Tree')

    worker.postMessage.mockImplementation((_, ports) =>
      prepare(ports[0]!, () => {
        worker.state = 'activated'
      }),
    )

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
    scope: new URL('.', document.baseURI).href,
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
  type RunLock = (lock: object | null) => Promise<void>
  const locks = {
    request: vi.fn(async (_name: string, options: LockOptions | RunLock, run?: RunLock) =>
      typeof options === 'function' ? options({}) : run!({}),
    ),
  }
  vi.stubGlobal('navigator', { serviceWorker: container, locks })
  document.body.innerHTML =
    '<div id="root"></div><button id="tree-menu-button"></button><div id="tree-menu"><span id="offline-status"></span><button id="app-update"></button></div><button id="data-export"></button><div id="data-activity"></div>'
  Object.assign(document.getElementById('tree-menu')!, { showPopover: vi.fn() })
  const resume = vi.fn()
  const suspendWrites = vi.fn(() => resume)
  const close = vi.fn()
  const releaseOperation = vi.fn()
  const commands = new BrowserMenuCommands()
  installAppUpdates(
    { flushPersistence: flush } as EditorStore,
    { suspendWrites, onSaved: () => () => {}, discardStagedImages: async () => {} },
    { close },
    () => (options.busy ? undefined : releaseOperation),
    commands,
  )
  await Promise.resolve()
  return {
    worker,
    resume,
    suspendWrites,
    releaseOperation,
    close,
    registration,
    locks,
    container,
    commands,
    button: document.getElementById('app-update') as HTMLButtonElement,
  }
}

describe('update save boundary', () => {
  // @requirement PRODUCT.md §20.2.28
  it('shares update availability and the save gate with the command panel', async () => {
    let rejectSave!: (error: Error) => void
    const flush = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectSave = reject
        }),
    )
    const worker = new Worker()
    worker.state = 'installing'
    const f = await controller(flush, { waiting: null, installing: worker })

    expect(f.commands.getSnapshot()).toEqual([])
    expect(f.button.hidden).toBe(true)

    f.registration.waiting = worker
    worker.state = 'installed'
    worker.dispatchEvent(new Event('statechange'))

    const command = f.commands.getSnapshot()[0]!
    expect(command).toMatchObject({ name: 'update-app', description: 'Update App', enabled: true })
    expect(f.button.hidden).toBe(false)
    expect(f.button.disabled).toBe(false)

    await command.run({} as never, {} as never)
    f.button.click()
    await command.run({} as never, {} as never)

    expect(flush).toHaveBeenCalledOnce()
    expect(f.button.disabled).toBe(true)
    expect(f.commands.getSnapshot()[0]?.enabled).toBe(false)

    rejectSave(new Error('Save failed'))
    await vi.waitFor(() => expect(f.commands.getSnapshot()[0]?.enabled).toBe(true))

    expect(f.button.disabled).toBe(false)
    expect(f.releaseOperation).toHaveBeenCalledOnce()
    expect(f.suspendWrites).not.toHaveBeenCalled()
  })

  it('lets an old waiting worker finish on reopen without giving it a one-way activation request', async () => {
    const f = await controller(async () => undefined)
    f.worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: false }))

    f.button.click()

    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toContain('reopen Tree'))
    expect(f.worker.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: 'tree-offline-status', prepareUpdate: true, assets: [expect.any(String)] },
      [expect.any(Port)],
    )
    expect(document.getElementById('root')!.inert).toBe(false)
    expect(f.resume).toHaveBeenCalledOnce()
  })
  it('retries the newest waiting package after controller transfer timed out', async () => {
    vi.useFakeTimers()
    const f = await controller(async () => undefined)
    f.worker.postMessage.mockImplementation((_, ports) =>
      prepare(ports[0]!, () => {
        f.worker.state = 'activated'
        f.registration.waiting = null
        f.registration.active = f.worker
      }),
    )
    f.button.click()
    await vi.advanceTimersByTimeAsync(15_000)
    f.worker.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: false }))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    const newer = new Worker()
    newer.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage('other-windows'))
    f.registration.waiting = newer

    f.button.click()
    await vi.advanceTimersByTimeAsync(0)

    expect(newer.postMessage).toHaveBeenCalledOnce()
    expect(document.getElementById('offline-status')!.textContent).toContain('Close other Tree')
  })

  it('retains a late first-page mismatch for a retry after a newer worker refuses activation', async () => {
    const active = new Worker()
    active.state = 'activated'
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const f = await controller(async () => undefined, { active })
    f.container.controller = active
    const probe = active.postMessage.mock.calls[0]![1][0]!
    f.button.click()
    await vi.waitFor(() => expect(f.worker.postMessage).toHaveBeenCalledOnce())

    probe.postMessage({ ready: false })
    f.worker.postMessage.mock.calls[0]![1][0]!.postMessage('superseded')
    await vi.waitFor(() => expect(f.button.disabled).toBe(false))
    expect(document.getElementById('offline-status')!.textContent).toContain('replaced')
    active.postMessage.mockImplementationOnce((_, ports) => ports[0]!.postMessage({ ready: false, onlyWindow: true }))
    f.button.click()

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(f.worker.postMessage).toHaveBeenCalledOnce()
  })

  it('rechecks the waiting package after saving before sending an activation request', async () => {
    let finish!: () => void
    const f = await controller(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    f.button.click()
    f.registration.waiting = new Worker()
    f.worker.state = 'redundant'

    finish()
    await vi.waitFor(() => expect(f.button.disabled).toBe(false))

    expect(f.worker.postMessage).not.toHaveBeenCalled()
    expect(f.registration.waiting.postMessage).not.toHaveBeenCalled()
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(document.getElementById('offline-status')!.textContent).toContain('replaced')
  })

  it.each(['active', 'gone'] as const)('handles a waiting worker that becomes %s while saving', async (state) => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    let finishSave!: () => void
    const save = new Promise<void>((resolve) => {
      finishSave = resolve
    })
    const f = await controller(() => save)

    f.button.click()
    f.registration.waiting = null
    if (state === 'active') {
      f.worker.state = 'activated'
      f.registration.active = f.worker
      f.container.controller = f.worker
    }
    finishSave()

    if (state === 'active') {
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
      expect(f.suspendWrites).toHaveBeenCalledOnce()
      expect(f.releaseOperation).not.toHaveBeenCalled()
    } else {
      await vi.waitFor(() => expect(f.releaseOperation).toHaveBeenCalledOnce())
      expect(f.suspendWrites).not.toHaveBeenCalled()
      expect(document.getElementById('offline-status')!.textContent).toContain('replaced')
      expect(document.activeElement).toBe(document.getElementById('tree-menu-button'))
      expect(reload).not.toHaveBeenCalled()
    }
    expect(f.worker.postMessage).not.toHaveBeenCalled()
  })

  it('clears a recovered offline mismatch and ignores an older assessment arriving last', async () => {
    const active = new Worker()
    active.state = 'activated'
    const f = await controller(async () => undefined, { active, waiting: null })
    const first = active.postMessage.mock.calls[0]![1][0]!
    active.postMessage.mockImplementationOnce((_, ports) => ports[0]!.postMessage({ ready: false }))
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(f.button.hidden).toBe(false))
    active.postMessage.mockImplementationOnce((_, ports) => ports[0]!.postMessage({ ready: true }))
    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline'))

    first.postMessage({ ready: false })
    await vi.waitFor(() => expect(first.close).toHaveBeenCalledOnce())

    expect(f.button.hidden).toBe(true)
    expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline')
  })

  it('rechecks that the waiting worker still exists before saving', async () => {
    const flush = vi.fn(async () => undefined)
    const f = await controller(flush)
    f.registration.waiting = null

    f.button.click()

    expect(flush).not.toHaveBeenCalled()
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(f.close).not.toHaveBeenCalled()
  })

  it('ignores an offline reply from a worker that is no longer active', async () => {
    vi.useFakeTimers()
    const active = new Worker()
    active.state = 'activated'
    const f = await controller(async () => undefined, { active, waiting: null })
    const reply = active.postMessage.mock.calls[0]![1][0]!
    f.registration.active = new Worker()

    reply.postMessage({ ready: true })
    await vi.advanceTimersByTimeAsync(0)

    expect(document.getElementById('offline-status')!.textContent).not.toBe('Ready to work offline')
    expect(f.button.hidden).toBe(true)
  })

  it('does not save for a stale offline repair command after another worker takes over', async () => {
    const flush = vi.fn(async () => undefined)
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: false }))
    const f = await controller(flush, { active, waiting: null })
    await vi.waitFor(() => expect(f.commands.getSnapshot()[0]?.enabled).toBe(true))
    const command = f.commands.getSnapshot()[0]!
    const replacement = new Worker()
    replacement.state = 'activated'
    f.registration.active = replacement
    f.container.controller = replacement

    await command.run({} as never, {} as never)

    expect(flush).not.toHaveBeenCalled()
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(active.postMessage).toHaveBeenCalledOnce()
    expect(replacement.postMessage).not.toHaveBeenCalled()
  })

  it('restores editing when offline access cannot be verified before applying a repair', async () => {
    vi.useFakeTimers()
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementationOnce((_, ports) => ports[0]!.postMessage({ ready: false }))
    const f = await controller(async () => undefined, { active, waiting: null })
    await vi.advanceTimersByTimeAsync(0)
    const command = f.commands.getSnapshot()[0]!

    await command.run({} as never, {} as never)
    await vi.advanceTimersByTimeAsync(15_000)

    expect(document.getElementById('offline-status')!.textContent).toBe('Offline access could not be verified')
    expect(document.getElementById('root')!.inert).toBe(false)
    expect(f.commands.getSnapshot()[0]?.enabled).toBe(true)
    expect(f.releaseOperation).toHaveBeenCalledOnce()
    expect(f.suspendWrites).not.toHaveBeenCalled()
  })

  it('closes the menu and blocks editor input handlers until a failed save restores them', async () => {
    let fail!: (error: Error) => void
    const f = await controller(
      () =>
        new Promise<void>((_resolve, reject) => {
          fail = reject
        }),
    )
    const root = document.getElementById('root')!
    const edited = vi.fn()
    root.addEventListener('keydown', edited)

    f.button.click()
    const duringSave = new Event('keydown', { bubbles: true, cancelable: true })
    root.dispatchEvent(duringSave)

    expect(f.close).toHaveBeenCalledOnce()
    expect(duringSave.defaultPrevented).toBe(true)
    expect(edited).not.toHaveBeenCalled()
    expect(document.getElementById('offline-status')!.hidden).toBe(false)
    fail(new Error('Save failed'))
    await vi.waitFor(() => expect(f.button.disabled).toBe(false))
    root.dispatchEvent(new Event('keydown', { bubbles: true, cancelable: true }))
    expect(edited).toHaveBeenCalledOnce()
  })

  it('shows a retryable visible error when saving rejects with a non-Error value', async () => {
    const f = await controller(() => Promise.reject('storage unavailable'))

    f.button.click()
    await vi.waitFor(() => expect(f.button.disabled).toBe(false))

    const status = document.getElementById('offline-status')!
    expect(status.hidden).toBe(false)
    expect(status.textContent).toBe('Update failed. Keep this tab open and try again.')
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(f.worker.postMessage).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(f.button)
  })

  it('reassesses offline access after a successful online check', async () => {
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: true }))
    const f = await controller(async () => undefined, { active, waiting: null })
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline'))
    active.postMessage.mockImplementationOnce((_, ports) => ports[0]!.postMessage({ ready: false }))

    window.dispatchEvent(new Event('online'))
    await vi.waitFor(() =>
      expect(document.getElementById('offline-status')!.textContent).toBe('Update App to enable offline access'),
    )

    expect(active.postMessage).toHaveBeenCalledTimes(2)
    expect(f.registration.update).toHaveBeenCalledOnce()
    expect(f.button.hidden).toBe(false)
  })

  it('keeps offline preparation visible when a successful check has no active worker to assess', async () => {
    const f = await controller(async () => undefined)

    window.dispatchEvent(new Event('online'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(f.registration.update).toHaveBeenCalledOnce()
    expect(document.getElementById('offline-status')!.textContent).toBe('Preparing offline access…')
    expect(f.worker.postMessage).not.toHaveBeenCalled()
  })

  it('ignores an updatefound event after its installing worker has disappeared', async () => {
    const installing = new Worker()
    installing.state = 'installing'
    const f = await controller(async () => undefined, { installing, waiting: null })
    f.registration.installing = null
    const errors: unknown[] = []
    window.addEventListener('error', (event) => {
      event.preventDefault()
      errors.push(event.error)
    })

    f.registration.dispatchEvent(new Event('updatefound'))

    expect(errors).toEqual([])
    expect(f.button.hidden).toBe(true)
    expect(document.getElementById('offline-status')!.textContent).toBe('Preparing offline access…')
  })

  it('retries an activating worker without requesting a second activation', async () => {
    vi.useFakeTimers()
    const f = await controller(async () => undefined)
    f.worker.state = 'activating'
    f.registration.waiting = null
    const active = f.worker
    f.registration.active = active
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: false, onlyWindow: true }))
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(f.button.hidden).toBe(false)
    active.postMessage.mockClear()

    f.button.click()
    await vi.advanceTimersByTimeAsync(15_000)

    expect(active.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: 'tree-offline-status', assets: [expect.any(String)], checkWindows: true },
      [expect.any(Port)],
    )
    expect(f.resume).toHaveBeenCalledOnce()
    expect(document.getElementById('offline-status')!.textContent).toBe(
      'The update was requested. You can keep editing here and retry Update App to reload.',
    )
    expect(f.button.hidden).toBe(false)
  })

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

  it('waits for an activating controller to finish before reloading and removes its state listener', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    const f = await controller(async () => undefined)
    const listen = vi.spyOn(f.worker, 'addEventListener')
    const remove = vi.spyOn(f.worker, 'removeEventListener')

    f.button.click()
    f.registration.waiting = null
    f.registration.active = f.worker
    f.worker.state = 'activating'
    f.container.controller = f.worker
    await vi.waitFor(() => expect(listen).toHaveBeenCalledWith('statechange', expect.any(Function)))

    expect(reload).not.toHaveBeenCalled()
    f.worker.state = 'activated'
    f.worker.dispatchEvent(new Event('statechange'))
    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(remove).toHaveBeenCalledWith('statechange', listen.mock.calls[0]![1])
  })

  it.each(['development', 'unsupported-browser'] as const)(
    'leaves update controls alone in %s',
    async (environment) => {
      vi.stubEnv('PROD', environment !== 'development')
      const register = vi.fn()
      vi.stubGlobal('navigator', environment === 'development' ? { serviceWorker: { register } } : {})
      document.body.innerHTML =
        '<span id="offline-status" hidden></span><button id="app-update" hidden></button><div id="data-activity"></div>'
      const flushPersistence = vi.fn()
      const suspendWrites = vi.fn()

      installAppUpdates(
        { flushPersistence } as unknown as EditorStore,
        { suspendWrites, onSaved: () => () => {}, discardStagedImages: async () => {} },
        { close: vi.fn() },
        () => () => {},
        new BrowserMenuCommands(),
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
      await vi.waitFor(() => expect(response.close).toHaveBeenCalledOnce())
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

  it('retries a failed check once when the network returns during that check', async () => {
    const f = await controller(async () => undefined)
    let fail!: (error: Error) => void
    f.registration.update.mockReturnValueOnce(
      new Promise<void>((_, reject) => {
        fail = reject
      }),
    )
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))
    expect(f.registration.update).toHaveBeenCalledOnce()

    fail(new Error('previous connection lost'))

    await vi.waitFor(() => expect(f.registration.update).toHaveBeenCalledTimes(2))
  })

  it('defers a reconnect check until the current update fails and consumes it once', async () => {
    let refuseSave!: (error: Error) => void
    const flush = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          refuseSave = reject
        }),
    )
    const f = await controller(flush)
    f.registration.update.mockRejectedValueOnce(new Error('Network still offline'))

    f.button.click()
    window.dispatchEvent(new Event('online'))
    window.dispatchEvent(new Event('online'))

    expect(f.registration.update).not.toHaveBeenCalled()
    expect(f.button.disabled).toBe(true)

    refuseSave(new Error('First save failed'))
    await vi.waitFor(() => expect(f.registration.update).toHaveBeenCalledOnce())
    expect(f.button.disabled).toBe(false)
    expect(document.getElementById('offline-status')!.textContent).toBe('First save failed')

    f.button.click()
    refuseSave(new Error('Second save failed'))
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Second save failed'))

    expect(f.registration.update).toHaveBeenCalledOnce()
    expect(f.suspendWrites).not.toHaveBeenCalled()
  })

  it.each([false, true])('restores editing when a requested worker is replaced (next: %s)', async (hasNext) => {
    const f = await controller(async () => undefined)
    const listening = vi.spyOn(f.container, 'addEventListener')
    f.worker.postMessage.mockImplementation((_, ports) =>
      prepare(ports[0]!, () => {
        f.worker.state = 'activated'
      }),
    )
    f.button.click()
    await vi.waitFor(() => expect(listening).toHaveBeenCalledWith('controllerchange', expect.any(Function)))

    f.worker.state = 'redundant'
    f.registration.waiting = hasNext ? new Worker() : null
    f.worker.dispatchEvent(new Event('statechange'))

    await vi.waitFor(() => expect(f.resume).toHaveBeenCalledOnce())
    expect(f.button.disabled).toBe(false)
    expect(f.button.hidden).toBe(!hasNext)
    expect(f.commands.getSnapshot().map((command) => command.name)).toEqual(hasNext ? ['update-app'] : [])
    expect(document.getElementById('offline-status')!.textContent).toContain('replaced')
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

    f.registration.dispatchEvent(new Event('updatefound'))
    f.registration.installing = null
    f.registration.active = installing
    installing.state = 'activated'
    installing.dispatchEvent(new Event('statechange'))
    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toBe('Ready to work offline'))

    expect(f.button.hidden).toBe(true)
    expect(installing.postMessage).toHaveBeenCalledExactlyOnceWith(
      { type: 'tree-offline-status', assets: [expect.any(String)] },
      [expect.any(Port)],
    )
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
    f.worker.postMessage.mockImplementation((_, ports) =>
      prepare(ports[0]!, () => {
        f.worker.state = 'activated'
      }),
    )

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
    f.worker.postMessage.mockImplementation((_, ports) =>
      prepare(ports[0]!, () => {
        f.worker.state = 'activated'
      }),
    )

    f.button.click()
    await vi.advanceTimersByTimeAsync(15_000)

    expect(document.getElementById('offline-status')!.textContent).toBe(
      'The update was requested. You can keep editing here and retry Update App to reload.',
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
    window.dispatchEvent(new Event('online'))
    expect(f.registration.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(15_000)

    expect(document.getElementById('offline-status')!.textContent).toBe(
      'Saving took too long. Keep this tab open and try again.',
    )
    expect(f.registration.update).toHaveBeenCalledOnce()
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

  it('restores editing when a new tab holds the page admission lock after saving', async () => {
    const flush = vi.fn<EditorStore['flushPersistence']>().mockResolvedValue(undefined)
    const f = await controller(flush)
    f.locks.request.mockImplementationOnce(async (_name, _options, run) => run!(null))

    f.button.click()
    await vi.waitFor(() => expect(f.button.disabled).toBe(false))

    expect(f.locks.request).toHaveBeenCalledWith(
      `tree-offline:${f.registration.scope}:page-admission`,
      { ifAvailable: true },
      expect.any(Function),
    )
    expect(flush.mock.calls[0]?.[0]?.sealEditsUntil?.aborted).toBe(true)
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(f.worker.postMessage).not.toHaveBeenCalled()
    expect(document.getElementById('offline-status')!.textContent).toBe(
      'Close other Tree tabs and windows, then try Update App again.',
    )
    expect(f.releaseOperation).toHaveBeenCalledOnce()
  })

  it('keeps a mismatched page editable when an earlier active worker cannot count windows', async () => {
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementation((_, ports) => ports[0]!.postMessage({ ready: false }))
    const f = await controller(async () => undefined, { active, waiting: null })
    f.container.controller = active
    await vi.waitFor(() => expect(f.button.hidden).toBe(false))

    f.button.click()

    await vi.waitFor(() => expect(document.getElementById('offline-status')!.textContent).toContain('reopen Tree'))
    expect(document.getElementById('root')!.inert).toBe(false)
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(f.button.hidden).toBe(false)
  })

  it('keeps the mismatched page open when the active worker reports another window', async () => {
    const active = new Worker()
    active.state = 'activated'
    active.postMessage.mockImplementationOnce((_, [port]) => port!.postMessage({ ready: false }))
    const f = await controller(async () => undefined, { active, waiting: null })
    f.container.controller = active
    await vi.waitFor(() => expect(f.button.hidden).toBe(false))
    active.postMessage.mockImplementationOnce((_, [port]) => port!.postMessage({ ready: false, onlyWindow: false }))

    f.button.click()
    await vi.waitFor(() => expect(f.button.disabled).toBe(false))

    expect(active.postMessage).toHaveBeenLastCalledWith(
      { type: 'tree-offline-status', assets: [expect.any(String)], checkWindows: true },
      [expect.any(Port)],
    )
    expect(document.getElementById('offline-status')!.textContent).toBe(
      'Close other Tree tabs and windows, then try Update App again.',
    )
    expect(f.suspendWrites).not.toHaveBeenCalled()
    expect(document.getElementById('root')!.inert).toBe(false)
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
    expect(document.getElementById('offline-status')!.nextElementSibling).toBe(
      ready ? f.button : document.getElementById('data-activity'),
    )
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
