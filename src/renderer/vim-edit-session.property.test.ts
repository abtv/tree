import fc from 'fast-check'
import { expect, it } from 'vitest'
import {
  applyReplaceKey,
  beginInsertSession,
  beginReplaceSession,
  createVimEditSessionState,
  insertRepeatChange,
  resolveReplaceCommit,
  takeInsertSession,
  takeReplaceSession,
} from './vim-edit-session'
import { calculateTextChange, insertPosition } from './vim-text-commands'
import type { VimTextChange } from './vim-keyboard-types'

// A single UTF-16 code unit, so `key.length === 1` holds for every generated character key.
const characterKey = fc.integer({ min: 0x20, max: 0x7e }).map((code) => String.fromCharCode(code))
const replaceKey = fc.oneof(fc.constant('Backspace'), characterKey, fc.string({ minLength: 2, maxLength: 3 }))

it('consumes each pending session at most once without disturbing the other session', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.string({ maxLength: 40 }),
      fc.nat(1000),
      fc.nat(1000),
      (insertBaseline, replaceBaseline, insertSeed, replaceSeed) => {
        const state = createVimEditSessionState()
        state.register = { kind: 'text', value: insertBaseline }
        const insertSession = {
          nodeId: 'insert-node',
          baseline: insertBaseline,
          position: insertSeed % (insertBaseline.length + 1),
          change: { kind: 'insert', entry: 'i' } as const,
        }
        const replaceSession = {
          nodeId: 'replace-node',
          baseline: replaceBaseline,
          position: replaceSeed % (replaceBaseline.length + 1),
        }
        beginInsertSession(state, insertSession)
        beginReplaceSession(state, replaceSession)

        expect(takeInsertSession(state)).toBe(insertSession)
        expect(takeInsertSession(state)).toBeUndefined()
        expect(state.replace).toEqual({ ...replaceSession, typed: '' })
        expect(state.register).toEqual({ kind: 'text', value: insertBaseline })

        expect(takeReplaceSession(state)).toEqual({ ...replaceSession, typed: '' })
        expect(takeReplaceSession(state)).toBeUndefined()
        expect(state.insert).toBeUndefined()
      },
    ),
  )
})

it('commits every buffered Replace character at its recorded position', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 60 }), fc.nat(1000), fc.string({ maxLength: 40 }), (baseline, seed, typed) => {
      const position = seed % (baseline.length + 1)
      const commit = resolveReplaceCommit({ baseline, position, typed })
      if (typed === '') {
        expect(commit).toBeUndefined()
        return
      }
      if (commit === undefined) throw new Error('expected a commit for non-empty typed text')
      const replacedEnd = position + Math.min(typed.length, baseline.length - position)
      expect(commit.replacedStart).toBe(position)
      expect(commit.replacedEnd).toBe(replacedEnd)
      expect(commit.rawCursor).toBe(position + typed.length)
      expect(commit.finalText).toBe(baseline.slice(0, position) + typed + baseline.slice(replacedEnd))
    }),
  )
})

it('captures an Insert session as a diff that reconstructs its final text on the origin node', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 60 }),
      fc.string({ maxLength: 60 }),
      fc.nat(1000),
      fc.constantFrom('insert', 'change', 'substitute'),
      (baseline, finalText, seed, kind) => {
        const position = seed % (baseline.length + 1)
        const change: VimTextChange =
          kind === 'insert'
            ? { kind: 'insert', entry: 'i' }
            : kind === 'change'
              ? { kind: 'change', motion: 'w', count: 1 }
              : { kind: 'substitute', count: 1 }
        const captured = insertRepeatChange({ nodeId: 'origin', baseline, position, change }, finalText)
        if (kind === 'insert' && finalText === baseline) {
          expect(captured).toBeUndefined()
          return
        }
        if (captured === undefined) throw new Error('expected a captured text change')
        // The payload carries no origin node, so the same diff can replay at another caret in another
        // node (PRODUCT §20.2.19).
        expect(captured).not.toHaveProperty('nodeId')
        const capture = captured as {
          insertedText?: string
          insertOffset?: number
          deleteCount?: number
        }
        const { insertedText = '', insertOffset = 0, deleteCount = 0 } = capture
        expect(
          baseline.slice(0, position + insertOffset) +
            insertedText +
            baseline.slice(position + insertOffset + deleteCount),
        ).toBe(finalText)
      },
    ),
  )
})

