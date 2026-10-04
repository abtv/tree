export const HOLD_ACTIVATION_MS = 200
export const HOLD_MOVE_TOLERANCE_PX = 4

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
      // Mutation triage: `source` is defined in every non-idle phase, so the optional chain here and in
      // `release` only guards a state the reducer never produces.
      if (state.phase !== 'pending' || state.source?.pointerId !== action.pointerId) return state
      return { phase: 'dragging', source: state.source }
    case 'release':
      if (state.phase === 'idle' || state.source?.pointerId !== action.pointerId) return state
      return IDLE_NODE_DRAG
    case 'cancel':
      return state.phase === 'idle' ? state : IDLE_NODE_DRAG
  }
}

export interface NodeDragGate {
  locked: boolean
  sourceAvailable: boolean
}

/**
 * Fold the persistence lock and source-row availability into the gesture state so every caller
 * reads exactly one drag phase and the freeze cannot be expressed through diverging values.
 */
export function resolveNodeDrag(state: NodeDragState, gate: NodeDragGate): NodeDragState {
  if (state.phase === 'idle' || (!gate.locked && gate.sourceAvailable)) return state
  return IDLE_NODE_DRAG
}

export interface NodeDropRegion {
  index: number
  top: number
  bottom: number
}

export function exceedsHoldTolerance(startX: number, startY: number, clientX: number, clientY: number): boolean {
  const deltaX = clientX - startX
  const deltaY = clientY - startY
  return deltaX * deltaX + deltaY * deltaY > HOLD_MOVE_TOLERANCE_PX * HOLD_MOVE_TOLERANCE_PX
}

/** A row's outer band, top and bottom, as a share of its height; the band is a drop between rows. */
export const DROP_BAND_FRACTION = 0.25
/** The largest height of an outer band, so a tall wrapped row keeps a drop on the node in its middle. */
export const DROP_BAND_MAX_PX = 8
/** The horizontal distance that changes a drop level by one; it matches the per-level row indent in `styles.css`. */
export const DROP_LEVEL_STEP_PX = 20

/** A drop between rows, at the gap before `rows[gap]`, or a drop on the node in `rows[row]`. */
export type DropZone = { gap: number } | { row: number }

export function dropBandHeight(rowHeight: number): number {
  return Math.min(rowHeight * DROP_BAND_FRACTION, DROP_BAND_MAX_PX)
}

/**
 * Resolves the pointer's vertical position over the rendered rows to a drop zone. The outer bands of a
 * row are the gaps before and after it, and the middle is a drop on the row's node. Outside every row,
 * above the first, below the last, or in a stretch of unmounted rows, the pointer is in the gap after
 * the nearest rendered row above it, or before the first. Rows without height are ignored.
 */
export function dropZoneAtPoint(regions: readonly NodeDropRegion[], pointerY: number): DropZone | undefined {
  let topmost: NodeDropRegion | undefined
  let previous: NodeDropRegion | undefined
  // Mutation triage: the remaining survivors in this function are equivalent for rows with a positive
  // height and distinct tops, bottoms, and indices. A point on a row's bottom edge is the lower band of
  // that row or the top band of the touching row below, and both give `index + 1`; a point on the
  // topmost row's top edge is inside that row, so the later comparison with the topmost top never meets
  // it; ties between regions cannot occur.
  for (const region of regions) {
    if (region.bottom <= region.top) continue
    if (pointerY >= region.top && pointerY < region.bottom) {
      const band = dropBandHeight(region.bottom - region.top)
      if (pointerY < region.top + band) return { gap: region.index }
      if (pointerY >= region.bottom - band) return { gap: region.index + 1 }
      return { row: region.index }
    }
    if (topmost === undefined || region.top < topmost.top) topmost = region
    if (region.bottom <= pointerY && (previous === undefined || region.bottom > previous.bottom)) previous = region
  }
  if (topmost === undefined) return undefined
  if (pointerY < topmost.top) return { gap: topmost.index }
  // The pointer is not above the topmost row and inside none, so it is at or below that row's bottom.
  return { gap: previous!.index + 1 }
}

/**
 * The level for a drop between rows. It starts from the dragged node's own level and changes by one
 * for each full `DROP_LEVEL_STEP_PX` the pointer has travelled horizontally from the press point,
 * rightward for deeper, leftward for shallower, then clamps to the levels the gap offers. A straight
 * vertical drag therefore keeps the node's level whenever the gap allows it.
 */
export function dropLevelAtPoint(
  sourceLevel: number,
  pressX: number,
  pointerX: number,
  levels: { readonly min: number; readonly max: number },
): number {
  const steps = Math.trunc((pointerX - pressX) / DROP_LEVEL_STEP_PX)
  return Math.max(levels.min, Math.min(levels.max, sourceLevel + steps))
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
  // Mutation triage: mounted indices are distinct, so `>` and `>=` select the same row.
  for (const index of mountedIndices) {
    if (index === dropIndex && index < count) beforeIndex = index
    else if (index < dropIndex && (afterIndex === undefined || index > afterIndex)) afterIndex = index
  }
  if (beforeIndex !== undefined) return { index: beforeIndex, before: true }
  if (afterIndex !== undefined) return { index: afterIndex, before: false }
  return undefined
}
