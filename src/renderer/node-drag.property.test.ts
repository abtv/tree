import fc from 'fast-check'
import { expect, it } from 'vitest'
import { freezeCaret, releaseCaret } from './drag-caret-freeze'
import {
  DROP_BAND_MAX_PX,
  IDLE_NODE_DRAG,
  dropBandHeight,
  dropLevelAtPoint,
  dropZoneAtPoint,
  resolveNodeDrag,
  type DropZone,
  type NodeDragState,
  type NodeDropRegion,
} from './node-drag'

const source = { nodeId: 'a', index: 1, pointerId: 1 }

it('resolves exactly one gated drag state', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<NodeDragState['phase']>('idle', 'pending', 'dragging'),
      fc.boolean(),
      fc.boolean(),
      (phase, locked, sourceAvailable) => {
        const state: NodeDragState = phase === 'idle' ? IDLE_NODE_DRAG : { phase, source }
        const resolved = resolveNodeDrag(state, { locked, sourceAvailable })
        if (phase === 'idle' || locked || !sourceAvailable) expect(resolved).toBe(IDLE_NODE_DRAG)
        else expect(resolved).toBe(state)
        if (resolved.phase === 'dragging') {
          expect(locked).toBe(false)
          expect(sourceAvailable).toBe(true)
          expect(state.phase).toBe('dragging')
        }
      },
    ),
  )
})

const rowHeights = fc.array(fc.integer({ min: 1, max: 200 }), { minLength: 1, maxLength: 12 })

/** Touching rows from the given heights, numbered from `firstIndex`. */
function stack(heights: readonly number[], firstIndex: number): NodeDropRegion[] {
  let top = 0
  return heights.map((height, offset) => {
    const region = { index: firstIndex + offset, top, bottom: top + height }
    top += height
    return region
  })
}

/** Where a zone sits in the document order: gap g is 2g, and the node of row r is 2r + 1. */
function order(zone: DropZone): number {
  return 'gap' in zone ? 2 * zone.gap : 2 * zone.row + 1
}

it('resolves every point over a row to a zone of that row, with outer bands within the cap', () => {
  fc.assert(
    fc.property(rowHeights, fc.nat(10), fc.double({ min: 0, max: 1, noNaN: true }), (heights, firstIndex, share) => {
      const regions = stack(heights, firstIndex)
      const total = regions[regions.length - 1]!.bottom
      const pointerY = Math.min(share * total, total - 1e-9)
      const region = regions.find((candidate) => pointerY >= candidate.top && pointerY < candidate.bottom)!
      const zone = dropZoneAtPoint(regions, pointerY)!
      const band = dropBandHeight(region.bottom - region.top)
      expect(band).toBeLessThanOrEqual(DROP_BAND_MAX_PX)
      expect(band).toBeLessThanOrEqual((region.bottom - region.top) / 4)
      if (pointerY < region.top + band) expect(zone).toEqual({ gap: region.index })
      else if (pointerY >= region.bottom - band) expect(zone).toEqual({ gap: region.index + 1 })
      else expect(zone).toEqual({ row: region.index })
    }),
  )
})

it('never moves to an earlier position as the pointer moves down', () => {
  fc.assert(
    fc.property(
      rowHeights,
      fc.nat(10),
      fc.array(fc.double({ min: -50, max: 3000, noNaN: true }), { minLength: 2, maxLength: 20 }),
      (heights, firstIndex, points) => {
        const regions = stack(heights, firstIndex)
        const sorted = points.slice().sort((a, b) => a - b)
        const orders = sorted.map((y) => order(dropZoneAtPoint(regions, y)!))
        for (let index = 1; index < orders.length; index += 1) {
          expect(orders[index]!).toBeGreaterThanOrEqual(orders[index - 1]!)
        }
      },
    ),
  )
})

it('resolves the same zone for any region order', () => {
  fc.assert(
    fc.property(
      rowHeights,
      fc.nat(10),
      fc.double({ min: -50, max: 3000, noNaN: true }),
      fc.infiniteStream(fc.nat()),
      (heights, firstIndex, pointerY, shuffle) => {
        const regions = stack(heights, firstIndex)
        const shuffled = regions
          .map((region) => ({ region, key: shuffle.next().value as number }))
          .sort((a, b) => a.key - b.key)
          .map((entry) => entry.region)
        expect(dropZoneAtPoint(shuffled, pointerY)).toEqual(dropZoneAtPoint(regions, pointerY))
      },
    ),
  )
})

it('keeps the drop level within the offered levels and monotonic in the pointer position', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 2000 }),
      fc.integer({ min: -400, max: 400 }),
      fc.integer({ min: -400, max: 400 }),
      (sourceLevel, a, b, pressX, firstShift, secondShift) => {
        const levels = { min: Math.min(a, b), max: Math.max(a, b) }
        const [left, right] = [firstShift, secondShift].sort((x, y) => x - y) as [number, number]
        const leftLevel = dropLevelAtPoint(sourceLevel, pressX, pressX + left, levels)
        const rightLevel = dropLevelAtPoint(sourceLevel, pressX, pressX + right, levels)
        expect(leftLevel).toBeGreaterThanOrEqual(levels.min)
        expect(rightLevel).toBeLessThanOrEqual(levels.max)
        expect(rightLevel).toBeGreaterThanOrEqual(leftLevel)
        // Without horizontal travel the node keeps its level, as far as the gap allows.
        expect(dropLevelAtPoint(sourceLevel, pressX, pressX, levels)).toBe(
          Math.max(levels.min, Math.min(levels.max, sourceLevel)),
        )
      },
    ),
  )
})

it('round-trips the captured caret through the matching pointer release', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }),
      fc.nat(100000),
      fc.nat(100000),
      fc.boolean(),
      fc.option(fc.nat(100000), { nil: undefined }),
      (nodeId, pointerId, cursor, imageActive, imageTextReturnCursor) => {
        const caret = { cursor, imageActive, ...(imageTextReturnCursor === undefined ? {} : { imageTextReturnCursor }) }
        const freeze = freezeCaret(nodeId, pointerId, caret)
        const released = releaseCaret(freeze, pointerId)

        expect(released).toBe(freeze)
        expect(released?.caret).toEqual(caret)
        expect(releaseCaret(freeze, pointerId + 1)).toBeUndefined()
        expect(releaseCaret(freeze, undefined)).toBe(freeze)
      },
    ),
  )
})
