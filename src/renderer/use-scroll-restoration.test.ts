// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import { useScrollRestoration } from './use-scroll-restoration'

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function geometry(options: { top?: number; height?: number; heading?: boolean } = {}) {
  const row = document.createElement('div')
  row.dataset.nodeId = 'node'
  row.className = options.heading ? 'current-parent' : 'node-row'
  const list = document.createElement('div')
  list.className = 'node-list'
  list.append(row)
  document.body.append(list)
  const position = { top: options.top ?? 300, height: options.height ?? 40 }
  vi.spyOn(row, 'getBoundingClientRect').mockImplementation(
    () => ({ top: position.top, height: position.height, bottom: position.top + position.height }) as DOMRect,
  )
  vi.stubGlobal('scrollBy', (_x: number, y: number) => {
    position.top -= y
  })
  vi.stubGlobal('innerHeight', 500)
  return { row, position }
}

function resizeObserver() {
  let callback: ResizeObserverCallback | undefined
  const observed = new Set<Element>()
  let disconnected = false
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: ResizeObserverCallback) {
        callback = cb
      }
      observe(element: Element) {
        observed.add(element)
      }
      disconnect() {
        disconnected = true
        observed.clear()
      }
    },
  )
  return { observed, disconnected: () => disconnected, notify: () => act(() => callback?.([], {} as ResizeObserver)) }
}

describe('useScrollRestoration', () => {
  it('waits for ready, restores once, and keeps the saved row top while layout grows', async () => {
    const f = await createRealStoreHarness({ selectedRowTop: 80 }),
      g = geometry(),
      observer = resizeObserver()
    const { rerender } = renderHook(({ ready }) => useScrollRestoration(f.store, ready), {
      initialProps: { ready: false },
    })
    expect(g.position.top).toBe(300)
    rerender({ ready: true })
    expect(g.position.top).toBe(80)
    expect(observer.observed.has(document.documentElement)).toBe(true)
    g.position.top = 240
    observer.notify()
    expect(g.position.top).toBe(80)
    window.dispatchEvent(new Event('scroll'))
    await f.store.flushPersistence()
    expect(f.saves).toHaveLength(0)
    f.store.editText('node', 'changed')
    await f.store.flushPersistence()
    expect(f.saves.at(-1)).toMatchObject({ view: { selectedRowTop: 80 } })
    rerender({ ready: false })
    g.position.top = 200
    rerender({ ready: true })
    expect(g.position.top).toBe(200)
  })

  it.each([
    [900, 40, 460],
    [80, 700, 0],
    [0, 40, 0],
  ])('clamps saved top %s for row height %s to %s', async (top, height, expected) => {
    const f = await createRealStoreHarness({ selectedRowTop: top }),
      g = geometry({ height })
    renderHook(() => useScrollRestoration(f.store, true))
    expect(g.position.top).toBe(expected)
  })

  it('restores the current-parent heading when that is selected', async () => {
    const f = await createRealStoreHarness({
        selectedRowTop: 100,
        location: { currentParentId: 'node', selectedNodeId: 'node' },
      }),
      g = geometry({ heading: true })
    renderHook(() => useScrollRestoration(f.store, true))
    expect(g.position.top).toBe(100)
  })

  it('retains the pending measurement for a missing row and aligns when it appears', async () => {
    const f = await createRealStoreHarness({ selectedRowTop: 70 }),
      observer = resizeObserver()
    vi.stubGlobal('scrollBy', () => undefined)
    renderHook(() => useScrollRestoration(f.store, true))
    observer.notify()
    f.store.editText('node', 'changed')
    await f.store.flushPersistence()
    expect(f.saves.at(-1)).toMatchObject({ view: { selectedRowTop: 70 } })
    const g = geometry()
    observer.notify()
    expect(g.position.top).toBe(70)
  })

  it.each(['wheel', 'keydown', 'pointerdown', 'touchstart'])(
    'stops realigning after %s and records subsequent user scrolling',
    async (event) => {
      const f = await createRealStoreHarness({ selectedRowTop: 80 }),
        g = geometry(),
        observer = resizeObserver()
      renderHook(() => useScrollRestoration(f.store, true))
      window.dispatchEvent(new Event(event))
      g.position.top = 230
      observer.notify()
      expect(g.position.top).toBe(230)
      window.dispatchEvent(new Event('scroll'))
      await f.store.flushPersistence()
      expect(f.saves.at(-1)).toMatchObject({ view: { selectedRowTop: 230 } })
    },
  )

  it.each([-100, 900])('clamps a user-scrolled offscreen row at %s when saving', async (top) => {
    const f = await createRealStoreHarness(),
      g = geometry()
    vi.stubGlobal('ResizeObserver', undefined)
    renderHook(() => useScrollRestoration(f.store, true))
    expect(g.position.top).toBe(300)
    window.dispatchEvent(new Event('wheel'))
    g.position.top = top
    window.dispatchEvent(new Event('scroll'))
    await f.store.flushPersistence()
    expect(f.saves.at(-1)).toMatchObject({ view: { selectedRowTop: top < 0 ? 0 : 460 } })
  })

  it('keeps saves usable when there is no restored top and no rendered row', async () => {
    const f = await createRealStoreHarness()
    renderHook(() => useScrollRestoration(f.store, true))
    f.store.editText('node', 'changed')
    await f.store.flushPersistence()
    expect(f.saves.at(-1)).toMatchObject({ document: { roots: [{ text: 'changed' }] } })
  })

  it('removes observers, listeners, and the measurement reader on unmount', async () => {
    const f = await createRealStoreHarness({ selectedRowTop: 80 }),
      g = geometry(),
      observer = resizeObserver()
    const { unmount } = renderHook(() => useScrollRestoration(f.store, true))
    unmount()
    expect(observer.disconnected()).toBe(true)
    g.position.top = 200
    window.dispatchEvent(new Event('wheel'))
    window.dispatchEvent(new Event('scroll'))
    await f.store.flushPersistence()
    expect(f.saves).toHaveLength(0)
    f.store.editText('node', 'changed')
    await f.store.flushPersistence()
    expect(f.saves.at(-1)).toMatchObject({ view: { selectedRowTop: 80 } })
  })
})
