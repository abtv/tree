import { describe, expect, it } from 'vitest'
import { buildNodeIndex, toggleStarNode, type Document, type TreeNode } from '../domain/document'
import {
  COLLAPSED_EXPANSION_STATE,
  activateExpansionView,
  applyNodeFold,
  collapseActiveView,
  collapseForest,
  collapseNode,
  collapseSubtree,
  expandForest,
  expandNode,
  expansionFromIds,
  expansionFromViews,
  expandSubtree,
  governingViewOwner,
  isNodeExpanded,
  savedExpansionViews,
  toggleNodeExpansion,
  type ExpansionState,
} from './expansion-state'

function tree(id: string, children: TreeNode[] = []): TreeNode {
  return { id, text: id, children }
}

describe('expandNode', () => {
  it('adds the node id without mutating the previous state', () => {
    const before = COLLAPSED_EXPANSION_STATE

    const after = expandNode(before, 'a')

    expect(isNodeExpanded(before, 'a')).toBe(false)
    expect(isNodeExpanded(after, 'a')).toBe(true)
  })

  it('returns the same state instance when already expanded', () => {
    const state = expandNode(COLLAPSED_EXPANSION_STATE, 'a')

    expect(expandNode(state, 'a')).toBe(state)
  })
})

describe('collapseNode', () => {
  it('removes only the given node id', () => {
    const state = expandNode(expandNode(COLLAPSED_EXPANSION_STATE, 'a'), 'b')
    const collapsed = collapseNode(state, 'a')

    expect(isNodeExpanded(collapsed, 'a')).toBe(false)
    expect(isNodeExpanded(collapsed, 'b')).toBe(true)
  })

  it('returns the same state instance when already collapsed', () => {
    expect(collapseNode(COLLAPSED_EXPANSION_STATE, 'a')).toBe(COLLAPSED_EXPANSION_STATE)
  })

  // @requirement PRODUCT.md §2.4
  it('retains a descendant choice across a collapse/expand round trip', () => {
    // Collapsing an ancestor only removes the ancestor's own id: the child's choice is untouched, so
    // expanding the ancestor again immediately restores the nested expansion, per PRODUCT.md §2.4.
    let state = expandNode(COLLAPSED_EXPANSION_STATE, 'parent')
    state = expandNode(state, 'child')
    state = collapseNode(state, 'parent')

    expect(isNodeExpanded(state, 'child')).toBe(true)

    state = expandNode(state, 'parent')

    expect(isNodeExpanded(state, 'parent')).toBe(true)
    expect(isNodeExpanded(state, 'child')).toBe(true)
  })
})

describe('toggleNodeExpansion', () => {
  it('flips expanded to collapsed and back', () => {
    const expanded = toggleNodeExpansion(COLLAPSED_EXPANSION_STATE, 'a')

    expect(isNodeExpanded(expanded, 'a')).toBe(true)

    const collapsed = toggleNodeExpansion(expanded, 'a')

    expect(isNodeExpanded(collapsed, 'a')).toBe(false)
  })
})

describe('COLLAPSED_EXPANSION_STATE', () => {
  it('reports every node as collapsed, modeling a fresh visit to a location', () => {
    expect(isNodeExpanded(COLLAPSED_EXPANSION_STATE, 'anything')).toBe(false)
  })
})

describe('applyNodeFold', () => {
  const parent = tree('parent', [tree('child', [tree('grandchild')]), tree('sibling')])

  it('opens and closes only the node’s own level', () => {
    const closed = applyNodeFold(COLLAPSED_EXPANSION_STATE, 'open', parent)

    expect(isNodeExpanded(closed, 'parent')).toBe(true)
    expect(isNodeExpanded(closed, 'child')).toBe(false)

    const reopened = applyNodeFold(closed, 'close', parent)

    expect(isNodeExpanded(reopened, 'parent')).toBe(false)
  })

  it('toggles the node’s own level', () => {
    const opened = applyNodeFold(COLLAPSED_EXPANSION_STATE, 'toggle', parent)

    expect(isNodeExpanded(opened, 'parent')).toBe(true)
    expect(isNodeExpanded(applyNodeFold(opened, 'toggle', parent), 'parent')).toBe(false)
  })

  it('is a no-op for a leaf, which owns no fold', () => {
    const leaf = tree('leaf')

    for (const command of ['close', 'open', 'toggle', 'close-recursive', 'open-recursive'] as const) {
      expect(applyNodeFold(COLLAPSED_EXPANSION_STATE, command, leaf)).toBe(COLLAPSED_EXPANSION_STATE)
    }
  })

  it('closes recursively by clearing every nested choice', () => {
    let state = expandNode(COLLAPSED_EXPANSION_STATE, 'parent')
    state = expandNode(state, 'child')

    const closed = applyNodeFold(state, 'close-recursive', parent)

    expect(isNodeExpanded(closed, 'parent')).toBe(false)
    expect(isNodeExpanded(closed, 'child')).toBe(false)
  })

  it('opens recursively, including descendants not yet expanded', () => {
    const opened = applyNodeFold(COLLAPSED_EXPANSION_STATE, 'open-recursive', parent)

    expect(isNodeExpanded(opened, 'parent')).toBe(true)
    expect(isNodeExpanded(opened, 'child')).toBe(true)
  })
})

