import { describe, expect, it } from 'vitest'
import type { NodeForest } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import {
  applyReplaceKey,
  beginInsertSession,
  beginReplaceSession,
  createVimEditSessionState,
  diffTypedText,
  insertRepeatChange,
  nodeRegister,
  registerSource,
  resolveReplaceCommit,
  takeInsertSession,
  takeReplaceSession,
  visualCommandRegister,
  type VimReplaceSession,
} from './vim-edit-session'
import type { VimRegister } from './vim-keyboard-types'

describe('diffTypedText', () => {
  it('reports no change when the final text matches the baseline', () => {
    expect(diffTypedText('abc', 'abc', 1)).toEqual({ insertedText: '', insertOffset: 2, deleteCount: 0 })
  })

  it('finds an insertion in the middle of the baseline', () => {
    expect(diffTypedText('ac', 'abc', 1)).toEqual({ insertedText: 'b', insertOffset: 0, deleteCount: 0 })
  })

  it('finds a deletion with no insertion', () => {
    expect(diffTypedText('abc', 'ac', 1)).toEqual({ insertedText: '', insertOffset: 0, deleteCount: 1 })
  })

  it('treats a full replacement as one insertion spanning the whole baseline', () => {
    expect(diffTypedText('abc', 'xyz', 0)).toEqual({ insertedText: 'xyz', insertOffset: 0, deleteCount: 3 })
  })

  it('never lets the matched suffix overlap the matched prefix', () => {
    expect(diffTypedText('aa', 'aaa', 1)).toEqual({ insertedText: 'a', insertOffset: 1, deleteCount: 0 })
    expect(diffTypedText('aaa', 'aa', 1)).toEqual({ insertedText: '', insertOffset: 1, deleteCount: 1 })
    expect(diffTypedText('abab', 'ababab', 2)).toEqual({ insertedText: 'ab', insertOffset: 2, deleteCount: 0 })
  })

  it('handles an empty baseline as a pure insertion', () => {
    expect(diffTypedText('', 'new', 0)).toEqual({ insertedText: 'new', insertOffset: 0, deleteCount: 0 })
  })

  it('handles typing that ends empty as a pure deletion', () => {
    expect(diffTypedText('abc', '', 0)).toEqual({ insertedText: '', insertOffset: 0, deleteCount: 3 })
  })
})

describe('resolveReplaceCommit', () => {
  it('returns undefined when nothing was typed', () => {
    expect(resolveReplaceCommit({ baseline: 'abc', position: 1, typed: '' })).toBeUndefined()
  })

  it('overwrites in place when typed text fits within the remaining baseline', () => {
    expect(resolveReplaceCommit({ baseline: 'abcd', position: 1, typed: 'X' })).toEqual({
      finalText: 'aXcd',
      replacedStart: 1,
      replacedEnd: 2,
      rawCursor: 2,
    })
  })

  it('appends past the end of the baseline once typed text exceeds it', () => {
    expect(resolveReplaceCommit({ baseline: 'ab', position: 1, typed: 'XYZ' })).toEqual({
      finalText: 'aXYZ',
      replacedStart: 1,
      replacedEnd: 2,
      rawCursor: 4,
    })
  })

  it('shrinks the replaced range after a Backspace during Replace', () => {
    const grown = resolveReplaceCommit({ baseline: 'ab', position: 1, typed: 'XY' })
    expect(grown).toEqual({ finalText: 'aXY', replacedStart: 1, replacedEnd: 2, rawCursor: 3 })
    expect(resolveReplaceCommit({ baseline: 'ab', position: 1, typed: 'X' })).toEqual({
      finalText: 'aX',
      replacedStart: 1,
      replacedEnd: 2,
      rawCursor: 2,
    })
  })
})

describe('VimEditSessionState', () => {
  it('starts with an empty register and no pending session', () => {
    const state = createVimEditSessionState()
    expect(state.register).toEqual({ kind: 'empty' })
    expect(state.insert).toBeUndefined()
    expect(state.replace).toBeUndefined()
  })

  it('takes a pending Insert session exactly once and leaves the other slots untouched', () => {
    const state = createVimEditSessionState()
    const register: VimRegister = { kind: 'text', value: 'kept' }
    state.register = register
    const session = {
      nodeId: 'a',
      baseline: 'abc',
      position: 1,
      change: { kind: 'insert', entry: 'i' } as const,
    }
    beginInsertSession(state, session)
    expect(takeInsertSession(state)).toBe(session)
    expect(takeInsertSession(state)).toBeUndefined()
    expect(state.register).toBe(register)
    expect(state.replace).toBeUndefined()
  })

  it('starts a Replace session with no typed text and takes it exactly once', () => {
    const state = createVimEditSessionState()
    beginReplaceSession(state, { nodeId: 'a', baseline: 'abc', position: 2 })
    expect(state.replace).toEqual({ nodeId: 'a', baseline: 'abc', position: 2, typed: '' })
    const taken = takeReplaceSession(state)
    expect(taken).toEqual({ nodeId: 'a', baseline: 'abc', position: 2, typed: '' })
    expect(takeReplaceSession(state)).toBeUndefined()
  })

  it('replaces a prior session of the same kind rather than accumulating one', () => {
    const state = createVimEditSessionState()
    beginInsertSession(state, { nodeId: 'a', baseline: 'a', position: 0, change: { kind: 'insert', entry: 'i' } })
    beginInsertSession(state, { nodeId: 'b', baseline: 'b', position: 0, change: { kind: 'insert', entry: 'a' } })
    beginReplaceSession(state, { nodeId: 'a', baseline: 'a', position: 0 })
    beginReplaceSession(state, { nodeId: 'b', baseline: 'b', position: 1 })
    expect(takeInsertSession(state)?.nodeId).toBe('b')
    expect(takeReplaceSession(state)?.nodeId).toBe('b')
    expect(takeInsertSession(state)).toBeUndefined()
    expect(takeReplaceSession(state)).toBeUndefined()
  })
})

