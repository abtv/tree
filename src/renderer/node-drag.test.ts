import { describe, expect, it } from 'vitest'
import {
  DROP_BAND_MAX_PX,
  DROP_LEVEL_STEP_PX,
  IDLE_NODE_DRAG,
  dropLevelAtPoint,
  dropMarkerFor,
  dropZoneAtPoint,
  exceedsHoldTolerance,
  nodeDragReducer,
  resolveNodeDrag,
  type NodeDragAction,
  type NodeDragState,
} from './node-drag'

const source = { nodeId: 'a', index: 1, pointerId: 7 }

function press(overrides: Partial<Extract<NodeDragAction, { type: 'press' }>> = {}): NodeDragAction {
  return { type: 'press', source, button: 0, isPrimary: true, pointerType: 'mouse', ...overrides }
}

describe('nodeDragReducer', () => {
  it('arms a pending hold on a primary mouse press', () => {
    expect(nodeDragReducer(IDLE_NODE_DRAG, press())).toEqual({ phase: 'pending', source })
  })

  it('ignores secondary buttons, non-primary pointers, and unsupported pointer types', () => {
    expect(nodeDragReducer(IDLE_NODE_DRAG, press({ button: 2 }))).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(IDLE_NODE_DRAG, press({ isPrimary: false }))).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(IDLE_NODE_DRAG, press({ pointerType: 'touch' }))).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(IDLE_NODE_DRAG, press({ pointerType: 'pen' }))).toBe(IDLE_NODE_DRAG)
  })

  it('ignores duplicate presses while a gesture is pending or active', () => {
    const pending = nodeDragReducer(IDLE_NODE_DRAG, press())
    const other = { nodeId: 'b', index: 4, pointerId: 9 }
    expect(nodeDragReducer(pending, press({ source: other }))).toBe(pending)

    const dragging = nodeDragReducer(pending, { type: 'hold', pointerId: source.pointerId })
    expect(nodeDragReducer(dragging, press({ source: other }))).toBe(dragging)
  })

  it('activates only when the hold matches the pending pointer', () => {
    const pending = nodeDragReducer(IDLE_NODE_DRAG, press())
    expect(nodeDragReducer(IDLE_NODE_DRAG, { type: 'hold', pointerId: 7 })).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(pending, { type: 'hold', pointerId: 8 })).toBe(pending)
    expect(nodeDragReducer(pending, { type: 'hold', pointerId: 7 })).toEqual({
      phase: 'dragging',
      source,
    })
    const dragging: NodeDragState = { phase: 'dragging', source }
    expect(nodeDragReducer(dragging, { type: 'hold', pointerId: 7 })).toBe(dragging)
  })

  it('returns to idle on release from pending or dragging', () => {
    const pending = nodeDragReducer(IDLE_NODE_DRAG, press())
    const dragging = nodeDragReducer(pending, { type: 'hold', pointerId: 7 })
    expect(nodeDragReducer(pending, { type: 'release', pointerId: 8 })).toBe(pending)
    expect(nodeDragReducer(pending, { type: 'release', pointerId: 7 })).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(dragging, { type: 'release', pointerId: 7 })).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(IDLE_NODE_DRAG, { type: 'release', pointerId: 7 })).toBe(IDLE_NODE_DRAG)
  })

  it('cancels from any phase', () => {
    const pending = nodeDragReducer(IDLE_NODE_DRAG, press())
    const dragging = nodeDragReducer(pending, { type: 'hold', pointerId: 7 })
    expect(nodeDragReducer(pending, { type: 'cancel' })).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(dragging, { type: 'cancel' })).toBe(IDLE_NODE_DRAG)
    expect(nodeDragReducer(IDLE_NODE_DRAG, { type: 'cancel' })).toBe(IDLE_NODE_DRAG)
  })
})

describe('resolveNodeDrag', () => {
  const openGate = { locked: false, sourceAvailable: true }
  const pending: NodeDragState = { phase: 'pending', source }
  const dragging: NodeDragState = { phase: 'dragging', source }

  it('keeps the gesture state identity while the gate is open', () => {
    expect(resolveNodeDrag(pending, openGate)).toBe(pending)
    expect(resolveNodeDrag(dragging, openGate)).toBe(dragging)
    expect(resolveNodeDrag(IDLE_NODE_DRAG, openGate)).toBe(IDLE_NODE_DRAG)
  })

  it('resolves a locked editor or a missing source row to idle', () => {
    expect(resolveNodeDrag(pending, { locked: true, sourceAvailable: true })).toBe(IDLE_NODE_DRAG)
    expect(resolveNodeDrag(dragging, { locked: true, sourceAvailable: true })).toBe(IDLE_NODE_DRAG)
    expect(resolveNodeDrag(pending, { locked: false, sourceAvailable: false })).toBe(IDLE_NODE_DRAG)
    expect(resolveNodeDrag(dragging, { locked: false, sourceAvailable: false })).toBe(IDLE_NODE_DRAG)
  })

  it('always resolves idle to idle', () => {
    expect(resolveNodeDrag(IDLE_NODE_DRAG, { locked: true, sourceAvailable: false })).toBe(IDLE_NODE_DRAG)
  })
})

