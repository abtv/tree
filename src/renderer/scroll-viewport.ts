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
 * Scrolls the content area so the element is fully visible (docs/PRODUCT.md §20.8). Focusing an
 * element scrolls it into view natively, but centers it and not reliably when the focus change
 * happens while the list is re-rendering, so focus movement suppresses that scroll and calls this
 * instead. A nearby element moves by the smallest distance that leaves one row of context beyond
 * it, like Vim's `scrolloff`; an element more than half a viewport outside the content area is
 * centered. An element that is already fully visible stays put, unless `keepContext` also requires
 * the context on both sides: keyboard motion asks for it, a pointer press does not.
 */
export function revealInViewport(element: Element, keepContext = false): void {
  const { top, bottom } = viewportBounds()
  const rect = element.getBoundingClientRect()
  // An element that is not laid out has no position to reveal.
  if (rect.width === 0 && rect.height === 0) return
  const height = bottom - top
  const margin = contextMargin(rect.height, height)
  // With keepContext the element must also stay clear of both edges, not only be fully visible.
  const inset = keepContext ? margin : 0
  if (rect.top >= top + inset && rect.bottom <= bottom - inset) return
  if (rect.bottom < top - height / 2 || rect.top > bottom + height / 2) {
    scrollRevealBy(rect.top - (top + (height - rect.height) / 2), margin)
    return
  }
  if (rect.top < top + inset) scrollRevealBy(rect.top - (top + margin), margin)
  // An element taller than the content area keeps its start in view instead of its end.
  else scrollRevealBy(Math.min(rect.bottom - (bottom - margin), rect.top - top), margin)
}

/**
 * Scrolls by the distance, except that a scroll position closer to the start or end of the content
 * than two margins goes all the way there, so every way of reaching the document edge — walking,
 * `gg`, `G` — ends at the same offset instead of leaving a sliver of the margin unscrolled.
 */
function scrollRevealBy(deltaY: number, margin: number): void {
  const element = scroller()
  if (element === undefined || typeof element.scrollBy !== 'function') return scrollViewportBy(deltaY)
  const max = element.scrollHeight - element.clientHeight
  const target = element.scrollTop + deltaY
  // The document has its own padding beyond the first and last row, so the sliver is measured in
  // two margins. The snap only follows the direction of travel: scrolling down never returns to
  // the start.
  if (deltaY < 0 && target < margin * 2) scrollViewportBy(-element.scrollTop)
  else if (deltaY > 0 && target > max - margin * 2) scrollViewportBy(max - element.scrollTop)
  else scrollViewportBy(deltaY)
}

/** Height of a one-line row, the `min-height` of `.node-row` in styles.css. */
const CONTEXT_UNIT = 25

/** The context kept beyond an element: one one-line row, capped at a quarter of the content area. */
export function contextMargin(elementHeight: number, contentHeight: number): number {
  return Math.max(0, Math.min(CONTEXT_UNIT, contentHeight / 4, (contentHeight - elementHeight) / 2))
}

/** Whether the content area is scrolled to its very start or very end. */
export function viewportScrollEdges(): { atStart: boolean; atEnd: boolean } {
  const element = scroller()
  if (element === undefined) return { atStart: true, atEnd: true }
  return {
    atStart: element.scrollTop <= 0,
    atEnd: element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
  }
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
