import fc from 'fast-check'
import { expect, it } from 'vitest'
import type { VimFindCommand, VimPendingCommand, VimRepeatChange } from './vim-keyboard-types'
import {
  beginStructuralChildOpen,
  beginStructuralOpen,
  beginStructuralVisual,
  clearCommandAssembly,
  clearPending,
  clearVisualRange,
  createVimCommandState,
  recordRepeatChange,
  structuralRepeatChange,
  takeStructuralInsert,
  type VimStructuralInsertSession,
} from './vim-command-state'

const characterKey = fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code))
const nodeId = fc.string({ minLength: 1, maxLength: 6 })

const sessionArbitrary: fc.Arbitrary<VimStructuralInsertSession> = fc.oneof(
  fc.record({
    kind: fc.constant('open' as const),
    originNodeId: nodeId,
    position: fc.constantFrom('before' as const, 'after' as const),
  }),
  fc.record({ kind: fc.constant('child-open' as const), originNodeId: nodeId }),
  fc.record({
    kind: fc.constant('visual' as const),
    originNodeId: nodeId,
    command: fc.constantFrom('c' as const, 's' as const),
    span: fc.integer({ min: 1, max: 40 }),
  }),
)

function beginSession(state: ReturnType<typeof createVimCommandState>, session: VimStructuralInsertSession): void {
  if (session.kind === 'open') beginStructuralOpen(state, session.originNodeId, session.position)
  else if (session.kind === 'child-open') beginStructuralChildOpen(state, session.originNodeId)
  else beginStructuralVisual(state, session.originNodeId, session.command, session.span)
}

it('takes the last begun structural session exactly once without touching the other slots', () => {
  fc.assert(
    fc.property(fc.array(sessionArbitrary, { maxLength: 20 }), (sessions) => {
      const state = createVimCommandState()
      const pending: VimPendingCommand = { count: '2', motionCount: '' }
      const change: VimRepeatChange = { kind: 'delete', motion: 'w', count: 1 }
      const find: VimFindCommand = { kind: 'f', character: 'x' }
      state.pending = pending
      state.lastChange = change
      state.lastFind = find
      state.visualAnchor = 1
      state.visualFocus = 2

      for (const session of sessions) beginSession(state, session)

      const last = sessions.at(-1)
      if (last === undefined) {
        expect(takeStructuralInsert(state)).toBeUndefined()
      } else {
        expect(takeStructuralInsert(state)).toEqual(last)
        expect(takeStructuralInsert(state)).toBeUndefined()
      }
      expect(state.pending).toBe(pending)
      expect(state.lastChange).toBe(change)
      expect(state.lastFind).toBe(find)
      expect(state.visualAnchor).toBe(1)
      expect(state.visualFocus).toBe(2)
    }),
  )
})

it('maps every structural session to its complete repeat-change descriptor', () => {
  fc.assert(
    fc.property(sessionArbitrary, fc.string({ maxLength: 60 }), (session, text) => {
      const expected =
        session.kind === 'open'
          ? { kind: 'structural-open' as const, position: session.position, text }
          : session.kind === 'child-open'
            ? { kind: 'structural-child-open' as const, text }
            : { kind: 'structural-visual' as const, command: session.command, span: session.span, text }
      expect(structuralRepeatChange(session, text)).toEqual(expected)
    }),
  )
})

type WriteOp =
  | { slot: 'pending'; value: VimPendingCommand | undefined }
  | { slot: 'lastChange'; value: VimRepeatChange | undefined }
  | { slot: 'lastFind'; value: VimFindCommand | undefined }
  | { slot: 'visualAnchor'; value: number | undefined }
  | { slot: 'visualFocus'; value: number | undefined }
  | { slot: 'recordRepeatChange'; value: VimRepeatChange }
  | { slot: 'clearPending' }
  | { slot: 'clearVisualRange' }
  | { slot: 'clearCommandAssembly' }

