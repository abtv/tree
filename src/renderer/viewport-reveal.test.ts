// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createViewportReveal } from './viewport-reveal'
import { centerRectInViewport, notifyViewportLayout, revealInViewport, revealRectInViewport } from './scroll-viewport'
import { caretLineRect } from './editor-dom'

vi.mock('./editor-dom', () => ({ caretLineRect: vi.fn(() => new DOMRect(0, 700, 400, 20)) }))

vi.mock('./scroll-viewport', async (original) => ({
  ...(await original<typeof import('./scroll-viewport')>()),
  revealInViewport: vi.fn(),
  revealRectInViewport: vi.fn(),
  centerRectInViewport: vi.fn(),
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
  it.each([25, 45])('uses the full Agenda row only when it is one line (%ipx)', (height) => {
    const { row, reveal } = fixture()
    row.className = 'agenda-row'
    row.style.minHeight = '25px'
    row.getBoundingClientRect = () => new DOMRect(0, 700, 400, height)
    const input = document.createElement('div')
    row.append(input)

    reveal.beginLine(
      () => input,
      0,
      () => true,
    )

    const call = vi.mocked(revealRectInViewport).mock.calls.at(-1)!
    expect(call[0].height).toBe(height === 25 ? 25 : 20)
    expect(call[1]).toBe(true)
    expect(call[2]).toBe(input)
  })

  it.each(['layout', 'resize', 'observer', 'scroll'])(
    'relinquishes an end jump before a %s correction even when content has grown',
    (signal) => {
      const { viewport, row, reveal } = fixture()
      reveal.beginRegion(
        row,
        () => new DOMRect(0, 700, 400, 200),
        () => true,
      )
      Object.defineProperty(viewport, 'scrollHeight', { value: 10100 })
      viewport.scrollTop = 9500

      if (signal === 'layout') notifyViewportLayout()
      else if (signal === 'resize') window.dispatchEvent(new Event('resize'))
      else if (signal === 'observer') notify()
      else viewport.dispatchEvent(new Event('scroll'))
      notifyViewportLayout()

      expect(centerRectInViewport).toHaveBeenCalledOnce()
      expect(observed.size).toBe(0)
    },
  )

  it.each([
    { extent: 10100, top: 1040 },
    { extent: 9900, top: 960 },
  ])('retains native anchoring within the content change: %j', ({ extent, top }) => {
    const { viewport, row, reveal } = fixture()
    reveal.begin(row, true, () => true)
    Object.defineProperty(viewport, 'scrollHeight', { value: extent })
    viewport.scrollTop = top

    notifyViewportLayout()

    expect(revealInViewport).toHaveBeenCalledTimes(2)
    expect(observed.size).toBe(3)
  })

  it('remeasures an opening region while layout settles and releases it on the next command', () => {
    const { row, reveal } = fixture()
    let region: DOMRect | undefined
    reveal.beginRegion(
      row,
      () => region,
      () => true,
    )

    expect(centerRectInViewport).not.toHaveBeenCalled()

    region = new DOMRect(0, 700, 400, 200)
    notifyViewportLayout()

    expect(centerRectInViewport).toHaveBeenLastCalledWith(region)
    expect(observed.size).toBe(3)

    region = new DOMRect(0, 700, 400, 300)
    notify()

    expect(centerRectInViewport).toHaveBeenLastCalledWith(region)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j' }))
    notifyViewportLayout()

    expect(centerRectInViewport).toHaveBeenCalledTimes(2)
    expect(observed.size).toBe(0)
    expect(revealInViewport).not.toHaveBeenCalled()
  })

  it('retains a line destination until its input mounts, then remeasures it on layout', () => {
    const { row, reveal } = fixture()
    const input: { current?: HTMLElement } = {}
    let current = true

    reveal.beginLine(
      () => input.current,
      80,
      () => current,
    )

    expect(reveal.hasLine()).toBe(true)
    expect(revealRectInViewport).not.toHaveBeenCalled()

    input.current = row

    reveal.correct()
    notifyViewportLayout()

    expect(caretLineRect).toHaveBeenLastCalledWith(row, 80)
    expect(revealRectInViewport).toHaveBeenCalledTimes(2)
    expect(revealRectInViewport).toHaveBeenLastCalledWith(new DOMRect(0, 700, 400, 20), true, row)
    expect(revealInViewport).not.toHaveBeenCalled()

    current = false

    expect(reveal.hasLine()).toBe(false)

    notify()

    expect(observed.size).toBe(0)
    expect(revealRectInViewport).toHaveBeenCalledTimes(2)
  })

  it('replaces a line destination and relinquishes it on deliberate scrolling', () => {
    const { row, reveal } = fixture()

    reveal.beginLine(
      () => row,
      0,
      () => true,
    )
    reveal.beginLine(
      () => row,
      40,
      () => true,
    )

    expect(caretLineRect).toHaveBeenLastCalledWith(row, 40)

    document.dispatchEvent(new Event('wheel'))

    expect(reveal.hasLine()).toBe(false)

    notifyViewportLayout()

    expect(revealRectInViewport).toHaveBeenCalledTimes(2)

    reveal.begin(row, true, () => true)

    expect(reveal.hasLine()).toBe(false)
    expect(revealInViewport).toHaveBeenCalledOnce()
  })

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
