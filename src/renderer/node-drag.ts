export const HOLD_ACTIVATION_MS = 200

export type NodeDragPhase = 'idle' | 'pending' | 'dragging'

export interface NodeDragSource {
  nodeId: string
  index: number
  pointerId: number
}

export interface NodeDragState {
  phase: NodeDragPhase
  source: NodeDragSource | undefined
}

export const IDLE_NODE_DRAG: NodeDragState = { phase: 'idle', source: undefined }

export type NodeDragAction =
  | {
      type: 'press'
      source: NodeDragSource
      button: number
      isPrimary: boolean
      pointerType: string
    }
  | { type: 'hold'; pointerId: number }
  | { type: 'release'; pointerId: number }
  | { type: 'cancel' }

export function nodeDragReducer(state: NodeDragState, action: NodeDragAction): NodeDragState {
  switch (action.type) {
    case 'press':
      if (state.phase !== 'idle') return state
      if (action.button !== 0 || !action.isPrimary || action.pointerType !== 'mouse') return state
      return { phase: 'pending', source: action.source }
    case 'hold':
      if (state.phase !== 'pending' || state.source?.pointerId !== action.pointerId) return state
      return { phase: 'dragging', source: state.source }
    case 'release':
      if (state.phase === 'idle' || state.source?.pointerId !== action.pointerId) return state
      return IDLE_NODE_DRAG
    case 'cancel':
      return state.phase === 'idle' ? state : IDLE_NODE_DRAG
  }
}

export interface NodeDropRegion {
  index: number
  top: number
  bottom: number
}

export function insertionIndexAtPoint(regions: readonly NodeDropRegion[], pointerY: number): number | undefined {
  if (regions.length === 0) return undefined
  let topmost = regions[0]!
  let bottommost = regions[0]!
  let previous: NodeDropRegion | undefined
  for (const region of regions) {
    if (pointerY >= region.top && pointerY < region.bottom) {
      const middle = region.top + (region.bottom - region.top) / 2
      return pointerY < middle ? region.index : region.index + 1
    }
    if (region.top < topmost.top) topmost = region
    if (region.bottom > bottommost.bottom) bottommost = region
    if (region.bottom <= pointerY && (previous === undefined || region.bottom > previous.bottom)) {
      previous = region
    }
  }
  if (pointerY < topmost.top) return topmost.index
  if (pointerY >= bottommost.bottom) return bottommost.index + 1
  return previous === undefined ? topmost.index : previous.index + 1
}

export function effectiveDestination(insertionIndex: number, sourceIndex: number): number {
  return insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex
}

export function shouldCommitMove(insertionIndex: number, sourceIndex: number): boolean {
  return effectiveDestination(insertionIndex, sourceIndex) !== sourceIndex
}

export interface DropMarker {
  index: number
  before: boolean
}

export function dropMarkerFor(
  dropIndex: number | undefined,
  count: number,
  mountedIndices: readonly number[] | undefined,
): DropMarker | undefined {
  if (dropIndex === undefined || count === 0) return undefined
  if (mountedIndices === undefined) {
    return dropIndex >= count ? { index: count - 1, before: false } : { index: dropIndex, before: true }
  }
  let beforeIndex: number | undefined
  let afterIndex: number | undefined
  for (const index of mountedIndices) {
    if (index === dropIndex && index < count) beforeIndex = index
    else if (index < dropIndex && (afterIndex === undefined || index > afterIndex)) afterIndex = index
  }
  if (beforeIndex !== undefined) return { index: beforeIndex, before: true }
  if (afterIndex !== undefined) return { index: afterIndex, before: false }
  return undefined
}
