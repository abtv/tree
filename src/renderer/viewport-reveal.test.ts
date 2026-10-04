// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createViewportReveal } from './viewport-reveal'
import { notifyViewportLayout, revealInViewport } from './scroll-viewport'

vi.mock('./scroll-viewport', async (original) => ({
  ...(await original<typeof import('./scroll-viewport')>()),
  revealInViewport: vi.fn(),
}))

let notify: () => void
let observed: Set<Element>
let dispose: () => void

beforeEach(() => {
  observed = new Set()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notify = callback
      }
      observe(element: Element) {
        observed.add(element)
      }
      disconnect() {
        observed.clear()
      }
    },
  )
})

afterEach(() => {
  dispose?.()
  document.body.replaceChildren()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

function fixture() {
  const viewport = document.createElement('div')
  viewport.className = 'scroll-viewport'
  Object.defineProperties(viewport, {
    scrollTop: { value: 1000, writable: true },
    scrollHeight: { value: 10000, writable: true },
    clientHeight: { value: 600 },
  })
  const content = document.createElement('section')
  const row = document.createElement('div')
  content.append(row)
  viewport.append(content)
  document.body.append(viewport)
  const reveal = createViewportReveal()
  dispose = reveal.mount()
  return { viewport, content, row, reveal }
}

describe('viewport reveal lifecycle', () => {
  it('observes only destination, content and viewport and reapplies policy without moving focus', () => {
    const { row, content, viewport, reveal } = fixture()
    const active = document.activeElement
    reveal.begin(row, true, () => true)
    expect(observed).toEqual(new Set([row, content, viewport]))
    notify()
    notifyViewportLayout()
    expect(revealInViewport).toHaveBeenCalledTimes(3)
    expect(revealInViewport).toHaveBeenLastCalledWith(row, true)
    expect(document.activeElement).toBe(active)
  })

  it('preserves pointer visibility policy on later image growth', () => {
    const { row, reveal } = fixture()
    reveal.begin(row, false, () => true)
    notify()
    expect(revealInViewport).toHaveBeenLastCalledWith(row, false)
  })

  it.each(['wheel', 'touchstart', 'pointerdown'])('relinquishes correction after %s', (type) => {
    const { row, reveal } = fixture()
    reveal.begin(row, true, () => true)
    document.dispatchEvent(new Event(type))
    notify()
    notifyViewportLayout()
    expect(revealInViewport).toHaveBeenCalledOnce()
    expect(observed.size).toBe(0)
  })

  it.each(['PageDown', 'PageUp', 'Home', 'End'])('relinquishes correction for native %s scrolling', (key) => {
    const { row, reveal } = fixture()
    reveal.begin(row, true, () => true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key }))
    notify()
    expect(revealInViewport).toHaveBeenCalledOnce()
  })

  it('does not cancel geometry settlement for a text key', () => {
    const { row, reveal } = fixture()
    reveal.begin(row, true, () => true)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }))
    notify()
    expect(revealInViewport).toHaveBeenCalledTimes(2)
  })

  it('stops stale or disconnected destination corrections', () => {
    const { row, reveal } = fixture()
    let current = true
    reveal.begin(row, true, () => current)
    current = false
    notify()
    expect(revealInViewport).toHaveBeenCalledOnce()
    expect(observed.size).toBe(0)
    reveal.begin(row, true, () => true)
    row.remove()
    notify()
    expect(revealInViewport).toHaveBeenCalledTimes(2)
  })

  it('replaces the previous destination and stops explicitly preserved viewport motions', () => {
    const { content, row, reveal } = fixture()
    const other = document.createElement('div')
    content.append(other)
    reveal.begin(row, true, () => true)
    reveal.begin(other, false, () => true)
    expect(observed.has(row)).toBe(false)
    notify()
    expect(revealInViewport).toHaveBeenLastCalledWith(other, false)
    reveal.cancel()
    notify()
    notifyViewportLayout()
    expect(revealInViewport).toHaveBeenCalledTimes(3)
  })

  it('distinguishes own scrolling, native anchoring and deliberate offset changes', () => {
    const { viewport, row, reveal } = fixture()
    reveal.begin(row, true, () => true)
    viewport.dispatchEvent(new Event('scroll'))
    expect(revealInViewport).toHaveBeenCalledOnce()
    Object.defineProperty(viewport, 'scrollHeight', { value: 10100 })
    viewport.scrollTop = 1100
    viewport.dispatchEvent(new Event('scroll'))
    expect(revealInViewport).toHaveBeenCalledTimes(2)
    viewport.scrollTop = 1300
    viewport.dispatchEvent(new Event('scroll'))
    notify()
    expect(revealInViewport).toHaveBeenCalledTimes(2)
    expect(observed.size).toBe(0)
  })

  it('handles viewport resize and removes every subscription on cleanup', () => {
    const { viewport, row, reveal } = fixture()
    reveal.begin(row, true, () => true)
    window.dispatchEvent(new Event('resize'))
    expect(revealInViewport).toHaveBeenCalledTimes(2)
    dispose()
    notify()
    notifyViewportLayout()
    window.dispatchEvent(new Event('resize'))
    viewport.dispatchEvent(new Event('scroll'))
    expect(revealInViewport).toHaveBeenCalledTimes(2)
  })

  it('still reveals immediately without ResizeObserver support', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { row, reveal } = fixture()
    reveal.begin(row, true, () => true)
    expect(revealInViewport).toHaveBeenCalledOnce()
  })
})
