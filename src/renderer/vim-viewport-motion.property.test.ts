import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { viewportMotionTarget } from './vim-viewport-motion'
import type { VimViewportMotion } from './vim-keyboard-types'

const rowGeometry = fc.record({ top: fc.integer({ min: -200, max: 200 }), height: fc.integer({ min: 0, max: 80 }) })
const motion = fc.constantFrom<VimViewportMotion>('top', 'middle', 'bottom', 'half-up', 'half-down')

describe('viewport motion invariants', () => {
  it('targets an intersecting row and prefers fully visible rows for line motions', () => {
    fc.assert(
      fc.property(
        fc.array(rowGeometry, { maxLength: 60 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: 1, max: 150 }),
        fc.integer({ min: 0, max: 60 }),
        motion,
        fc.integer({ min: 1, max: 100 }),
        (geometry, top, height, currentIndex, command, count) => {
          const rows = geometry.map((row, index) => ({
            nodeId: `node-${index}`,
            top: row.top,
            bottom: row.top + row.height,
          }))
          const viewport = { top, bottom: top + height }
          const targetId = viewportMotionTarget(rows, viewport, `node-${currentIndex}`, command, count)
          const intersecting = rows.filter((row) => row.top < viewport.bottom && row.bottom > viewport.top)
          if (intersecting.length === 0) {
            expect(targetId).toBeUndefined()
            return
          }
          const target = intersecting.find((row) => row.nodeId === targetId)
          expect(target).toBeDefined()
          const fullyVisible = intersecting.filter((row) => row.top >= viewport.top && row.bottom <= viewport.bottom)
          if ((command === 'top' || command === 'middle' || command === 'bottom') && fullyVisible.length > 0) {
            expect(fullyVisible.some((row) => row.nodeId === targetId)).toBe(true)
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
