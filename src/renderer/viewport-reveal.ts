import {
  onViewportLayout,
  onViewportScroll,
  refreshViewportContext,
  revealInViewport,
  revealRectInViewport,
  viewportContent,
  viewportScroller,
} from './scroll-viewport'
import { caretLineRect } from './editor-dom'

interface RevealIntent {
  element: () => Element | undefined
  keepContext: boolean
  isCurrent: () => boolean
  cursor?: number
}

/** One navigation's geometry projection; it never writes focus, caret, selection or document state. */
export function createViewportReveal() {
  let intent: RevealIntent | undefined
  let observer: ResizeObserver | undefined
  let expectedScroll = 0
  let expectedMax = 0
  let observedElement: Element | undefined

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
    observedElement = undefined
  }
  const correct = (): void => {
    if (intent === undefined) return
    if (!intent.isCurrent()) return cancel()
    const element = intent.element()
    // A counted motion can end outside the mounted window. Retain its intent until React mounts it.
    if (element === undefined) return
    if (!element.isConnected) return cancel()
    if (intent.cursor === undefined) revealInViewport(element, intent.keepContext)
    else revealRectInViewport(caretLineRect(element as HTMLElement, intent.cursor), intent.keepContext)
    const { top, max } = metrics()
    expectedScroll = top
    expectedMax = max
    if (typeof ResizeObserver === 'undefined' || observedElement === element) return
    observer ??= new ResizeObserver(correct)
    observer.disconnect()
    observedElement = element
    // Three targets regardless of document size: destination, content and the fixed viewport.
    for (const target of new Set([element, viewportContent(), viewportScroller()])) {
      if (target !== undefined) observer.observe(target)
    }
  }
  const begin = (element: Element, keepContext: boolean, isCurrent: () => boolean): void => {
    cancel()
    intent = { element: () => element, keepContext, isCurrent }
    correct()
  }
  const beginLine = (element: () => HTMLElement | undefined, cursor: number, isCurrent: () => boolean): void => {
    cancel()
    intent = { element, cursor, keepContext: true, isCurrent }
    correct()
  }
  const hasLine = (): boolean => intent?.cursor !== undefined && intent.isCurrent()
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
  return { begin, beginLine, hasLine, correct, cancel, mount }
}
