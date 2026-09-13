import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

const MIN_WIDTH = 640
const MIN_HEIGHT = 480

export interface WindowBoundsStore {
  load(): WindowBounds | null
  save(bounds: WindowBounds): void
}

export interface BoundsTimers {
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(handle: unknown): void
}

export interface WindowBoundsSaver {
  save(bounds: WindowBounds): void
  flush(): void
}

export const WINDOW_BOUNDS_SAVE_DELAY_MILLISECONDS = 300

const systemTimers: BoundsTimers = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export function createDebouncedWindowBoundsSaver(
  store: WindowBoundsStore,
  delayMilliseconds: number = WINDOW_BOUNDS_SAVE_DELAY_MILLISECONDS,
  timers: BoundsTimers = systemTimers,
): WindowBoundsSaver {
  let handle: unknown
  let pending: WindowBounds | undefined

  const flush = (): void => {
    if (handle !== undefined) {
      timers.clearTimeout(handle)
      handle = undefined
    }
    if (pending === undefined) return
    const bounds = pending
    pending = undefined
    store.save(bounds)
  }

  const save = (bounds: WindowBounds): void => {
    pending = bounds
    if (handle !== undefined) timers.clearTimeout(handle)
    handle = timers.setTimeout(flush, delayMilliseconds)
  }

  return { save, flush }
}

export function isValidWindowBounds(value: unknown): value is WindowBounds {
  if (typeof value !== 'object' || value === null) return false
  const bounds = value as Partial<WindowBounds>
  return (
    typeof bounds.x === 'number' &&
    typeof bounds.y === 'number' &&
    typeof bounds.width === 'number' &&
    typeof bounds.height === 'number' &&
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width >= MIN_WIDTH &&
    bounds.height >= MIN_HEIGHT
  )
}

export function createWindowBoundsStore(path: string): WindowBoundsStore {
  return {
    load: () => {
      try {
        const value: unknown = JSON.parse(readFileSync(path, 'utf8'))
        return isValidWindowBounds(value) ? value : null
      } catch {
        return null
      }
    },
    save: (bounds) => {
      if (!isValidWindowBounds(bounds)) return
      try {
        mkdirSync(dirname(path), { recursive: true })
        writeFileSync(path, JSON.stringify(bounds))
      } catch {
        // Window-state persistence is opportunistic and must not interrupt window lifecycle events.
      }
    },
  }
}