describe('exceedsHoldTolerance', () => {
  it('accepts movement within the tolerance in any direction', () => {
    expect(exceedsHoldTolerance(100, 100, 100, 100)).toBe(false)
    expect(exceedsHoldTolerance(100, 100, 104, 100)).toBe(false)
    expect(exceedsHoldTolerance(100, 100, 96, 100)).toBe(false)
    expect(exceedsHoldTolerance(100, 100, 100, 96)).toBe(false)
    expect(exceedsHoldTolerance(100, 100, 102, 102)).toBe(false)
  })

  it('reports movement beyond the tolerance from the press point', () => {
    expect(exceedsHoldTolerance(100, 100, 105, 100)).toBe(true)
    expect(exceedsHoldTolerance(100, 100, 95, 100)).toBe(true)
    expect(exceedsHoldTolerance(100, 100, 100, 105)).toBe(true)
    expect(exceedsHoldTolerance(100, 100, 103, 103)).toBe(true)
  })
})

describe('dropZoneAtPoint', () => {
  it('returns undefined without rendered rows or with rows that have no height', () => {
    expect(dropZoneAtPoint([], 10)).toBeUndefined()
    expect(dropZoneAtPoint([{ index: 0, top: 10, bottom: 10 }], 10)).toBeUndefined()
  })

  it('splits a row into an upper gap band, a middle drop on the node, and a lower gap band', () => {
    // A 20px row has 5px bands.
    const regions = [{ index: 3, top: 100, bottom: 120 }]
    expect(dropZoneAtPoint(regions, 100)).toEqual({ gap: 3 })
    expect(dropZoneAtPoint(regions, 104.9)).toEqual({ gap: 3 })
    expect(dropZoneAtPoint(regions, 105)).toEqual({ row: 3 })
    expect(dropZoneAtPoint(regions, 114.9)).toEqual({ row: 3 })
    expect(dropZoneAtPoint(regions, 115)).toEqual({ gap: 4 })
    expect(dropZoneAtPoint(regions, 119.9)).toEqual({ gap: 4 })
  })

  it('caps the band of a tall row so its middle stays a drop on the node', () => {
    const regions = [{ index: 0, top: 0, bottom: 100 }]
    expect(DROP_BAND_MAX_PX).toBe(8)
    expect(dropZoneAtPoint(regions, 7.9)).toEqual({ gap: 0 })
    expect(dropZoneAtPoint(regions, 8)).toEqual({ row: 0 })
    expect(dropZoneAtPoint(regions, 91.9)).toEqual({ row: 0 })
    expect(dropZoneAtPoint(regions, 92)).toEqual({ gap: 1 })
  })

  it('resolves the boundary between two touching rows to the gap between them', () => {
    const regions = [
      { index: 0, top: 0, bottom: 27 },
      { index: 1, top: 27, bottom: 54 },
    ]
    expect(dropZoneAtPoint(regions, 26.9)).toEqual({ gap: 1 })
    expect(dropZoneAtPoint(regions, 27)).toEqual({ gap: 1 })
  })

  it('maps above the first and below the last row to the list edges', () => {
    const regions = [
      { index: 0, top: 0, bottom: 27 },
      { index: 1, top: 27, bottom: 54 },
    ]
    expect(dropZoneAtPoint(regions, -10)).toEqual({ gap: 0 })
    expect(dropZoneAtPoint(regions, 100)).toEqual({ gap: 2 })
  })

  it('maps a point exactly on the bottom edge of a row to the gap after it', () => {
    expect(dropZoneAtPoint([{ index: 4, top: 0, bottom: 27 }], 27)).toEqual({ gap: 5 })
    const regions = [
      { index: 0, top: 0, bottom: 27 },
      { index: 36, top: 972, bottom: 999 },
    ]
    expect(dropZoneAtPoint(regions, 27)).toEqual({ gap: 1 })
    expect(dropZoneAtPoint(regions, 999)).toEqual({ gap: 37 })
  })

  it('maps a stretch of unmounted rows to the gap after the nearest rendered row above it', () => {
    const regions = [
      { index: 550, top: 14850, bottom: 14877 },
      { index: 0, top: 0, bottom: 27 },
      { index: 36, top: 972, bottom: 999 },
    ]
    expect(dropZoneAtPoint(regions, 500)).toEqual({ gap: 1 })
    expect(dropZoneAtPoint(regions, 10000)).toEqual({ gap: 37 })
    expect(dropZoneAtPoint(regions, 20000)).toEqual({ gap: 551 })
  })

  it('ignores a row without height instead of using it as a neighbor', () => {
    const regions = [
      { index: 0, top: 0, bottom: 27 },
      { index: 1, top: 40, bottom: 40 },
      { index: 2, top: 54, bottom: 81 },
    ]
    expect(dropZoneAtPoint(regions, 40)).toEqual({ gap: 1 })
    expect(dropZoneAtPoint(regions, -5)).toEqual({ gap: 0 })
  })
})

