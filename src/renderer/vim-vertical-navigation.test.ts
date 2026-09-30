import { describe, expect, it, vi } from 'vitest'
import type { ReadySnapshot } from '../application/editor-runtime-state'
import { displayedNodes, type Document, type TreeNode } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE } from '../application/expansion-state'
import { buildVisibleRows } from '../application/visible-rows'
import { navigateVertically, type VimVerticalNavigationStore } from './vim-vertical-navigation'

function node(id: string, text: string, children: TreeNode[] = []): TreeNode {
  return { id, text, children }
}

function store(
  document: Document,
  selectedNodeId: string,
  currentParentId: string | null,
  expandedIds: readonly string[] = [],
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
      expansion: expandedIds.length === 0 ? COLLAPSED_EXPANSION_STATE : { expandedIds: new Set(expandedIds) },
    },
  }
  return {
    get snapshot() {
      return state.snapshot
    },
    getSnapshot: () => state.snapshot,
    getVisibleRows: () =>
      buildVisibleRows(
        displayedNodes(document, currentParentId),
        (id) => state.snapshot.status === 'ready' && state.snapshot.expansion.expandedIds.has(id),
      ),
    moveSelection: (direction, cursor) => {
      const rows = buildVisibleRows(
        displayedNodes(document, currentParentId),
        (id) => state.snapshot.status === 'ready' && state.snapshot.expansion.expandedIds.has(id),
      )
      const index = rows.findIndex((row) => row.node.id === state.snapshot.location.selectedNodeId)
      const next = rows[direction === 'down' ? Math.min(rows.length - 1, index + 1) : Math.max(0, index - 1)]?.node
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
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: current,
      caret: { cursor: 1, imageActive: false },
      direction: 'down',
      count: 1,
      applyCaretState,
    })

    expect(applyCaretState).toHaveBeenLastCalledWith('current', {
      cursor: 4,
      imageActive: true,
      imageTextReturnCursor: 1,
    })
  })

  it('uses the visible-row order for each counted step across expanded branches', () => {
    const first = node('first', 'a', [node('first-child', 'child')])
    const second = node('second', 'abcdef')
    const navigationStore = store({ roots: [first, second] }, first.id, null, ['first'])
    const getSnapshot = vi.spyOn(navigationStore, 'getSnapshot')
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: first,
      caret: { cursor: 0, imageActive: false },
      direction: 'down',
      count: 2,
      applyCaretState,
    })

    expect(getSnapshot).toHaveBeenCalledTimes(4)
    expect(navigationStore.snapshot.status).toBe('ready')
    if (navigationStore.snapshot.status === 'ready')
      expect(navigationStore.snapshot.location.selectedNodeId).toBe('second')
    expect(applyCaretState).toHaveBeenLastCalledWith(
      'second',
      {
        cursor: 0,
        imageActive: false,
        imageTextReturnCursor: undefined,
      },
      true,
    )
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
      applyCaretState,
    })

    expect(applyCaretState).toHaveBeenCalledWith('current', { cursor: 2, imageActive: false })
  })
})
