import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createWindowBoundsStore, isValidWindowBounds, type WindowBounds } from './window-state'

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
