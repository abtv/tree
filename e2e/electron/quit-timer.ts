import type { ElectronApplication } from '@playwright/test'
import { expect } from './platform-expect'

// Expire the real quit or installation timeout without advancing unrelated main-process timers.
export async function captureQuitTimer(
  application: ElectronApplication,
  route: 'ipc' | 'native' | 'update',
  expirations = 1,
): Promise<() => Promise<void>> {
  const timer = await application.evaluateHandle(({ app }, route) => {
    const nativeSetTimeout = globalThis.setTimeout
    const timers: Array<{ milliseconds: number | undefined; expire: () => void }> = []
    const captureTimeout = new Proxy(nativeSetTimeout, {
      apply(target, receiver, args: Parameters<typeof setTimeout>) {
        const [callback, milliseconds, ...callbackArgs] = args
        let fired = false
        const fire = (): void => {
          if (fired) throw new Error('The captured quit timer already fired.')
          fired = true
          callback(...callbackArgs)
        }
        const handle = Reflect.apply(target, receiver, [fire, milliseconds])
        timers.push({
          milliseconds,
          expire: () => {
            clearTimeout(handle)
            fire()
          },
        })
        return handle
      },
    })

    if (route !== 'native') {
      globalThis.__treeIpc.wrap(route === 'ipc' ? 'tree:quit' : 'tree:confirm-app-update', (original, ...args) => {
        globalThis.setTimeout = captureTimeout
        try {
          return original(...args)
        } finally {
          globalThis.setTimeout = nativeSetTimeout
        }
      })
    } else {
      // Menu quit and window close enter the production before-quit listener synchronously.
      app.prependOnceListener('before-quit', () => {
        globalThis.setTimeout = captureTimeout
      })
      app.once('before-quit', () => {
        globalThis.setTimeout = nativeSetTimeout
      })
    }

    return () => {
      if (globalThis.setTimeout !== nativeSetTimeout) throw new Error('Native timers were not restored.')
      if (timers.length !== 1) throw new Error(`Expected one quit timer, received ${timers.length}.`)
      const captured = timers.shift()!
      captured.expire()
      return captured.milliseconds
    }
  }, route)

  return async () => {
    expect(await timer.evaluate((expire) => expire())).toBe(route === 'update' ? 60_000 : 5_000)
    if (--expirations === 0) await timer.dispose()
  }
}
