import fc from 'fast-check'
import { expect, it } from 'vitest'
import { freezeCaret, releaseCaret } from './drag-caret-freeze'
import { IDLE_NODE_DRAG, resolveNodeDrag, type NodeDragState } from './node-drag'

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
