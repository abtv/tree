import { describe, expect, it, vi } from 'vitest'
import type { ReadySnapshot } from '../application/editor-runtime-state'
import type { EditorSnapshot } from '../application/editor-store-types'
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

function readySnapshot(
  document: Document,
  selectedNodeId: string,
  currentParentId: string | null,
  focus: { cursor: number; token: number } = { cursor: 0, token: 0 },
): ReadySnapshot {
  return {
    status: 'ready',
    document,
    location: { currentParentId, selectedNodeId },
    focus: { nodeId: selectedNodeId, ...focus },
    structuralVersion: 0,
    expansion: COLLAPSED_EXPANSION_STATE,
  }
}

/** A store whose `moveSelection` outcome is scripted, for results the real store never produces. */
function scriptedStore(
  initial: EditorSnapshot,
  rows: readonly TreeNode[],
  onMove: (direction: 'up' | 'down', cursor: number, current: EditorSnapshot) => EditorSnapshot,
) {
  let snapshot = initial
  return {
    getSnapshot: () => snapshot,
    getVisibleRows: () => rows.map((row) => ({ node: row })),
    moveSelection: vi.fn((direction: 'up' | 'down', cursor: number) => {
      snapshot = onMove(direction, cursor, snapshot)
    }),
  }
}

const IMAGE = { id: 'image', mimeType: 'image/png' as const }