describe('expandSubtree and collapseSubtree', () => {
  const root = tree('root', [tree('child', [tree('grandchild')]), tree('leaf')])

  it('adds every node with children and returns the same state when all are already expanded', () => {
    const expanded = expandSubtree(COLLAPSED_EXPANSION_STATE, root)

    expect(isNodeExpanded(expanded, 'root')).toBe(true)
    expect(isNodeExpanded(expanded, 'child')).toBe(true)
    expect(isNodeExpanded(expanded, 'grandchild')).toBe(false)
    expect(isNodeExpanded(expanded, 'leaf')).toBe(false)
    expect(expandSubtree(expanded, root)).toBe(expanded)
  })

  it('removes the node and every descendant choice without touching an unrelated branch', () => {
    let state = COLLAPSED_EXPANSION_STATE
    for (const id of ['root', 'child', 'other']) state = expandNode(state, id)
    const collapsed = collapseSubtree(state, root)

    expect(collapsed).not.toBe(state)
    expect(isNodeExpanded(collapsed, 'root')).toBe(false)
    expect(isNodeExpanded(collapsed, 'child')).toBe(false)
    expect(isNodeExpanded(collapsed, 'other')).toBe(true)
    expect(collapseSubtree(collapsed, root)).toBe(collapsed)
  })
})

describe('expandForest', () => {
  it('expands every fold under each given node', () => {
    const first = tree('first', [tree('first-child', [tree('first-grandchild')])])
    const second = tree('second', [tree('second-child')])
    const expanded = expandForest(COLLAPSED_EXPANSION_STATE, [first, second])

    expect(isNodeExpanded(expanded, 'first')).toBe(true)
    expect(isNodeExpanded(expanded, 'first-child')).toBe(true)
    expect(isNodeExpanded(expanded, 'second')).toBe(true)
    expect(isNodeExpanded(expanded, 'second-child')).toBe(false)
    expect(expandForest(expanded, [first, second])).toBe(expanded)
  })
})

describe('collapseForest', () => {
  it('forgets every choice under the given nodes and keeps choices elsewhere', () => {
    const first = tree('first', [tree('first-child', [tree('first-grandchild')])])
    const state = expansionFromIds(['first', 'first-child', 'elsewhere'])
    const collapsed = collapseForest(state, [first])

    expect([...collapsed.expandedIds]).toEqual(['elsewhere'])
    expect(collapseForest(collapsed, [first])).toBe(collapsed)
    expect(collapseForest(COLLAPSED_EXPANSION_STATE, [first])).toBe(COLLAPSED_EXPANSION_STATE)
  })
})

describe('expansionFromIds', () => {
  it('builds a state from ids and shares the collapsed state when there are none', () => {
    expect([...expansionFromIds(['a', 'b', 'a']).expandedIds]).toEqual(['a', 'b'])
    expect(expansionFromIds([])).toBe(COLLAPSED_EXPANSION_STATE)
  })
})