it('replays a captured Insert diff as a splice at the destination caret, on any node', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 12 }),
      fc.integer({ min: 0, max: 12 }),
      fc.string({ maxLength: 6 }),
      fc.string({ maxLength: 12 }),
      fc.integer({ min: 0, max: 12 }),
      (source, offsetSeed, typed, destination, cursorSeed) => {
        if (typed === '') return
        const offset = Math.min(offsetSeed, source.length)
        const finalText = source.slice(0, offset) + typed + source.slice(offset)
        const captured = insertRepeatChange(
          { nodeId: 'origin', baseline: source, position: offset, change: { kind: 'insert', entry: 'i' } },
          finalText,
        )
        if (captured === undefined || captured.kind !== 'insert') throw new Error('expected a captured insert')
        // Replaying is a pure splice of the captured fields onto the destination text: the origin
        // node's baseline is never consulted, so the same diff applies at any node (T8).
        const cursor = Math.min(cursorSeed, destination.length)
        const start = insertPosition(destination, cursor, captured.entry)
        const position = Math.max(0, Math.min(start + (captured.insertOffset ?? 0), destination.length))
        const expected =
          destination.slice(0, position) +
          (captured.insertedText ?? '') +
          destination.slice(Math.min(destination.length, position + (captured.deleteCount ?? 0)))
        const replay = calculateTextChange(destination, cursor, captured, true, [])
        if (replay === undefined || replay.kind !== 'edit') throw new Error('expected a replay edit')
        expect(replay.nextText).toBe(expected)
      },
    ),
  )
})

it('keeps the incremental Replace working text equal to the splice its commit would produce', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.nat(1000),
      fc.array(replaceKey, { maxLength: 30 }),
      (baseline, seed, keys) => {
        const position = seed % (baseline.length + 1)
        const session = { nodeId: 'a', baseline, position, typed: '' }
        let expected = ''
        for (const key of keys) {
          const typedBefore = session.typed
          const result = applyReplaceKey(session, key)
          if (key === 'Backspace') {
            expected = expected.slice(0, -1)
            if (result === undefined) throw new Error('expected Backspace to be consumed')
          } else if (key.length === 1) {
            expected += key
            if (result === undefined) throw new Error('expected a character key to be consumed')
          } else {
            expect(result).toBeUndefined()
            expect(session.typed).toBe(typedBefore)
            continue
          }
          expect(session.typed).toBe(expected)
          const replaced = Math.min(expected.length, baseline.length - position)
          expect(result?.workingText).toBe(baseline.slice(0, position) + expected + baseline.slice(position + replaced))
          expect(result?.cursor).toBe(position + expected.length)
        }

        const commit = resolveReplaceCommit(session)
        if (expected === '') {
          expect(commit).toBeUndefined()
          return
        }
        const replaced = Math.min(expected.length, baseline.length - position)
        expect(commit?.finalText).toBe(baseline.slice(0, position) + expected + baseline.slice(position + replaced))
        expect(commit?.rawCursor).toBe(position + expected.length)
      },
    ),
  )
})

it('replaces a selected range once, overwrites its suffix, and restores the baseline after Backspace', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.nat(1000),
      fc.nat(1000),
      fc.array(replaceKey, { maxLength: 30 }),
      (baseline, startSeed, endSeed, keys) => {
        const position = startSeed % (baseline.length + 1)
        const selectionEnd = position + (endSeed % (baseline.length - position + 1))
        const session = { nodeId: 'a', baseline, position, selectionEnd, typed: '' }
        let typed = ''
        for (const key of keys) {
          if (key === 'Backspace') typed = typed.slice(0, -1)
          else if (key.length === 1) typed += key
          const result = applyReplaceKey(session, key)
          if (key !== 'Backspace' && key.length !== 1) {
            expect(result).toBeUndefined()
            continue
          }
          const end =
            typed === '' ? position : Math.min(baseline.length, Math.max(position + 1, selectionEnd) + typed.length - 1)
          const expected = baseline.slice(0, position) + typed + baseline.slice(end)
          expect(result).toEqual({ workingText: expected, cursor: position + typed.length })
          expect(resolveReplaceCommit(session)).toEqual(
            typed === ''
              ? undefined
              : {
                  finalText: expected,
                  replacedStart: position,
                  replacedEnd: end,
                  rawCursor: position + typed.length,
                },
          )
        }
        while (session.typed !== '') applyReplaceKey(session, 'Backspace')
        expect(applyReplaceKey(session, 'Backspace')).toEqual({ workingText: baseline, cursor: position })
        expect(resolveReplaceCommit(session)).toBeUndefined()
      },
    ),
  )
})
