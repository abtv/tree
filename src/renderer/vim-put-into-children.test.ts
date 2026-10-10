// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { useState, useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import { useNodeInputBindings } from './use-node-input-bindings'
import type { VimMode } from './vim-editing'
import type { TreeNode } from '../domain/document'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

const parent = (): TreeNode => ({
  id: 'parent',
  text: 'parent',
  children: [
    { id: 'c1', text: 'one', children: [] },
    { id: 'c2', text: 'two', children: [] },
  ],
})

async function harness(roots: TreeNode[]) {
  const real = await createRealStoreHarness({
    document: { roots },
    clock: { setTimeout: () => 0, clearTimeout: () => undefined },
  })
  const hook = renderHook(() => {
    const state = useSyncExternalStore(real.store.subscribe, real.store.getSnapshot)
    const [vimMode, setVimMode] = useState<VimMode>('normal')
    const [nodeVisualSelection, setNodeVisualSelection] = useState<{ anchorId: string; focusId: string }>()
    return useNodeInputBindings({
      store: real.store,
      selectedNodeId: state.status === 'ready' ? state.location.selectedNodeId : undefined,
      focus: state.status === 'ready' ? state.focus : undefined,
      persistenceLocked: false,
      vimEnabled: true,
      vimMode,
      setVimMode,
      nodeVisualSelection,
      setNodeVisualSelection,
      setImageCaretNodeId: () => undefined,
      onPreviewAttachment: () => undefined,
      onFoldCommand: (command, id) => real.store.applyFold(command, id),
    })
  })
  const input = document.createElement('textarea')
  document.body.append(input)
  const press = (...keys: string[]) => {
    for (const key of keys) {
      const node = real.node()
      input.value = node.text
      input.setSelectionRange(0, 0)
      act(() =>
        hook.result.current.bindings(node).onKeyDown({
          currentTarget: input,
          key,
          metaKey: false,
          ctrlKey: false,
          altKey: false,
          preventDefault: () => undefined,
        } as never),
      )
    }
  }
  const select = (id: string) => act(() => real.store.selectNode(id, 0))
  const texts = (id: string) => {
    const state = real.store.getSnapshot()
    if (state.status !== 'ready') throw new Error('Editor did not load')
    const found = [...state.document.roots, ...state.document.roots.flatMap((root) => root.children)].find(
      (node) => node.id === id,
    )
    return found?.children.map((child) => child.text) ?? []
  }
  return { ...real, press, select, texts, dispose: () => (hook.unmount(), input.remove()) }
}

// @requirement PRODUCT.md §20.2.13
// @requirement PRODUCT.md §20.2.19
describe('p on a node with children, repeated with .', () => {
  it('puts a yanked sibling subtree as the first child and repeats the rule on the current node', async () => {
    const f = await harness([parent(), { id: 'other', text: 'other', children: [] }])
    try {
      f.select('other')
      f.press('y', 'y')
      f.select('parent')
      f.press('p')
      expect(f.texts('parent')).toEqual(['other', 'one', 'two'])
      f.select('parent')
      f.press('.')
      expect(f.texts('parent')).toEqual(['other', 'other', 'one', 'two'])
      // On a leaf the repeated put is the sibling-after put it records.
      f.select('c2')
      f.press('.')
      expect(f.texts('parent')).toEqual(['other', 'other', 'one', 'two', 'other'])
      f.press('u')
      expect(f.texts('parent')).toEqual(['other', 'other', 'one', 'two'])
    } finally {
      f.dispose()
    }
  })

  it('repeats a counted put as counted first children with fresh identities', async () => {
    const f = await harness([parent(), { id: 'other', text: 'other', children: [] }])
    try {
      f.select('other')
      f.press('y', 'y')
      f.select('parent')
      f.press('2', 'p')
      expect(f.texts('parent')).toEqual(['other', 'other', 'one', 'two'])
      f.select('parent')
      f.press('.')
      const state = f.store.getSnapshot()
      if (state.status !== 'ready') throw new Error('Editor did not load')
      const ids = state.document.roots[0]!.children.map((child) => child.id)
      expect(ids).toHaveLength(6)
      expect(new Set(ids).size).toBe(6)
    } finally {
      f.dispose()
    }
  })
})
