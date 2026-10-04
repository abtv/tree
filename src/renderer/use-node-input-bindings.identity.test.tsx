// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import { useNodeInputBindings } from './use-node-input-bindings'

type Options = Parameters<typeof useNodeInputBindings>[0]

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function fixture() {
  const { store, snapshot } = await createRealStoreHarness({
    document: {
      roots: [
        { id: 'first', text: 'first node', children: [] },
        { id: 'second', text: 'second node', children: [] },
      ],
    },
  })
  // Supply every optional callback once, as App does. Omitted callbacks have fresh default
  // functions on each render and would obscure the dependency identities under test.
  const options: Options = {
    store,
    selectedNodeId: snapshot().location.selectedNodeId,
    focus: snapshot().focus,
    persistenceLocked: false,
    vimEnabled: true,
    vimMode: 'normal',
    setVimMode: vi.fn(),
    setImageCaretNodeId: vi.fn(),
    setNodeVisualSelection: vi.fn(),
    nodeVisualSelection: undefined,
    onPreviewAttachment: vi.fn(),
    onFoldCommand: vi.fn(),
  }
  return { options, ...renderHook((props: Options) => useNodeInputBindings(props), { initialProps: options }) }
}

function expectStableControls(before: ReturnType<typeof useNodeInputBindings>, after: typeof before) {
  expect(after.dragFreeze).toBe(before.dragFreeze)
  expect(after.dragFreeze.begin).toBe(before.dragFreeze.begin)
  expect(after.dragFreeze.end).toBe(before.dragFreeze.end)
  expect(after.setVimEditing).toBe(before.setVimEditing)
}

describe('input bindings callback identity', () => {
  it('keeps bindings and controls stable when only the focus token and cursor change', async () => {
    const f = await fixture()
    const before = f.result.current
    const focus = f.options.focus!

    f.rerender({ ...f.options, focus: { ...focus, token: focus.token + 1, cursor: focus.cursor + 1 } })

    expect(f.result.current.bindings).toBe(before.bindings)
    expectStableControls(before, f.result.current)
  })

  const changes: { name: keyof Options; patch: Partial<Options> }[] = [
    { name: 'vimMode', patch: { vimMode: 'insert' } },
    { name: 'vimEnabled', patch: { vimEnabled: false } },
    { name: 'selectedNodeId', patch: { selectedNodeId: 'second' } },
    { name: 'persistenceLocked', patch: { persistenceLocked: true } },
    { name: 'nodeVisualSelection', patch: { nodeVisualSelection: { anchorId: 'first', focusId: 'second' } } },
    { name: 'onPreviewAttachment', patch: { onPreviewAttachment: () => undefined } },
    { name: 'onFoldCommand', patch: { onFoldCommand: () => undefined } },
  ]

  it.each(changes)('changes bindings but keeps controls stable when only $name changes', async ({ name, patch }) => {
    const f = await fixture()
    const before = f.result.current
    expect(Object.keys(patch)).toEqual([name])
    expect(patch[name]).not.toBe(f.options[name])

    f.rerender({ ...f.options, ...patch })

    expect(f.result.current.bindings).not.toBe(before.bindings)
    expectStableControls(before, f.result.current)
  })
})