const pendingArbitrary = fc.option(
  fc.record({ count: fc.string({ maxLength: 3 }), motionCount: fc.string({ maxLength: 3 }) }),
  { nil: undefined },
)
const repeatChangeArbitrary: fc.Arbitrary<VimRepeatChange> = fc.oneof(
  fc.record({
    kind: fc.constant('delete' as const),
    motion: fc.constantFrom('w', 'x', '$', 'ge'),
    count: fc.integer({ min: 1, max: 9 }),
  }),
  fc.record({ kind: fc.constant('overwrite' as const), text: fc.string({ maxLength: 10 }), replaced: fc.nat(10) }),
)
const optionalRepeatChangeArbitrary: fc.Arbitrary<VimRepeatChange | undefined> = fc.option(repeatChangeArbitrary, {
  nil: undefined,
})
const findArbitrary: fc.Arbitrary<VimFindCommand | undefined> = fc.option(
  fc.record({ kind: fc.constantFrom('f' as const, 'F' as const, 't' as const, 'T' as const), character: characterKey }),
  { nil: undefined },
)
const cursorArbitrary = fc.option(fc.nat(500), { nil: undefined })

const writeOpArbitrary: fc.Arbitrary<WriteOp> = fc.oneof(
  fc.record({ slot: fc.constant('pending' as const), value: pendingArbitrary }),
  fc.record({ slot: fc.constant('lastChange' as const), value: optionalRepeatChangeArbitrary }),
  fc.record({ slot: fc.constant('lastFind' as const), value: findArbitrary }),
  fc.record({ slot: fc.constant('visualAnchor' as const), value: cursorArbitrary }),
  fc.record({ slot: fc.constant('visualFocus' as const), value: cursorArbitrary }),
  fc.record({ slot: fc.constant('recordRepeatChange' as const), value: repeatChangeArbitrary }),
  fc.record({ slot: fc.constant('clearPending' as const) }),
  fc.record({ slot: fc.constant('clearVisualRange' as const) }),
  fc.record({ slot: fc.constant('clearCommandAssembly' as const) }),
)

it('keeps each direct owner write in one slot and each transition scoped to its slots', () => {
  fc.assert(
    fc.property(fc.array(writeOpArbitrary, { maxLength: 40 }), (ops) => {
      const state = createVimCommandState()
      const model: {
        pending: VimPendingCommand | undefined
        lastChange: VimRepeatChange | undefined
        lastFind: VimFindCommand | undefined
        visualAnchor: number | undefined
        visualFocus: number | undefined
      } = {
        pending: undefined,
        lastChange: undefined,
        lastFind: undefined,
        visualAnchor: undefined,
        visualFocus: undefined,
      }

      for (const op of ops) {
        if (op.slot === 'pending') {
          state.pending = op.value
          model.pending = op.value
        } else if (op.slot === 'lastChange') {
          state.lastChange = op.value
          model.lastChange = op.value
        } else if (op.slot === 'lastFind') {
          state.lastFind = op.value
          model.lastFind = op.value
        } else if (op.slot === 'visualAnchor') {
          state.visualAnchor = op.value
          model.visualAnchor = op.value
        } else if (op.slot === 'visualFocus') {
          state.visualFocus = op.value
          model.visualFocus = op.value
        } else if (op.slot === 'recordRepeatChange') {
          recordRepeatChange(state, op.value)
          model.lastChange = op.value
        } else if (op.slot === 'clearPending') {
          clearPending(state)
          model.pending = undefined
        } else if (op.slot === 'clearVisualRange') {
          clearVisualRange(state)
          model.visualAnchor = undefined
          model.visualFocus = undefined
        } else {
          clearCommandAssembly(state)
          model.pending = undefined
          model.visualAnchor = undefined
          model.visualFocus = undefined
        }
      }

      expect(state.pending).toBe(model.pending)
      expect(state.lastChange).toBe(model.lastChange)
      expect(state.lastFind).toBe(model.lastFind)
      expect(state.visualAnchor).toBe(model.visualAnchor)
      expect(state.visualFocus).toBe(model.visualFocus)
    }),
  )
})
