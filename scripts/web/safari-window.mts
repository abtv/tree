import { setTimeout as delay } from 'node:timers/promises'

export class SafariDriverError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(`SafariDriver: ${code}: ${message}`)
    this.code = code
  }
}

interface WindowDriver {
  select(handle: string): Promise<unknown>
  ready(): Promise<unknown>
  handles(): Promise<string[]>
}

export async function waitForSafariWindow(handle: string, driver: WindowDriver, signal: AbortSignal) {
  const deadline = Date.now() + 15_000
  let lastError: unknown
  do {
    signal.throwIfAborted()
    try {
      await driver.select(handle)
      if (await driver.ready()) return
    } catch (error) {
      // A lost selection is recoverable only while the original window still exists.
      // Never reopen the application or repeat its interactions to hide a failure.
      if (!(error instanceof SafariDriverError) || error.code !== 'no such window') throw error
      if (!(await driver.handles()).includes(handle)) throw error
      lastError = error
    }
    await delay(100, undefined, { signal })
  } while (Date.now() < deadline)
  throw new Error(`Safari window ${handle} did not become ready within 15000ms`, { cause: lastError })
}
