import {
  onViewportLayout,
  onViewportScroll,
  refreshViewportContext,
  revealInViewport,
  viewportContent,
  viewportScroller,
} from './scroll-viewport'

interface RevealIntent {
  element: Element
  keepContext: boolean
  isCurrent: () => boolean
}

/** One navigation's geometry projection; it never writes focus, caret, selection or document state. */
export function createViewportReveal() {
  let intent: RevealIntent | undefined
  let observer: ResizeObserver | undefined
  let expectedScroll = 0
  let expectedMax = 0

  const metrics = () => {
    const viewport = viewportScroller()
    return {
      top: viewport?.scrollTop ?? 0,
      max: viewport === undefined ? 0 : viewport.scrollHeight - viewport.clientHeight,
    }
  }
  const cancel = (): void => {
    intent = undefined
    observer?.disconnect()
  }
  const correct = (): void => {
    if (intent === undefined) return
    if (!intent.element.isConnected || !intent.isCurrent()) return cancel()
    revealInViewport(intent.element, intent.keepContext)
    const { top, max } = metrics()
    expectedScroll = top
    expectedMax = max
  }
  const begin = (element: Element, keepContext: boolean, isCurrent: () => boolean): void => {
    cancel()
    intent = { element, keepContext, isCurrent }
    correct()
    if (typeof ResizeObserver === 'undefined') return
    observer ??= new ResizeObserver(correct)
    // Three targets regardless of document size: destination, content and the fixed viewport.
    for (const target of new Set([element, viewportContent(), viewportScroller()])) {
      if (target !== undefined) observer.observe(target)
    }
  }
  const mount = (): (() => void) => {
    refreshViewportContext()
    const onScroll = (): void => {
      if (intent === undefined) return
      const { top, max } = metrics()
      if (top === expectedScroll) return
      // Native anchoring during content growth is part of geometry settlement. Other offset
      // changes (including scrollbar dragging and drag auto-scroll) relinquish navigation control.
      if (max !== expectedMax) correct()
      else cancel()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (['PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) cancel()
    }
    const onResize = (): void => {
      refreshViewportContext()
      correct()
    }
    const unsubscribeLayout = onViewportLayout(correct)
    const unsubscribeScroll = onViewportScroll(onScroll)
    for (const type of ['wheel', 'touchstart', 'pointerdown'])
      document.addEventListener(type, cancel, { capture: true, passive: true })
    document.addEventListener('keydown', onKey, true)
    globalThis.addEventListener('resize', onResize)
    return () => {
      cancel()
      unsubscribeLayout()
      unsubscribeScroll()
      for (const type of ['wheel', 'touchstart', 'pointerdown']) document.removeEventListener(type, cancel, true)
      document.removeEventListener('keydown', onKey, true)
      globalThis.removeEventListener('resize', onResize)
    }
  }
  return { begin, correct, cancel, mount }
}
