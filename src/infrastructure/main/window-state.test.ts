import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  createDebouncedWindowBoundsSaver,
  createAppearancePreferenceStore,
  createBooleanPreferenceStore,
  createWindowBoundsStore,
  isValidWindowBounds,
  type WindowBounds,
} from './window-state'

function createPath(): string {
  return join(mkdtempSync(join(tmpdir(), 'tree-window-state-')), 'data', 'window-bounds.json')
}

const bounds: WindowBounds = { x: 120, y: 140, width: 900, height: 600 }

describe('isValidWindowBounds', () => {
  it('accepts finite bounds at the application minimum size', () => {
    expect(isValidWindowBounds({ x: -10, y: 20, width: 640, height: 480 })).toBe(true)
  })

  it('rejects malformed and undersized bounds', () => {
    expect(isValidWindowBounds(null)).toBe(false)
    expect(isValidWindowBounds({ ...bounds, width: 639 })).toBe(false)
    expect(isValidWindowBounds({ ...bounds, x: Number.NaN })).toBe(false)
  })
})

describe('createWindowBoundsStore', () => {
  it('saves and loads bounds, creating the data directory', () => {
    const path = createPath()
    const store = createWindowBoundsStore(path)

    store.save(bounds)

    expect(store.load()).toEqual(bounds)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(bounds)
  })

  it('ignores missing, malformed, and invalid persisted bounds', () => {
    const path = createPath()
    const store = createWindowBoundsStore(path)

    expect(store.load()).toBeNull()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '{broken')
    expect(store.load()).toBeNull()
    writeFileSync(path, JSON.stringify({ ...bounds, height: 100 }))
    expect(store.load()).toBeNull()
  })
})

describe('createBooleanPreferenceStore', () => {
  it('saves and loads the setting', () => {
    const path = createPath().replace('window-bounds.json', 'window-always-on-top.json')
    const store = createBooleanPreferenceStore(path)

    expect(store.load()).toBe(false)
    store.save(true)
    expect(store.load()).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toBe(true)
  })

  it('defaults malformed settings to false', () => {
    const path = createPath().replace('window-bounds.json', 'vim-enabled.json')
    const store = createBooleanPreferenceStore(path)

    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify('yes'))

    expect(store.load()).toBe(false)
  })
})

describe('createAppearancePreferenceStore', () => {
  it('reads as system until a choice is saved, then restores each choice', () => {
    const path = createPath().replace('window-bounds.json', 'appearance.json')
    const store = createAppearancePreferenceStore(path)

    expect(store.load()).toBe('system')
    for (const value of ['dark', 'light', 'system'] as const) {
      store.save(value)
      expect(createAppearancePreferenceStore(path).load()).toBe(value)
      expect(JSON.parse(readFileSync(path, 'utf8'))).toBe(value)
    }
  })

  it('reads malformed or unknown values as system', () => {
    const path = createPath().replace('window-bounds.json', 'appearance.json')
    const store = createAppearancePreferenceStore(path)
    mkdirSync(dirname(path), { recursive: true })

    for (const content of ['"sepia"', 'true', 'not json']) {
      writeFileSync(path, content)
      expect(store.load()).toBe('system')
    }
  })
})

describe('createDebouncedWindowBoundsSaver', () => {
  it('coalesces rapid saves into one write and keeps the latest bounds', () => {
    vi.useFakeTimers()
    try {
      const saved: WindowBounds[] = []
      const saver = createDebouncedWindowBoundsSaver({ load: () => null, save: (value) => saved.push(value) }, 300)

      saver.save({ ...bounds, x: 1 })
      saver.save({ ...bounds, x: 2 })
      saver.save({ ...bounds, x: 3 })

      expect(saved).toEqual([])
      vi.advanceTimersByTime(299)
      expect(saved).toEqual([])
      vi.advanceTimersByTime(1)
      expect(saved).toEqual([{ ...bounds, x: 3 }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushes pending bounds immediately and cancels the pending timer', () => {
    vi.useFakeTimers()
    try {
      const saved: WindowBounds[] = []
      const saver = createDebouncedWindowBoundsSaver({ load: () => null, save: (value) => saved.push(value) }, 300)

      saver.save({ ...bounds, y: 7 })
      saver.flush()

      expect(saved).toEqual([{ ...bounds, y: 7 }])
      vi.advanceTimersByTime(300)
      expect(saved).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing when flushed with no pending bounds', () => {
    const saved: WindowBounds[] = []
    const saver = createDebouncedWindowBoundsSaver({ load: () => null, save: (value) => saved.push(value) })

    saver.flush()

    expect(saved).toEqual([])
  })
})
