import { useEffect, useLayoutEffect, useRef } from 'react'
import type { EditorStore } from '../application/editor-store'
import { onViewportScroll, scrollViewportBy, viewportBounds, viewportContent } from './scroll-viewport'

const USER_INPUT_EVENTS = ['wheel', 'keydown', 'pointerdown', 'touchstart'] as const

/** The rendered row of the selected node, or the current-parent heading when that is selected. */
function selectedRowElement(store: EditorStore): HTMLElement | undefined {
  const state = store.getSnapshot()
  if (state.status !== 'ready') return undefined
  const { currentParentId, selectedNodeId } = state.location
  if (selectedNodeId === currentParentId) return document.querySelector<HTMLElement>('.current-parent') ?? undefined
  for (const row of document.querySelectorAll<HTMLElement>('.node-list [data-node-id]'))
    if (row.dataset.nodeId === selectedNodeId) return row
  return undefined
}

/**
 * Clamps a distance from the top of the window so the whole row fits in the current window. A saved
 * distance is clamped again at launch, because the window may now be shorter than when it was saved.
 */
function clampRowTop(row: HTMLElement, top: number): number {
  const { height } = row.getBoundingClientRect()
  const viewport = viewportBounds()
  const lowest = Math.max(viewport.top, viewport.bottom - Math.min(height, viewport.bottom - viewport.top))
  return Math.min(Math.max(top, viewport.top), lowest)
}

/** Scrolls the content so the row sits at the clamped target distance from the top of the window. */
function alignRow(row: HTMLElement, target: number): void {
  scrollViewportBy(row.getBoundingClientRect().top - clampRowTop(row, target))
}

/**
 * Restores where the selected row sat in the window at launch and keeps that measurement current for
 * saves (`docs/PRODUCT.md` §16.1).
 *
 * A raw page offset does not survive a relaunch: the windowed list starts with estimated heights for
 * rows it has not measured, and images load after the first render, so the same pixel offset shows
 * different content. The selected row is always rendered, so the restore scrolls it back to its saved
 * distance from the top of the window and keeps re-aligning it while the page grows, until the user
 * scrolls, types, or points. Until then the saved value is what a save records.
 *
 * Call this after the input bindings, so the alignment runs after their initial focus has scrolled
 * the selected row into view.
 */
export function useScrollRestoration(store: EditorStore, ready: boolean): void {
  const restored = useRef(false)
  const pendingTop = useRef<number | undefined>(undefined)

  useLayoutEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    const target = store.getRestoredSelectedRowTop()
    if (target === undefined) return
    pendingTop.current = target
    const row = selectedRowElement(store)
    if (row !== undefined) alignRow(row, target)
  }, [ready, store])

  useEffect(() => {
    if (!ready) return undefined
    let userActive = false
    const onUserInput = (): void => {
      userActive = true
      pendingTop.current = undefined
    }
    const realign = (): void => {
      const target = pendingTop.current
      const row = target === undefined ? undefined : selectedRowElement(store)
      if (target !== undefined && row !== undefined) alignRow(row, target)
    }
    // Programmatic scrolling at launch is not a change; only scrolling after user input is.
    const onScroll = (): void => {
      if (userActive) store.noteViewportChange()
    }
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(realign)
    observer?.observe(viewportContent())
    for (const type of USER_INPUT_EVENTS)
      globalThis.addEventListener(type, onUserInput, { capture: true, passive: true })
    const unsubscribeScroll = onViewportScroll(onScroll)
    const unregister = store.registerSelectedRowTopReader(() => {
      const row = selectedRowElement(store)
      if (row === undefined) return pendingTop.current
      return clampRowTop(row, pendingTop.current ?? row.getBoundingClientRect().top)
    })
    return () => {
      observer?.disconnect()
      for (const type of USER_INPUT_EVENTS) globalThis.removeEventListener(type, onUserInput, { capture: true })
      unsubscribeScroll()
      unregister()
    }
  }, [ready, store])
}
