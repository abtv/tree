import { describe, expect, it } from 'vitest'
import {
  COLLAPSED_EXPANSION_STATE,
  collapseNode,
  expandNode,
  isNodeExpanded,
  toggleNodeExpansion,
} from './expansion-state'

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

  it('retains a descendant choice made during the same visit across a collapse/expand round trip', () => {
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