describe('applyReplaceKey', () => {
  function session(overrides: Partial<VimReplaceSession> = {}): VimReplaceSession {
    return { nodeId: 'a', baseline: 'abcd', position: 1, typed: '', ...overrides }
  }

  it('returns undefined when there is no pending session', () => {
    expect(applyReplaceKey(undefined, 'X')).toBeUndefined()
  })

  it('consumes Backspace on empty typed text without changing the baseline', () => {
    expect(applyReplaceKey(session(), 'Backspace')).toEqual({ workingText: 'abcd', cursor: 1 })
  })

  it('overwrites in place and appends past the end of the baseline', () => {
    const target = session()
    expect(applyReplaceKey(target, 'X')).toEqual({ workingText: 'aXcd', cursor: 2 })
    expect(applyReplaceKey(target, 'Y')).toEqual({ workingText: 'aXYd', cursor: 3 })
    expect(applyReplaceKey(target, 'Z')).toEqual({ workingText: 'aXYZ', cursor: 4 })
    expect(target.typed).toBe('XYZ')
  })

  it('shrinks the working text again when Backspace removes a typed character', () => {
    const target = session({ typed: 'XY' })
    // The character the shorter typed text no longer overwrites reappears, matching a commit of
    // the shorter session (`baseline.slice(position + replaced)` is re-exposed).
    expect(applyReplaceKey(target, 'Backspace')).toEqual({ workingText: 'aXcd', cursor: 2 })
  })

  it('leaves a key it does not consume untouched', () => {
    const target = session({ typed: 'X' })
    expect(applyReplaceKey(target, 'Enter')).toBeUndefined()
    expect(applyReplaceKey(target, 'ArrowLeft')).toBeUndefined()
    expect(target.typed).toBe('X')
  })
})

describe('insertRepeatChange', () => {
  const session = { nodeId: 'a', baseline: 'abc', position: 1, change: { kind: 'insert', entry: 'i' } as const }

  it('captures a changed Insert session as a node-agnostic diff', () => {
    expect(insertRepeatChange(session, 'aXbc')).toEqual({
      kind: 'insert',
      entry: 'i',
      insertedText: 'X',
      insertOffset: 0,
      deleteCount: 0,
    })
  })

  it('skips an unchanged plain Insert session', () => {
    expect(insertRepeatChange(session, 'abc')).toBeUndefined()
  })

  it('still captures a zero-length diff for an unchanged change or substitute session', () => {
    expect(
      insertRepeatChange(
        { nodeId: 'a', baseline: 'abc', position: 1, change: { kind: 'change', motion: 'w', count: 1 } },
        'abc',
      ),
    ).toEqual({
      kind: 'change',
      motion: 'w',
      count: 1,
      insertedText: '',
      insertOffset: 2,
      deleteCount: 0,
    })
    expect(
      insertRepeatChange(
        { nodeId: 'a', baseline: 'abc', position: 1, change: { kind: 'substitute', count: 1 } },
        'abc',
      ),
    ).toEqual({
      kind: 'substitute',
      count: 1,
      insertedText: '',
      insertOffset: 2,
      deleteCount: 0,
    })
  })

  it('does not capture a session whose kind is not a text change', () => {
    expect(
      insertRepeatChange(
        { nodeId: 'a', baseline: 'abc', position: 1, change: { kind: 'delete', motion: 'w', count: 1 } },
        'a',
      ),
    ).toBeUndefined()
  })
})

describe('register transitions', () => {
  const node: TreeNode = { id: 'a', text: 'A', children: [] }
  const forest: NodeForest = { nodes: [node], sourceIds: ['a'] }

  it('passes a nodes register through as the put source', () => {
    expect(registerSource({ kind: 'nodes', value: forest })).toBe(forest)
  })

  it('wraps a node register and defaults missing source IDs', () => {
    expect(registerSource({ kind: 'node', value: node })).toEqual({ nodes: [node], sourceIds: [] })
    expect(registerSource({ kind: 'node', value: node, sourceIds: ['a', 'b'] })).toEqual({
      nodes: [node],
      sourceIds: ['a', 'b'],
    })
  })

  it('has no source for empty or text registers', () => {
    expect(registerSource({ kind: 'empty' })).toBeUndefined()
    expect(registerSource({ kind: 'text', value: 'x' })).toBeUndefined()
  })

  it('writes a nodes register for whole-node Visual y/d/x/c/s/p results only', () => {
    // `p` exchanges: the removed selection becomes the register.
    for (const command of ['y', 'd', 'x', 'c', 's', 'p'] as const) {
      expect(visualCommandRegister(command, forest)).toEqual({ kind: 'nodes', value: forest })
    }
    // `P` keeps the incoming register; case changes never touch it.
    for (const command of ['u', 'U', 'P'] as const) {
      expect(visualCommandRegister(command, forest)).toBeUndefined()
    }
  })

  it('snapshots a structurally deleted node and keeps its ID', () => {
    const register = nodeRegister(node)
    if (register.kind !== 'node') throw new Error('expected a node register')
    expect(register.sourceIds).toEqual(['a'])
    expect(register.value).toEqual(node)
    expect(register.value).not.toBe(node)
  })
})
