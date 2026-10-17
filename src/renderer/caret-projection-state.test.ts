import { describe, expect, it } from 'vitest'
import { CaretProjectionState } from './caret-projection-state'

const focus = { nodeId: 'first', cursor: 2, token: 1 }
const caret = { cursor: 3, imageActive: true, imageTextReturnCursor: 1 }

describe('caret projection ownership', () => {
  it('starts from focus without claiming a node-specific image destination', () => {
    const owner = new CaretProjectionState<string>(focus, 'normal')
    expect(owner.authority).toEqual({ caret: { cursor: 2, imageActive: false } })
    expect(owner.mode).toBe('normal')
    expect(owner.syncedFocusToken).toBe(1)
    expect(owner.pendingCaret).toBeUndefined()
    const empty = new CaretProjectionState(undefined, 'insert')
    expect(empty.authority.caret.cursor).toBe(0)
    expect(empty.focusToken).toBeUndefined()
    expect(empty.captureFocusWork()).toEqual({ token: undefined, revision: 0 })
  })

  it('projects focus and mode only when their committed inputs change', () => {
    const owner = new CaretProjectionState(focus, 'normal')
    expect(owner.beginCommit(focus, 'normal')).toEqual({ focusChanged: true, modeChanged: true })
    expect(owner.beginCommit(focus, 'normal')).toEqual({ focusChanged: false, modeChanged: false })
    owner.changeMode('insert')
    expect(owner.beginCommit(focus, 'insert')).toEqual({ focusChanged: false, modeChanged: true })
    const sameNode = { ...focus, cursor: 4, token: 2 }
    expect(owner.beginCommit(sameNode, 'insert')).toEqual({ focusChanged: true, modeChanged: true })
    expect(owner.focusToken).toBe(2)
    expect(owner.beginCommit(undefined, 'insert')).toEqual({ focusChanged: true, modeChanged: true })
  })

  it('keeps command caret authority until an explicit placement replaces it', () => {
    const owner = new CaretProjectionState(focus, 'normal')
    owner.placeCaret('first', caret, { focusToken: 7, fromFocus: true, defer: false })
    expect(owner.authority).toEqual({ nodeId: 'first', caret })
    expect(owner.syncedFocusToken).toBe(7)
    expect(owner.takeCaret()).toBeUndefined()
    owner.beginCommit({ ...focus, token: 7 }, 'normal')
    expect(owner.authority.caret).toBe(caret)
    owner.consumeFocus(8)
    owner.placeCaret('second', { cursor: 0, imageActive: false }, { focusToken: 9, fromFocus: false, defer: false })
    expect(owner.syncedFocusToken).toBe(8)
    expect(owner.authority.nodeId).toBe('second')
  })

  it('keeps an event-time mode change through an unrelated commit with the previous rendered mode', () => {
    const owner = new CaretProjectionState(focus, 'normal')
    owner.beginCommit(focus, 'normal')
    owner.changeMode('insert')
    expect(owner.beginCommit(focus, 'normal')).toEqual({ focusChanged: false, modeChanged: false })
    expect(owner.mode).toBe('insert')
    expect(owner.beginCommit(focus, 'insert')).toEqual({ focusChanged: false, modeChanged: true })
    expect(owner.mode).toBe('insert')
  })

  it('retains only the newest placement, including the scheduled element and focus token', () => {
    const owner = new CaretProjectionState<string>(focus, 'insert')
    owner.requestCaret({ nodeId: 'first', cursor: 1 }, 1)
    owner.requestCaret({ nodeId: 'second', cursor: 4, input: 'replacement', refocus: true }, 2)
    expect(owner.pendingCaret).toEqual({
      nodeId: 'second',
      cursor: 4,
      input: 'replacement',
      refocus: true,
      normal: false,
      revision: 2,
      focusToken: 2,
    })
    expect(owner.takeCaret()?.cursor).toBe(4)
    expect(owner.takeCaret()).toBeUndefined()
    owner.requestCaret({ nodeId: 'first', cursor: 1 }, undefined)
    expect(owner.pendingCaret?.focusToken).toBeUndefined()
    owner.invalidateCaret()
    expect(owner.pendingCaret).toBeUndefined()
  })

  it('defers Normal placement after an edit and invalidates it when insertion replaces Normal', () => {
    const owner = new CaretProjectionState(focus, 'normal')
    owner.placeCaret('first', caret, { focusToken: 1, fromFocus: false, defer: true })
    expect(owner.pendingCaret).toEqual({ nodeId: 'first', cursor: 3, normal: true, revision: 1, focusToken: 1 })
    owner.changeMode('insert')
    expect(owner.pendingCaret).toBeUndefined()
    expect(owner.authority.caret).toBe(caret)
  })

  it('keeps a change command insertion through a compatible mode switch without reviving old focus work', () => {
    const owner = new CaretProjectionState(focus, 'normal')
    const work = owner.captureFocusWork()
    owner.requestCaret({ nodeId: 'first', cursor: 4, refocus: true }, 1)
    owner.changeMode('insert')
    expect(owner.pendingCaret).toMatchObject({ cursor: 4, normal: false, refocus: true, revision: 2 })
    expect(owner.isCurrentFocusWork(work)).toBe(false)
    const pending = owner.pendingCaret
    const current = owner.captureFocusWork()
    owner.changeMode('insert')
    expect(owner.pendingCaret).toBe(pending)
    expect(owner.isCurrentFocusWork(current)).toBe(true)
  })

  it('lets Visual restoration supersede focus and earlier caret work exactly once', () => {
    const owner = new CaretProjectionState(focus, 'visual')
    owner.requestCaret({ nodeId: 'first', cursor: 0 }, 1)
    const pending = owner.pendingCaret!
    const work = owner.captureFocusWork()
    const selection = { nodeId: 'first', start: 1, end: 4, endpoints: { anchor: 3, focus: 1, hadText: true } }
    owner.requestVisual(selection)
    expect(owner.takeVisual()).toBe(selection)
    expect(owner.isCurrentFocusWork(work)).toBe(false)
    expect(pending.revision).not.toBe(owner.currentRevision)
    const current = owner.captureFocusWork()
    expect(owner.takeVisual()).toBeUndefined()
    expect(owner.isCurrentFocusWork(current)).toBe(true)
  })

  it('restores a released drag as authority and consumes its new focus token', () => {
    const owner = new CaretProjectionState(focus, 'normal')
    owner.requestCaret({ nodeId: 'first', cursor: 3, restoredCaret: caret, refocus: true }, 4)
    const pending = owner.takeCaret()!
    const work = owner.captureFocusWork()
    owner.restoreDrag(pending.nodeId, pending.restoredCaret!, pending.focusToken)
    expect(owner.authority).toEqual({ nodeId: 'first', caret })
    expect(owner.syncedFocusToken).toBe(4)
    expect(owner.isCurrentFocusWork(work)).toBe(false)
    expect(owner.pendingCaret).toBeUndefined()
  })

  it('rejects work from an earlier focus even when no command has advanced the revision', () => {
    const owner = new CaretProjectionState(focus, 'normal')
    const work = owner.captureFocusWork()
    owner.beginCommit({ ...focus, token: 2 }, 'normal')
    expect(owner.isCurrentFocusWork(work)).toBe(false)
    const current = owner.captureFocusWork()
    owner.beginCommit(undefined, 'normal')
    expect(owner.isCurrentFocusWork(current)).toBe(false)
  })
})
