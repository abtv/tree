// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  contextMargin,
  onViewportScroll,
  revealInViewport,
  viewportScrollEdges,
  scrollViewportBy,
  SCROLL_VIEWPORT_CLASS,
  viewportBounds,
  viewportContent,
} from './scroll-viewport'

function mountScroller(rect: { top: number; bottom: number }): HTMLElement {
  const element = document.createElement('div')
  element.className = SCROLL_VIEWPORT_CLASS
  element.append(document.createElement('section'))
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ ...rect, height: rect.bottom - rect.top } as DOMRect)
  document.body.append(element)
  return element
}

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('scroll viewport', () => {
  it('measures the content area below the toolbar, and falls back to the window without one', () => {
    expect(viewportBounds()).toEqual({ top: 0, bottom: globalThis.innerHeight })
    mountScroller({ top: 30, bottom: 700 })
    expect(viewportBounds()).toEqual({ top: 30, bottom: 700 })
  })

  it('falls back to the window when the content area has no laid-out height', () => {
    mountScroller({ top: 0, bottom: 0 })
    expect(viewportBounds()).toEqual({ top: 0, bottom: globalThis.innerHeight })
  })

  it('scrolls the content area, or the window when there is none', () => {
    const windowScroll = vi.spyOn(globalThis, 'scrollBy').mockImplementation(() => undefined)
    scrollViewportBy(7)
    expect(windowScroll).toHaveBeenCalledWith(0, 7)

    const element = mountScroller({ top: 30, bottom: 700 })
    const elementScroll = vi.fn()
    element.scrollBy = elementScroll
    scrollViewportBy(-9)
    expect(elementScroll).toHaveBeenCalledWith(0, -9)
    expect(windowScroll).toHaveBeenCalledOnce()
  })

  describe('revealInViewport', () => {
    // The content area spans 30 to 630, so it is 600 high and half of it is 300. The context is one
    // 25px row. By default it is scrolled far from both ends of the content, so no edge snap applies.
    function mountRow(
      options: {
        height?: number
        area?: { top: number; bottom: number }
        scrollTop?: number
        scrollHeight?: number
      } = {},
    ): { scrollBy: ReturnType<typeof vi.fn>; place: (top: number, keepContext?: boolean) => void } {
      const { height = 20, area = { top: 30, bottom: 630 }, scrollTop = 5_000, scrollHeight = 10_000 } = options
      const element = mountScroller(area)
      const scrollBy = vi.fn()
      element.scrollBy = scrollBy
      Object.defineProperties(element, {
        scrollTop: { value: scrollTop },
        scrollHeight: { value: scrollHeight },
        clientHeight: { value: area.bottom - area.top },
      })
      const row = document.createElement('div')
      return {
        scrollBy,
        place: (top: number, keepContext?: boolean) => {
          vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
            top,
            bottom: top + height,
            height,
            width: height === 0 ? 0 : 100,
          } as DOMRect)
          revealInViewport(row, keepContext)
        },
      }
    }

    it('leaves a fully visible element alone, even one inside the margin', () => {
      const { scrollBy, place } = mountRow()
      place(100)
      place(30)
      place(610)
      expect(scrollBy).not.toHaveBeenCalled()
    })

    it('moves a nearby element by the smallest distance that leaves one row of context', () => {
      const { scrollBy, place } = mountRow()
      // Partly hidden under the toolbar: its top must end at 30 + 25.
      place(20)
      expect(scrollBy).toHaveBeenLastCalledWith(0, -35)
      // Just below the content area: its bottom must end at 630 - 25.
      place(630)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 45)
      // Partly hidden at the bottom edge.
      place(620)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 35)
      // Almost half a viewport away is still nearby.
      place(900)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 315)
      place(-270)
      expect(scrollBy).toHaveBeenLastCalledWith(0, -325)
    })

    it('keeps one row of context around a fully visible element when asked to', () => {
      const { scrollBy, place } = mountRow()
      place(100, true)
      place(55, true)
      place(585, true)
      expect(scrollBy).not.toHaveBeenCalled()
      // Inside the top and bottom context zones: scroll just far enough to restore it.
      place(40, true)
      expect(scrollBy).toHaveBeenLastCalledWith(0, -15)
      place(600, true)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 15)
    })

    it('does nothing for an element that is not laid out', () => {
      const { scrollBy, place } = mountRow({ height: 0 })
      place(-500, true)
      expect(scrollBy).not.toHaveBeenCalled()
    })

    it('centers an element more than half the content area away', () => {
      const { scrollBy, place } = mountRow()
      // 30 + (600 - 20) / 2 = 320 is the centered top.
      place(-1_160)
      expect(scrollBy).toHaveBeenLastCalledWith(0, -1_480)
      place(1_000)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 680)
    })

    it('shrinks the context in a short content area and keeps the start of an element taller than it', () => {
      // A 60 high area keeps a quarter of it, 15: the bottom must end at 90 - 15.
      const short = mountRow({ area: { top: 30, bottom: 90 } })
      short.place(100)
      expect(short.scrollBy).toHaveBeenLastCalledWith(0, 45)
      document.body.replaceChildren()
      const taller = mountRow({ height: 700 })
      taller.place(100)
      expect(taller.scrollBy).toHaveBeenLastCalledWith(0, 70)
    })

    it('goes all the way to the document edge when the move ends within two rows of it', () => {
      // Moving up: 80 px scrolled, the move would stop at 80 - 35 = 45 < 50, so it reaches 0.
      const top = mountRow({ scrollTop: 80 })
      top.place(20)
      expect(top.scrollBy).toHaveBeenLastCalledWith(0, -80)
      top.place(-1_160)
      expect(top.scrollBy).toHaveBeenLastCalledWith(0, -80)
      document.body.replaceChildren()
      // Moving down: the end is at 9 400 and the move would stop at 9 385, within two rows of it.
      const bottom = mountRow({ scrollTop: 9_340, scrollHeight: 10_000 })
      bottom.place(630)
      expect(bottom.scrollBy).toHaveBeenLastCalledWith(0, 60)
      document.body.replaceChildren()
      // Farther from the edge than that, the move is exact.
      const far = mountRow({ scrollTop: 200 })
      far.place(20)
      expect(far.scrollBy).toHaveBeenLastCalledWith(0, -35)
    })

    it('never snaps against the direction of travel', () => {
      // Scrolled to the very start and moving down by 45: the target 45 is within two rows of the
      // start, but the move must go down, not back to 0.
      const top = mountRow({ scrollTop: 0 })
      top.place(630)
      expect(top.scrollBy).toHaveBeenLastCalledWith(0, 45)
      document.body.replaceChildren()
      // Scrolled to the very end and moving up by 35.
      const bottom = mountRow({ scrollTop: 9_400 })
      bottom.place(20)
      expect(bottom.scrollBy).toHaveBeenLastCalledWith(0, -35)
    })
  })

  it('keeps one one-line row of context, capped for a short content area', () => {
    expect(contextMargin(20, 600)).toBe(25)
    expect(contextMargin(80, 600)).toBe(25)
    expect(contextMargin(20, 60)).toBe(15)
    expect(contextMargin(700, 600)).toBe(0)
  })

  it('reports whether the content area is scrolled to its start or end', () => {
    expect(viewportScrollEdges()).toEqual({ atStart: true, atEnd: true })
    const element = mountScroller({ top: 30, bottom: 630 })
    const metrics = (scrollTop: number): void => {
      Object.defineProperties(element, {
        scrollTop: { value: scrollTop, configurable: true },
        scrollHeight: { value: 1_000, configurable: true },
        clientHeight: { value: 600, configurable: true },
      })
    }
    metrics(0)
    expect(viewportScrollEdges()).toEqual({ atStart: true, atEnd: false })
    metrics(200)
    expect(viewportScrollEdges()).toEqual({ atStart: false, atEnd: false })
    metrics(400)
    expect(viewportScrollEdges()).toEqual({ atStart: false, atEnd: true })
  })

  it('observes the scrolled content rather than the fixed-size container', () => {
    const element = mountScroller({ top: 30, bottom: 700 })
    expect(viewportContent()).toBe(element.firstElementChild)
  })

  it('reports scrolling of the content area and the window, but not of other elements', () => {
    const element = mountScroller({ top: 30, bottom: 700 })
    const other = document.createElement('textarea')
    document.body.append(other)
    const listener = vi.fn()
    const unsubscribe = onViewportScroll(listener)

    element.dispatchEvent(new Event('scroll'))
    expect(listener).toHaveBeenCalledTimes(1)
    globalThis.dispatchEvent(new Event('scroll'))
    expect(listener).toHaveBeenCalledTimes(2)
    other.dispatchEvent(new Event('scroll'))
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    element.dispatchEvent(new Event('scroll'))
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