describe('Vim vertical navigation', () => {
  it('does nothing while the store is not ready', () => {
    const applyCaretState = vi.fn()
    const navigationStore = scriptedStore({ status: 'loading' }, [], (_direction, _cursor, current) => current)

    navigateVertically({
      store: navigationStore,
      node: node('a', 'abc'),
      caret: { cursor: 1, imageActive: false },
      direction: 'down',
      count: 2,
      applyCaretState,
    })

    expect(navigationStore.moveSelection).not.toHaveBeenCalled()
    expect(applyCaretState).not.toHaveBeenCalled()
  })

  it('applies a boundary caret once however large the count is', () => {
    const current = node('current', 'abc')
    const navigationStore = store({ roots: [current] }, current.id, null)
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: current,
      caret: { cursor: 2, imageActive: false },
      direction: 'down',
      count: 3,
      applyCaretState,
    })

    expect(applyCaretState).toHaveBeenCalledTimes(1)
    expect(applyCaretState).toHaveBeenCalledWith('current', { cursor: 2, imageActive: false })
  })

  it('moves down from a selected heading only when it has visible rows', () => {
    const withChild = node('parent', 'heading', [node('child', 'child')])
    const childStore = store({ roots: [withChild] }, withChild.id, withChild.id)
    const moveWithChild = vi.spyOn(childStore, 'moveSelection')
    navigateVertically({
      store: childStore,
      node: withChild,
      caret: { cursor: 3, imageActive: false },
      direction: 'down',
      count: 1,
      applyCaretState: vi.fn(),
    })
    expect(moveWithChild).toHaveBeenCalledWith('down', 3)

    const childless = node('parent', 'heading')
    const emptyStore = store({ roots: [childless] }, childless.id, childless.id)
    const moveEmpty = vi.spyOn(emptyStore, 'moveSelection')
    navigateVertically({
      store: emptyStore,
      node: childless,
      caret: { cursor: 3, imageActive: false },
      direction: 'down',
      count: 1,
      applyCaretState: vi.fn(),
    })
    expect(moveEmpty).not.toHaveBeenCalled()
  })

  it('moves up from a selected heading even when it has no visible rows', () => {
    const childless = node('parent', 'heading')
    const navigationStore = store({ roots: [childless] }, childless.id, childless.id)
    const moveSelection = vi.spyOn(navigationStore, 'moveSelection')

    navigateVertically({
      store: navigationStore,
      node: childless,
      caret: { cursor: 2, imageActive: false },
      direction: 'up',
      count: 1,
      applyCaretState: vi.fn(),
    })

    expect(moveSelection).toHaveBeenCalledWith('up', 2)
  })

  it('crosses from a selection that is not among the visible rows', () => {
    const first = node('first', 'abc')
    const navigationStore = store({ roots: [first] }, 'missing', null)
    const moveSelection = vi.spyOn(navigationStore, 'moveSelection')

    navigateVertically({
      store: navigationStore,
      node: node('missing', 'abc'),
      caret: { cursor: 1, imageActive: false },
      direction: 'up',
      count: 1,
      applyCaretState: vi.fn(),
    })

    expect(moveSelection).toHaveBeenCalledWith('up', 1)
  })

  it('carries the starting caret column through every counted step', () => {
    const roots = [node('a', 'abcdef'), node('b', 'ghijkl'), node('c', 'mnopqr')]
    const navigationStore = store({ roots }, 'a', null)
    const moveSelection = vi.spyOn(navigationStore, 'moveSelection')

    navigateVertically({
      store: navigationStore,
      node: roots[0] as TreeNode,
      caret: { cursor: 3, imageActive: false },
      direction: 'down',
      count: 2,
      applyCaretState: vi.fn(),
    })

    expect(moveSelection.mock.calls).toEqual([
      ['down', 3],
      ['down', 3],
    ])
  })

  it('restarts the column at zero after the first step down from an image', () => {
    const roots = [{ ...node('a', 'abcd'), attachment: IMAGE }, node('b', 'ghijkl'), node('c', 'mnopqr')]
    const navigationStore = store({ roots }, 'a', null)
    const moveSelection = vi.spyOn(navigationStore, 'moveSelection')

    navigateVertically({
      store: navigationStore,
      node: roots[0] as TreeNode,
      caret: { cursor: 4, imageActive: true, imageTextReturnCursor: 1 },
      direction: 'down',
      count: 2,
      applyCaretState: vi.fn(),
    })

    expect(moveSelection.mock.calls).toEqual([
      ['down', 0],
      ['down', 0],
    ])
  })

  it('keeps the starting column when a later step passes through an image-only node', () => {
    const roots = [
      node('a', 'abcdef'),
      { ...node('b', ''), attachment: IMAGE },
      node('c', 'ghijkl'),
      node('d', 'mnopqr'),
    ]
    const navigationStore = store({ roots }, 'a', null)
    const moveSelection = vi.spyOn(navigationStore, 'moveSelection')

    navigateVertically({
      store: navigationStore,
      node: roots[0] as TreeNode,
      caret: { cursor: 2, imageActive: false },
      direction: 'down',
      count: 3,
      applyCaretState: vi.fn(),
    })

    expect(moveSelection.mock.calls).toEqual([
      ['down', 2],
      ['down', 2],
      ['down', 2],
    ])
  })

  it('stops with the unchanged caret when the store keeps the same focus token', () => {
    const roots = [node('a', 'abcdef'), node('b', 'ghijkl')]
    const navigationStore = store({ roots }, 'a', null)
    const moveSelection = vi.spyOn(navigationStore, 'moveSelection').mockImplementation(() => {})
    const applyCaretState = vi.fn()
    const caret = { cursor: 1, imageActive: false }

    navigateVertically({
      store: navigationStore,
      node: roots[0] as TreeNode,
      caret,
      direction: 'down',
      count: 2,
      applyCaretState,
    })

    expect(moveSelection).toHaveBeenCalledTimes(1)
    expect(applyCaretState).toHaveBeenCalledTimes(1)
    expect(applyCaretState).toHaveBeenCalledWith('a', caret)
  })

  it('stops without applying a caret when the store stops being ready', () => {
    const roots = [node('a', 'abc'), node('b', 'abc')]
    const navigationStore = scriptedStore(readySnapshot({ roots }, 'a', null), roots, () => ({ status: 'loading' }))
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: roots[0] as TreeNode,
      caret: { cursor: 1, imageActive: false },
      direction: 'down',
      count: 2,
      applyCaretState,
    })

    expect(navigationStore.moveSelection).toHaveBeenCalledTimes(1)
    expect(applyCaretState).not.toHaveBeenCalled()
  })

  it('treats a new focus token on the same node as a new focus, not a no-op', () => {
    const parent = node('p', 'parent', [{ ...node('a', 'abcd'), attachment: IMAGE }])
    const document = { roots: [parent] }
    const navigationStore = scriptedStore(
      readySnapshot(document, 'a', 'p', { cursor: 0, token: 0 }),
      parent.children,
      (_direction, _cursor, current) =>
        current.status === 'ready' ? { ...current, focus: { nodeId: 'a', cursor: 1, token: 1 } } : current,
    )
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: parent.children[0] as TreeNode,
      caret: { cursor: 1, imageActive: false },
      direction: 'up',
      count: 1,
      applyCaretState,
    })

    expect(applyCaretState).toHaveBeenCalledTimes(1)
    expect(applyCaretState).toHaveBeenCalledWith('a', { cursor: 1, imageActive: false }, true)
  })

  it('places the caret at the cursor the store focused rather than the requested one', () => {
    const roots = [node('a', 'abcdefgh'), node('b', 'ghijklmn')]
    const document = { roots }
    const navigationStore = scriptedStore(readySnapshot(document, 'a', null), roots, (_direction, _cursor, current) =>
      current.status === 'ready'
        ? {
            ...current,
            location: { ...current.location, selectedNodeId: 'b' },
            focus: { nodeId: 'b', cursor: 2, token: 1 },
          }
        : current,
    )
    const applyCaretState = vi.fn()

    navigateVertically({
      store: navigationStore,
      node: roots[0] as TreeNode,
      caret: { cursor: 5, imageActive: false },
      direction: 'down',
      count: 1,
      applyCaretState,
    })

    expect(navigationStore.moveSelection).toHaveBeenCalledWith('down', 5)
    expect(applyCaretState).toHaveBeenLastCalledWith('b', { cursor: 2, imageActive: false }, true)
  })

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
