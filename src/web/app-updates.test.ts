// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
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

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('update activation contract', () => {
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

async function controller(flush: () => Promise<void>) {
  vi.stubEnv('PROD', true)
  vi.stubGlobal('MessageChannel', Channel)
  const worker = new Worker()
  const registration = Object.assign(new EventTarget(), { waiting: worker, active: null, update: vi.fn() })
  vi.stubGlobal('navigator', { serviceWorker: { register: vi.fn(async () => registration) } })
  document.body.innerHTML =
    '<div id="root"></div><button id="tree-menu-button"></button><div id="tree-menu"></div><button id="app-update"></button><button id="data-export"></button><span id="offline-status"></span>'
  Object.assign(document.getElementById('tree-menu')!, { showPopover: vi.fn() })
  const resume = vi.fn()
  const suspendWrites = vi.fn(() => resume)
  installAppUpdates(
    { flushPersistence: flush } as EditorStore,
    { suspendWrites, onSaved: () => () => {}, discardStagedImages: async () => {} },
    { close: vi.fn() },
    () => false,
  )
  await Promise.resolve()
  return { worker, resume, suspendWrites, button: document.getElementById('app-update') as HTMLButtonElement }
}

describe('update save boundary', () => {
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
