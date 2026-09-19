import { describe, expect, it } from 'vitest'
import {
  IDLE_NODE_DRAG,
  dropMarkerFor,
  insertionIndexAtPoint,
  nodeDragReducer,
  shouldCommitMove,
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

describe('insertionIndexAtPoint', () => {
  it('returns undefined without rendered regions', () => {
    expect(insertionIndexAtPoint([], 10)).toBeUndefined()
  })

  it('splits a row at its midpoint', () => {
    const regions = [{ index: 3, top: 100, bottom: 120 }]
    expect(insertionIndexAtPoint(regions, 100)).toBe(3)
    expect(insertionIndexAtPoint(regions, 109)).toBe(3)
    expect(insertionIndexAtPoint(regions, 110)).toBe(4)
    expect(insertionIndexAtPoint(regions, 119)).toBe(4)
  })

  it('maps above the first and below the last row to the list edges', () => {
    const regions = [
      { index: 0, top: 0, bottom: 27 },
      { index: 1, top: 27, bottom: 54 },
    ]
    expect(insertionIndexAtPoint(regions, -10)).toBe(0)
    expect(insertionIndexAtPoint(regions, 100)).toBe(2)
  })

  it('does not depend on region order', () => {
    const regions = [
      { index: 2, top: 54, bottom: 81 },
      { index: 0, top: 0, bottom: 27 },
      { index: 1, top: 27, bottom: 54 },
    ]
    expect(insertionIndexAtPoint(regions, 40)).toBe(1)
    expect(insertionIndexAtPoint(regions, -5)).toBe(0)
    expect(insertionIndexAtPoint(regions, 90)).toBe(3)
  })

  it('maps a gap to the position after the nearest row above it', () => {
    const regions = [
      { index: 0, top: 0, bottom: 27 },
      { index: 36, top: 972, bottom: 999 },
      { index: 550, top: 14850, bottom: 14877 },
    ]
    expect(insertionIndexAtPoint(regions, 500)).toBe(1)
    expect(insertionIndexAtPoint(regions, 10000)).toBe(37)
    expect(insertionIndexAtPoint(regions, 14850)).toBe(550)
    expect(insertionIndexAtPoint(regions, 14870)).toBe(551)
    expect(insertionIndexAtPoint(regions, 20000)).toBe(551)
  })
})

describe('shouldCommitMove', () => {
  it('treats the effective current position as a no-op', () => {
    expect(shouldCommitMove(2, 2)).toBe(false)
    expect(shouldCommitMove(3, 2)).toBe(false)
    expect(shouldCommitMove(3, 3)).toBe(false)
    expect(shouldCommitMove(4, 3)).toBe(false)
  })

  it('commits a real position change', () => {
    expect(shouldCommitMove(0, 2)).toBe(true)
    expect(shouldCommitMove(1, 2)).toBe(true)
    expect(shouldCommitMove(4, 2)).toBe(true)
    expect(shouldCommitMove(2, 3)).toBe(true)
    expect(shouldCommitMove(2, 0)).toBe(true)
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
})
