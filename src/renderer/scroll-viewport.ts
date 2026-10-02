/** Class of the element that scrolls the tree content below the location toolbar. */
export const SCROLL_VIEWPORT_CLASS = 'scroll-viewport'

/** The scrolling content area, or undefined when the page has none (before the editor renders). */
function scroller(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>(`.${SCROLL_VIEWPORT_CLASS}`) ?? undefined
}

/** The visible content area in window coordinates: below the toolbar, above the window bottom. */
export function viewportBounds(): { top: number; bottom: number } {
  const element = scroller()
  if (element === undefined) return { top: 0, bottom: globalThis.innerHeight }
  const { top, bottom } = element.getBoundingClientRect()
  // An element that is not laid out has no visible area to measure against.
  if (bottom <= top) return { top: 0, bottom: globalThis.innerHeight }
  return { top, bottom }
}

export function scrollViewportBy(deltaY: number): void {
  const element = scroller()
  if (element === undefined || typeof element.scrollBy !== 'function') globalThis.scrollBy(0, deltaY)
  else element.scrollBy(0, deltaY)
}

/**
 * Scrolls the content area so the element is fully visible, centering it when it is not. Focusing
 * an element scrolls it into view natively, but not reliably when the focus change happens while
 * the list is re-rendering, so focus movement calls this afterwards. It does nothing for an
 * element that is already fully visible.
 */
export function revealInViewport(element: Element): void {
  const { top, bottom } = viewportBounds()
  const rect = element.getBoundingClientRect()
  if (rect.top >= top && rect.bottom <= bottom) return
  scrollViewportBy(rect.top - (top + (bottom - top - rect.height) / 2))
}

/** The element whose size changes when the scrolled content grows or shrinks. */
export function viewportContent(): Element {
  return scroller()?.firstElementChild ?? document.documentElement
}

/** Subscribes to scrolling of the content area only; returns the unsubscribe function. */
export function onViewportScroll(listener: () => void): () => void {
  const onElementScroll = (event: Event): void => {
    if (event.target === scroller()) listener()
  }
  // Element scroll events do not bubble, so a capturing listener on the document sees the content
  // area; the window listener covers the page-level fallback when there is no content area.
  document.addEventListener('scroll', onElementScroll, { capture: true, passive: true })
  globalThis.addEventListener('scroll', listener, { passive: true })
  return () => {
    document.removeEventListener('scroll', onElementScroll, { capture: true })
    globalThis.removeEventListener('scroll', listener)
  }
}
