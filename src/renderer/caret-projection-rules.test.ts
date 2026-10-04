// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { currentPendingCaretInput, normalCaretIsDrawn, pendingCaretAfterModeChange } from './caret-projection-rules'
import type { PendingCaret } from './node-input-types'
import type { VimMode } from './vim-editing'
import { createRealStoreHarness } from './test/real-store-harness'

afterEach(() => document.body.replaceChildren())

const pending: PendingCaret = { nodeId: 'first', cursor: 2, normal: true, revision: 3, focusToken: 1 }

describe('pending caret mode compatibility', () => {
  it.each<VimMode>(['normal', 'insert', 'replace', 'visual', 'visual-node'])('ignores absent work in %s', (mode) => {
    expect(pendingCaretAfterModeChange(undefined, mode, 4)).toBeUndefined()
  })

  it.each<VimMode>(['normal', 'insert', 'replace', 'visual', 'visual-node'])(
    'retains only projections compatible with %s and advances their revision',
    (mode) => {
      for (const normal of [true, false]) {
        const request = { ...pending, normal, refocus: true }
        const result = pendingCaretAfterModeChange(request, mode, 4)
        if (normal === (mode === 'normal')) {
          expect(result).toEqual({ ...request, revision: 4 })
          expect(result).not.toBe(request)
        } else expect(result).toBeUndefined()
        expect(request.revision).toBe(3)
      }
    },
  )
})

describe('drawn Normal caret', () => {
  it.each([
    { start: 1, end: 2, matches: true },
    { start: 0, end: 2, matches: false },
    { start: 1, end: 3, matches: false },
  ])('checks both block endpoints: $start,$end', ({ start, end, matches }) => {
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(start, end)
    expect(normalCaretIsDrawn(input, { kind: 'block', start: 1, end: 2 })).toBe(matches)
  })

  it.each([
    { start: 2, end: 2, matches: true },
    { start: 1, end: 2, matches: false },
    { start: 2, end: 3, matches: false },
  ])('checks both collapsed endpoints: $start,$end', ({ start, end, matches }) => {
    const input = document.createElement('textarea')
    input.value = 'abcd'
    input.setSelectionRange(start, end)
    expect(normalCaretIsDrawn(input, { kind: 'collapsed', position: 2 })).toBe(matches)
  })

  it('requires projection for a non-textarea input', () => {
    expect(normalCaretIsDrawn(document.createElement('div'), { kind: 'collapsed', position: 0 })).toBe(false)
  })
})

describe('pending caret currency', () => {
  async function fixture() {
    const harness = await createRealStoreHarness({
      document: { roots: [{ id: 'first', text: 'abcd', children: [] }] },
    })
    const state = harness.snapshot()
    const input = document.createElement('textarea')
    document.body.append(input)
    return { state, input, request: { ...pending, focusToken: state.focus.token } }
  }

  it('returns the current connected input with or without a recorded element', async () => {
    const { state, input, request } = await fixture()
    expect(currentPendingCaretInput(request, state, 3, input)).toBe(input)
    expect(currentPendingCaretInput({ ...request, input }, state, 3, input)).toBe(input)
  })

  it.each(['loading', 'error'] as const)('rejects a %s store', async (status) => {
    const { input, request } = await fixture()
    const state = status === 'loading' ? { status } : { status, message: 'unavailable' }
    expect(currentPendingCaretInput(request, state, 3, input)).toBeUndefined()
  })

  it('rejects a different selected node', async () => {
    const { state, input, request } = await fixture()
    expect(
      currentPendingCaretInput(
        request,
        { ...state, location: { ...state.location, selectedNodeId: 'other' } },
        3,
        input,
      ),
    ).toBeUndefined()
  })

  it('rejects a different focus token', async () => {
    const { state, input, request } = await fixture()
    expect(currentPendingCaretInput({ ...request, focusToken: state.focus.token + 1 }, state, 3, input)).toBeUndefined()
  })

  it('rejects a superseded revision', async () => {
    const { state, input, request } = await fixture()
    expect(currentPendingCaretInput(request, state, 4, input)).toBeUndefined()
  })

  it('rejects an unregistered input', async () => {
    const { state, request } = await fixture()
    expect(currentPendingCaretInput(request, state, 3, undefined)).toBeUndefined()
  })

  it('rejects a disconnected input', async () => {
    const { state, input, request } = await fixture()
    input.remove()
    expect(currentPendingCaretInput(request, state, 3, input)).toBeUndefined()
  })

  it('rejects a replaced recorded element', async () => {
    const { state, input, request } = await fixture()
    expect(
      currentPendingCaretInput({ ...request, input: document.createElement('textarea') }, state, 3, input),
    ).toBeUndefined()
  })
})
