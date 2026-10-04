// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  onViewportScroll,
  revealInViewport,
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
    // The content area spans 30 to 630, so it is 600 high and half of it is 300.
    function mountRow(height = 20): { scrollBy: ReturnType<typeof vi.fn>; place: (top: number) => void } {
      const element = mountScroller({ top: 30, bottom: 630 })
      const scrollBy = vi.fn()
      element.scrollBy = scrollBy
      const row = document.createElement('div')
      return {
        scrollBy,
        place: (top: number) => {
          vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + height, height } as DOMRect)
          revealInViewport(row)
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

    it('moves a nearby element by the smallest distance that leaves one element height of context', () => {
      const { scrollBy, place } = mountRow()
      // Partly hidden under the toolbar: its top must end at 30 + 20.
      place(20)
      expect(scrollBy).toHaveBeenLastCalledWith(0, -30)
      // Just below the content area: its bottom must end at 630 - 20.
      place(630)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 40)
      // Partly hidden at the bottom edge.
      place(620)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 30)
      // Almost half a viewport away is still nearby.
      place(900)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 310)
      place(-270)
      expect(scrollBy).toHaveBeenLastCalledWith(0, -320)
    })

    it('centers an element more than half the content area away', () => {
      const { scrollBy, place } = mountRow()
      // 30 + (600 - 20) / 2 = 320 is the centered top.
      place(-1_160)
      expect(scrollBy).toHaveBeenLastCalledWith(0, -1_480)
      place(1_000)
      expect(scrollBy).toHaveBeenLastCalledWith(0, 680)
    })

    it('caps the margin for a tall element and keeps the start of one taller than the content area', () => {
      const tall = mountRow(200)
      // The margin is a quarter of the content area, 150, not the element height: 700 - (630 - 150).
      tall.place(500)
      expect(tall.scrollBy).toHaveBeenLastCalledWith(0, 220)
      document.body.replaceChildren()
      const taller = mountRow(700)
      taller.place(100)
      expect(taller.scrollBy).toHaveBeenLastCalledWith(0, 70)
    })
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
