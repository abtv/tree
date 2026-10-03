import { locateNode, type Document, type Location } from '../domain/document'
import { rememberNodeVisual, type VimCommandState, type VimVisualMemory } from './vim-command-state'

/**
 * What `gv` restores: a validated Visual selection (`docs/PRODUCT.md` §20.2.1 T7). Kept free of
 * React, DOM, Electron, and store dependencies so every validity rule is unit-testable.
 */
export type VisualRestore =
  | { kind: 'text'; nodeId: string; anchor: number; focus: number; hadText: boolean }
  | { kind: 'nodes'; anchorId: string; focusId: string }

/**
 * A node is displayed when the current parent is the node itself or one of its ancestors and every
 * ancestor below the current parent is expanded (`docs/PRODUCT.md` §2.4).
 */
function isDisplayed(
  ancestors: readonly { readonly id: string }[],
  nodeId: string,
  location: Location,
  isExpanded: (nodeId: string) => boolean,
): boolean {
  const parentId = location.currentParentId
  if (nodeId === parentId) return true
  const start = parentId === null ? 0 : ancestors.findIndex((ancestor) => ancestor.id === parentId) + 1
  if (parentId !== null && start === 0) return false
  return ancestors.slice(start).every((ancestor) => isExpanded(ancestor.id))
}

/**
 * Resolve the remembered selection against the current document. Returns undefined — `gv` does
 * nothing — when any node of it was deleted or replaced, a character offset no longer exists, the
 * nodes are no longer exactly one contiguous sibling range, the range would include the
 * current-parent heading, or it is not displayed (collapsed fold or another location).
 */
export function resolveVisualMemory(
  memory: VimVisualMemory | undefined,
  document: Document,
  location: Location,
  isExpanded: (nodeId: string) => boolean,
): VisualRestore | undefined {
  if (memory === undefined) return undefined
  if (memory.kind === 'text') {
    const located = locateNode(document, memory.nodeId)
    if (located === undefined || !isDisplayed(located.ancestors, memory.nodeId, location, isExpanded)) return undefined
    const length = located.node.text.length
    // An empty text holds offset zero, unless the remembered text was emptied after the selection.
    if (memory.hadText && length === 0) return undefined
    const last = Math.max(0, length - 1)
    if (memory.anchor > last || memory.focus > last) return undefined
    return { ...memory }
  }
  if (memory.anchorId === location.currentParentId || memory.focusId === location.currentParentId) return undefined
  const anchor = locateNode(document, memory.anchorId)
  if (anchor === undefined) return undefined
  const focusIndex = anchor.siblings.findIndex((node) => node.id === memory.focusId)
  if (focusIndex < 0) return undefined
  const low = Math.min(anchor.index, focusIndex)
  const range = anchor.siblings.slice(low, Math.max(anchor.index, focusIndex) + 1)
  if (range.length !== memory.ids.length || range.some((node, index) => node.id !== memory.ids[index])) return undefined
  if (!isDisplayed(anchor.ancestors, memory.anchorId, location, isExpanded)) return undefined
  return { kind: 'nodes', anchorId: memory.anchorId, focusId: memory.focusId }
}

/** Remember the whole-node range between two nodes; nothing changes when they are not siblings. */
export function rememberNodeRange(state: VimCommandState, document: Document, anchorId: string, focusId: string): void {
  const anchor = locateNode(document, anchorId)
  const focusIndex = anchor?.siblings.findIndex((node) => node.id === focusId) ?? -1
  if (anchor === undefined || focusIndex < 0) return
  const range = anchor.siblings.slice(Math.min(anchor.index, focusIndex), Math.max(anchor.index, focusIndex) + 1)
  rememberNodeVisual(
    state,
    anchorId,
    focusId,
    range.map((node) => node.id),
  )
}

/** Remember the `count` consecutive siblings from `firstId`, which a put just inserted, selected forward. */
export function rememberIncomingNodes(
  state: VimCommandState,
  document: Document,
  firstId: string,
  count: number,
): void {
  const first = locateNode(document, firstId)
  const range = first?.siblings.slice(first.index, first.index + count) ?? []
  if (range.length !== count) return
  rememberNodeVisual(
    state,
    range[0]!.id,
    range[count - 1]!.id,
    range.map((node) => node.id),
  )
}
