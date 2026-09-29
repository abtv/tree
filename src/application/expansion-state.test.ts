import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import {
  COLLAPSED_EXPANSION_STATE,
  applyNodeFold,
  collapseForest,
  collapseNode,
  collapseSubtree,
  expandForest,
  expandNode,
  expansionFromIds,
  expandSubtree,
  isNodeExpanded,
  toggleNodeExpansion,
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
