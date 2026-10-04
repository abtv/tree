// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react'
import { useState, useSyncExternalStore } from 'react'
import fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { createRealStoreHarness } from './test/real-store-harness'
import { useNodeInputBindings } from './use-node-input-bindings'
import type { VimMode } from './vim-editing'
import type { TreeNode } from '../domain/document'

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
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
  const press = (key: string) => {
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
  const count = (value: number) => {
    for (const digit of String(value)) press(digit)
  }
  return {
    ...real,
    press,
    count,
    dispose: () => {
      hook.unmount()
      input.remove()
    },
  }
}

const nodes = (size: number): TreeNode[] =>
  Array.from({ length: size }, (_, index) => ({
    id: `n${index}`,
    text: `text${index}`,
    children: [{ id: `child${index}`, text: 'folded', children: [] }],
  }))

describe('structural dot replay invariants', () => {
  it('joins only complete original spans, retains every child identity, and undoes each iteration', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 30 }),
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 12 }),
        fc.boolean(),
        async (size, requestedSpan, repetitions, spaced) => {
          const initial = nodes(size)
          const f = await harness(initial)
          try {
            const span = Math.min(size, requestedSpan)
            f.count(requestedSpan)
            if (!spaced) f.press('g')
            f.press('J')
            f.press('u')
            const completed = Math.min(repetitions, Math.floor((size - 1) / (span - 1)))
            f.count(repetitions)
            f.press('.')
            const joined = 1 + completed * (span - 1)
            const result = f.snapshot().document.roots
            expect(result).toHaveLength(size - completed * (span - 1))
            expect(result[0]!.id).toBe('n0')
            expect(result[0]!.children.map((child) => child.id)).toEqual(
              initial.slice(0, joined).map((item) => item.children[0]!.id),
            )
            expect(result[0]!.text).toBe(
              initial
                .slice(0, joined)
                .map((item) => item.text)
                .join(spaced ? ' ' : ''),
            )
            expect(result.slice(1)).toEqual(initial.slice(joined))
            for (let index = 0; index < completed; index += 1) f.press('u')
            expect(f.snapshot().document.roots).toEqual(initial)
            for (let index = 0; index < completed; index += 1) act(() => f.store.redo())
            expect(f.snapshot().document.roots).toEqual(result)
          } finally {
            f.dispose()
          }
        },
      ),
      { numRuns: propertyRuns(40) },
    )
  })

  it('counted puts capture the original forest and allocate unique identities across replay and history', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 6 }),
        fc.boolean(),
        async (copies, repetitions, past) => {
          const initial = nodes(2)
          const f = await harness(initial)
          try {
            f.press('y')
            f.press('y')
            act(() => f.store.selectNode('n1', 0))
            f.count(copies)
            if (past) f.press('g')
            // `P`: every generated node has children, and `p` on such a node puts into them.
            f.press('P')
            f.press('u')
            f.press('y')
            f.press('y')
            f.count(repetitions)
            f.press('.')
            const result = f.snapshot().document.roots
            expect(result).toHaveLength(2 + copies * repetitions)
            const ids = result.flatMap((item) => [item.id, ...item.children.map((child) => child.id)])
            expect(new Set(ids).size).toBe(ids.length)
            const inserted = result.filter((item) => item.id !== 'n0' && item.id !== 'n1')
            expect(inserted.every((item) => item.text === 'text0' && item.children[0]?.text === 'folded')).toBe(true)
            for (let index = 0; index < repetitions; index += 1) f.press('u')
            expect(f.snapshot().document.roots).toEqual(initial)
            for (let index = 0; index < repetitions; index += 1) act(() => f.store.redo())
            expect(f.snapshot().document.roots).toEqual(result)
          } finally {
            f.dispose()
          }
        },
      ),
      { numRuns: propertyRuns(40) },
    )
  })
})
