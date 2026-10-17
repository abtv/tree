import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { CaretProjectionState } from './caret-projection-state'

it('never allows deferred focus work to overwrite a newer placement or restored selection', () => {
  fc.assert(
    fc.property(
      fc.array(fc.record({ cursor: fc.nat(100), kind: fc.constantFrom('command', 'insert', 'visual', 'drag') }), {
        minLength: 1,
        maxLength: 50,
      }),
      (actions) => {
        const owner = new CaretProjectionState({ nodeId: 'node', cursor: 0, token: 1 }, 'normal')
        const stale = []
        for (const action of actions) {
          stale.push(owner.captureFocusWork())
          if (action.kind === 'command')
            owner.placeCaret(
              'node',
              { cursor: action.cursor, imageActive: false },
              { focusToken: 1, fromFocus: false, defer: true },
            )
          else if (action.kind === 'insert') owner.requestCaret({ nodeId: 'node', cursor: action.cursor }, 1)
          else if (action.kind === 'visual') {
            owner.requestVisual({ nodeId: 'node', start: 0, end: action.cursor })
            owner.takeVisual()
          } else owner.restoreDrag('node', { cursor: action.cursor, imageActive: true }, 1)
          for (const work of stale) expect(owner.isCurrentFocusWork(work)).toBe(false)
          expect(owner.isCurrentFocusWork(owner.captureFocusWork())).toBe(true)
          const pending = owner.takeCaret()
          if (action.kind === 'command' || action.kind === 'insert') expect(pending?.cursor).toBe(action.cursor)
          else expect(pending).toBeUndefined()
        }
      },
    ),
    { numRuns: propertyRuns(200) },
  )
})
