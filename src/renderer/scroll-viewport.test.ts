// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  onViewportScroll,
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