// @requirement PRODUCT.md §2.4
describe('expansion views', () => {
  function starred(id: string, children: TreeNode[] = []): TreeNode {
    return { id, text: id, starred: true, children }
  }

  // work (starred) > project > task > step; work > notes > note; home > garden (starred) > bed > plant
  const document: Document = {
    roots: [
      starred('work', [tree('project', [tree('task', [tree('step')])]), tree('notes', [tree('note')])]),
      tree('home', [starred('garden', [tree('bed', [tree('plant')])]), tree('chores', [tree('chore')])]),
    ],
  }

  function ids(state: ExpansionState): string[] {
    return [...state.expandedIds].sort()
  }

  it('selects the nearest starred node among the current parent and its ancestors', () => {
    expect(governingViewOwner(document, null)).toBeNull()
    expect(governingViewOwner(document, 'work')).toBe('work')
    expect(governingViewOwner(document, 'task')).toBe('work')
    expect(governingViewOwner(document, 'home')).toBeNull()
    expect(governingViewOwner(document, 'bed')).toBe('garden')
  })

  it('creates a starred view as a copy of the inherited view limited to the node’s descendants', () => {
    const root = expansionFromIds(['work', 'project', 'task', 'home', 'garden', 'bed'])

    const work = activateExpansionView(root, document, 'project')

    expect(work.viewOwnerId).toBe('work')
    expect(ids(work)).toEqual(['project', 'task'])
    expect(work.otherViews.get(null)).toBe(root.expandedIds)
  })

  it('returns the same state while the active view governs the location', () => {
    const work = activateExpansionView(expansionFromIds(['project']), document, 'work')

    expect(activateExpansionView(work, document, 'task')).toBe(work)
  })

  it('keeps each view’s fold changes separate when the location moves between views', () => {
    const root = expansionFromIds(['work', 'project'])
    const work = collapseNode(activateExpansionView(root, document, 'work'), 'project')

    const backAtRoot = activateExpansionView(work, document, null)

    expect(backAtRoot.viewOwnerId).toBeNull()
    expect(ids(backAtRoot)).toEqual(['project', 'work'])

    const workAgain = activateExpansionView(collapseNode(backAtRoot, 'work'), document, 'notes')

    expect(ids(workAgain)).toEqual([])
    expect(ids(activateExpansionView(workAgain, document, null))).toEqual(['project'])
  })

  it('inherits a nested view from the nearest starred ancestor with a view, otherwise from the root view', () => {
    const nested: Document = {
      roots: [starred('outer', [starred('inner', [tree('task', [tree('step')])])])],
    }
    const root = expansionFromIds(['outer', 'inner', 'task'])

    expect(ids(activateExpansionView(root, nested, 'inner'))).toEqual(['task'])

    const outer = collapseNode(activateExpansionView(root, nested, 'outer'), 'task')
    const inner = activateExpansionView(outer, nested, 'inner')

    expect(inner.viewOwnerId).toBe('inner')
    expect(ids(inner)).toEqual([])
  })

  it('keeps the view of a node whose star is removed and uses it again when the star returns', () => {
    const work = expandNode(activateExpansionView(COLLAPSED_EXPANSION_STATE, document, 'work'), 'notes')
    const unstarred = toggleStarNode(document, 'work')

    const root = activateExpansionView(work, unstarred, 'work')

    expect(root.viewOwnerId).toBeNull()
    expect(ids(root)).toEqual([])
    expect([...root.otherViews.get('work')!]).toEqual(['notes'])

    const restored = activateExpansionView(root, document, 'work')

    expect(restored.viewOwnerId).toBe('work')
    expect(ids(restored)).toEqual(['notes'])
  })

  it('inherits the nearest currently starred view when a descendant first opens its own view', () => {
    const nested: Document = {
      roots: [starred('outer', [starred('middle', [starred('inner', [tree('task', [tree('step')])])])])],
    }
    const outer = activateExpansionView(expansionFromIds(['task']), nested, 'outer')
    const middle = collapseNode(activateExpansionView(outer, nested, 'middle'), 'task')
    const unstarred = toggleStarNode(nested, 'middle')

    const beforeUnstarring = activateExpansionView(middle, nested, 'inner')
    const afterUnstarring = activateExpansionView(middle, unstarred, 'inner')

    expect(ids(beforeUnstarring)).toEqual([])
    expect(ids(afterUnstarring)).toEqual(['task'])
    expect(ids(activateExpansionView(afterUnstarring, nested, 'middle'))).toEqual([])
  })

  it('saves the root view and every starred view, whichever view is active', () => {
    const atRoot = expansionFromViews(['work'], [['garden', ['bed']]])
    const inWork = expandNode(activateExpansionView(atRoot, document, 'work'), 'project')

    const saved = savedExpansionViews(inWork)

    expect([...saved.expandedIds]).toEqual(['work'])
    expect(new Map([...saved.starredExpandedIds].map(([owner, view]) => [owner, [...view]]))).toEqual(
      new Map([
        ['garden', ['bed']],
        ['work', ['project']],
      ]),
    )
  })

  it('closes every fold of the active view only', () => {
    const atRoot = expansionFromViews(['work', 'home'], [['garden', ['bed']]])

    const closed = collapseActiveView(atRoot)

    expect(ids(closed)).toEqual([])
    expect([...closed.otherViews.get('garden')!]).toEqual(['bed'])
    expect(collapseActiveView(closed)).toBe(closed)
  })

  // @requirement PRODUCT.md §22.1
  it('creates a starred view from remembered ids without walking a 10000-node subtree', () => {
    let reads = 0
    const leaves: TreeNode[] = Array.from({ length: 10_000 }, (_, index) => {
      const children: TreeNode[] = index % 100 === 0 ? [tree(`${index}-child`)] : []
      return {
        id: `${index}`,
        text: `Node ${index}`,
        get children() {
          reads++
          return children
        },
      }
    })
    const large: Document = { roots: [starred('large', leaves)] }
    const root = expansionFromIds(['large', ...Array.from({ length: 100 }, (_, index) => `${index * 100}`)])
    // The editor has already indexed a displayed document; count only the reads activation adds.
    buildNodeIndex(large)
    reads = 0

    const view = activateExpansionView(root, large, 'large')

    expect(view.expandedIds.size).toBe(100)
    expect(reads).toBe(0)
  })

  it('restores saved views with the root view active and shares the collapsed state when all are empty', () => {
    const restored = expansionFromViews(['home'], [['garden', []]])

    expect(restored.viewOwnerId).toBeNull()
    expect(ids(restored)).toEqual(['home'])
    expect([...restored.otherViews.get('garden')!]).toEqual([])
    expect(expansionFromViews([], [])).toBe(COLLAPSED_EXPANSION_STATE)
  })
})