describe('dropLevelAtPoint', () => {
  const open = { min: 0, max: 9 }

  it('keeps the dragged node level while the pointer stays within one step of the press point', () => {
    expect(dropLevelAtPoint(2, 300, 300, open)).toBe(2)
    expect(dropLevelAtPoint(2, 300, 300 + DROP_LEVEL_STEP_PX - 1, open)).toBe(2)
    expect(dropLevelAtPoint(2, 300, 300 - DROP_LEVEL_STEP_PX + 1, open)).toBe(2)
  })

  it('changes by one level for each full step travelled, deeper to the right and shallower to the left', () => {
    expect(dropLevelAtPoint(2, 300, 300 + DROP_LEVEL_STEP_PX, open)).toBe(3)
    expect(dropLevelAtPoint(2, 300, 300 + 3 * DROP_LEVEL_STEP_PX + 5, open)).toBe(5)
    expect(dropLevelAtPoint(2, 300, 300 - DROP_LEVEL_STEP_PX, open)).toBe(1)
    expect(dropLevelAtPoint(2, 300, 300 - 2 * DROP_LEVEL_STEP_PX - 5, open)).toBe(0)
  })

  it('clamps to the levels the gap offers', () => {
    expect(dropLevelAtPoint(2, 300, 300 + 10 * DROP_LEVEL_STEP_PX, { min: 1, max: 4 })).toBe(4)
    expect(dropLevelAtPoint(2, 300, 300 - 10 * DROP_LEVEL_STEP_PX, { min: 1, max: 4 })).toBe(1)
    expect(dropLevelAtPoint(2, 300, 300, { min: 3, max: 3 })).toBe(3)
    expect(dropLevelAtPoint(5, 300, 300, { min: 0, max: 2 })).toBe(2)
  })
})

describe('dropMarkerFor', () => {
  it('has no marker without a target or rows', () => {
    expect(dropMarkerFor(undefined, 4, undefined)).toBeUndefined()
    expect(dropMarkerFor(0, 0, undefined)).toBeUndefined()
  })

  it('marks the row boundary when every row is rendered', () => {
    expect(dropMarkerFor(0, 4, undefined)).toEqual({ index: 0, before: true })
    expect(dropMarkerFor(2, 4, undefined)).toEqual({ index: 2, before: true })
    expect(dropMarkerFor(4, 4, undefined)).toEqual({ index: 3, before: false })
  })

  it('marks the nearest mounted row for a windowed list', () => {
    expect(dropMarkerFor(2, 600, [2, 3, 4])).toEqual({ index: 2, before: true })
    expect(dropMarkerFor(5, 600, [2, 3, 4])).toEqual({ index: 4, before: false })
    expect(dropMarkerFor(551, 600, [0, 1, 2, 550])).toEqual({ index: 550, before: false })
    expect(dropMarkerFor(550, 600, [0, 1, 2, 550])).toEqual({ index: 550, before: true })
    expect(dropMarkerFor(1, 600, [2, 3, 4])).toBeUndefined()
  })

  it('marks the lowest mounted row above the target in any mounted order', () => {
    expect(dropMarkerFor(5, 600, [4, 3, 2])).toEqual({ index: 4, before: false })
    expect(dropMarkerFor(5, 600, [3, 4, 2])).toEqual({ index: 4, before: false })
  })

  it('marks the end of a windowed list after its last mounted row, never before a row past the end', () => {
    expect(dropMarkerFor(4, 4, [2, 3])).toEqual({ index: 3, before: false })
    expect(dropMarkerFor(4, 4, [2, 3, 4])).toEqual({ index: 3, before: false })
  })

  it('keeps an idle gesture identity for stale pointer events', () => {
    const idleWithSource: NodeDragState = { phase: 'idle', source }
    expect(nodeDragReducer(idleWithSource, { type: 'release', pointerId: source.pointerId })).toBe(idleWithSource)
    expect(nodeDragReducer(idleWithSource, { type: 'cancel' })).toBe(idleWithSource)
    expect(resolveNodeDrag(idleWithSource, { locked: true, sourceAvailable: false })).toBe(idleWithSource)
  })
})
