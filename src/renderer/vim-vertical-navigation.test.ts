import { describe, expect, it, vi } from 'vitest'
import type { ReadySnapshot } from '../application/editor-runtime-state'
import { COLLAPSED_EXPANSION_STATE } from '../application/expansion-state'
import type { Document, TreeNode } from '../domain/document'
import { navigateVertically, type VimVerticalNavigationStore } from './vim-vertical-navigation'

function node(id: string, text: string, children: TreeNode[] = []): TreeNode {
  return { id, text, children }
}

function store(
  document: Document,
  selectedNodeId: string,
  currentParentId: string | null,
): VimVerticalNavigationStore & {
  snapshot: ReadySnapshot
} {
  let token = 0
  const state: { snapshot: ReadySnapshot } = {
    snapshot: {
      status: 'ready',
      document,
      location: { currentParentId, selectedNodeId },
      focus: { nodeId: selectedNodeId, cursor: 0, token },
      structuralVersion: 0,
      expansion: COLLAPSED_EXPANSION_STATE,
    },
  }
  return {
    get snapshot() {
      return state.snapshot
    },
    getSnapshot: () => state.snapshot,
    moveSelection: (direction, cursor) => {
      const siblings = currentParentId === null ? document.roots : (document.roots[0]?.children ?? [])
      const index = siblings.findIndex((candidate) => candidate.id === state.snapshot.location.selectedNodeId)
      const nextIndex = direction === 'down' ? Math.min(siblings.length - 1, index + 1) : Math.max(0, index - 1)
      const next = siblings[nextIndex]
      if (next === undefined || next.id === state.snapshot.location.selectedNodeId) return
      token += 1
      state.snapshot = {
        ...state.snapshot,
        location: { ...state.snapshot.location, selectedNodeId: next.id },
        focus: { nodeId: next.id, cursor, token },
      }
    },
  }
}

describe('Vim vertical navigation', () => {
  it('enters and exits an image without reading the store for a same-node step', () => {
    const current = {
      ...node('current', 'abcd', [node('child', 'child')]),
      attachment: { id: 'image', mimeType: 'image/png' as const },
    }
    const navigationStore = store({ roots: [current] }, current.id, null)
    const setCaret = vi.fn()
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: current,
      caret: { cursor: 1, imageActive: false },
      direction: 'down',
      count: 1,
      setCaret,
      applyCaretState,
    })

    expect(setCaret).toHaveBeenCalledWith(4)
    expect(applyCaretState).toHaveBeenLastCalledWith('current', {
      cursor: 4,
      imageActive: true,
      imageTextReturnCursor: 1,
    })
  })

  it('uses one displayed-sibling lookup per counted step and moves across siblings', () => {
    const first = node('first', 'a')
    const second = node('second', 'abcdef')
    const navigationStore = store({ roots: [first, second] }, first.id, null)
    const getSnapshot = vi.spyOn(navigationStore, 'getSnapshot')
    const setCaret = vi.fn()
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: first,
      caret: { cursor: 0, imageActive: false },
      direction: 'down',
      count: 2,
      setCaret,
      applyCaretState,
    })

    expect(getSnapshot).toHaveBeenCalledTimes(3)
    expect(navigationStore.snapshot.status).toBe('ready')
    if (navigationStore.snapshot.status === 'ready')
      expect(navigationStore.snapshot.location.selectedNodeId).toBe('second')
    expect(applyCaretState).toHaveBeenLastCalledWith('second', {
      cursor: 0,
      imageActive: false,
      imageTextReturnCursor: undefined,
    })
  })

  it('keeps a boundary caret when the store cannot move selection', () => {
    const current = node('current', 'abc')
    const navigationStore = store({ roots: [current] }, current.id, null)
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: current,
      caret: { cursor: 2, imageActive: false },
      direction: 'down',
      count: 1,
      setCaret: vi.fn(),
      applyCaretState,
    })

    expect(applyCaretState).toHaveBeenCalledWith('current', { cursor: 2, imageActive: false })
  })
})
