import { describe, expect, it } from 'vitest'
import type { Document, Location, TreeNode } from '../domain/document'
import { createVimCommandState, type VimVisualMemory } from './vim-command-state'
import { rememberIncomingNodes, rememberNodeRange, resolveVisualMemory } from './vim-visual-memory'

const node = (id: string, text = id, children: TreeNode[] = []): TreeNode => ({ id, text, children })
const documentOf = (...roots: TreeNode[]): Document => ({ roots }) as Document
const at = (selectedNodeId: string, currentParentId: string | null = null): Location => ({
  currentParentId,
  selectedNodeId,
})
const collapsed = (): boolean => false
const expanded = (): boolean => true

const nodes = (anchorId: string, focusId: string, ids: string[]): VimVisualMemory => ({
  kind: 'nodes',
  anchorId,
  focusId,
  ids,
})

describe('resolveVisualMemory', () => {
  const tree = documentOf(node('a', 'A', [node('a1'), node('a2')]), node('b'), node('c'), node('d'))

  it('has nothing to restore without a memory', () => {
    expect(resolveVisualMemory(undefined, tree, at('a'), collapsed)).toBeUndefined()
  })

  it('restores a forward and a reverse whole-node range with its direction', () => {
    expect(resolveVisualMemory(nodes('b', 'c', ['b', 'c']), tree, at('a'), collapsed)).toEqual({
      kind: 'nodes',
      anchorId: 'b',
      focusId: 'c',
    })
    expect(resolveVisualMemory(nodes('c', 'b', ['b', 'c']), tree, at('a'), collapsed)).toEqual({
      kind: 'nodes',
      anchorId: 'c',
      focusId: 'b',
    })
  })

  it('is invalid when a node of the range was deleted or replaced', () => {
    const deleted = documentOf(node('a'), node('b'), node('d'))
    expect(resolveVisualMemory(nodes('b', 'c', ['b', 'c']), deleted, at('a'), collapsed)).toBeUndefined()
    // The middle node x was replaced by y: the same number of nodes, but not the remembered ones.
    const middleSwapped = documentOf(node('a'), node('b'), node('y'), node('c'))
    expect(resolveVisualMemory(nodes('b', 'c', ['b', 'x', 'c']), middleSwapped, at('a'), collapsed)).toBeUndefined()
  })

  it('is invalid when another node was inserted between the ends', () => {
    const inserted = documentOf(node('a'), node('b'), node('new'), node('c'))
    expect(resolveVisualMemory(nodes('b', 'c', ['b', 'c']), inserted, at('a'), collapsed)).toBeUndefined()
  })

  it('is invalid when the ends are no longer siblings', () => {
    const moved = documentOf(node('a', 'A', [node('c')]), node('b'))
    expect(resolveVisualMemory(nodes('b', 'c', ['b', 'c']), moved, at('a'), collapsed)).toBeUndefined()
  })

  it('stays valid when the whole range moved together to another parent', () => {
    const shifted = documentOf(node('a', 'A', [node('b'), node('c')]))
    expect(resolveVisualMemory(nodes('b', 'c', ['b', 'c']), shifted, at('a'), expanded)).toEqual({
      kind: 'nodes',
      anchorId: 'b',
      focusId: 'c',
    })
  })

  it('never includes the current-parent heading', () => {
    const memory = nodes('a', 'a', ['a'])
    expect(resolveVisualMemory(memory, tree, at('a', 'a'), expanded)).toBeUndefined()
  })

  it('is invalid when a collapsed fold hides the range and valid once it is expanded', () => {
    const memory = nodes('a1', 'a2', ['a1', 'a2'])
    expect(resolveVisualMemory(memory, tree, at('a'), collapsed)).toBeUndefined()
    expect(resolveVisualMemory(memory, tree, at('a'), (id) => id === 'a')).toEqual({
      kind: 'nodes',
      anchorId: 'a1',
      focusId: 'a2',
    })
  })

  it('is invalid when the range is outside the displayed location', () => {
    const memory = nodes('b', 'c', ['b', 'c'])
    expect(resolveVisualMemory(memory, tree, at('a1', 'a'), expanded)).toBeUndefined()
    expect(resolveVisualMemory(nodes('a1', 'a2', ['a1', 'a2']), tree, at('a1', 'a'), collapsed)).toEqual({
      kind: 'nodes',
      anchorId: 'a1',
      focusId: 'a2',
    })
  })

  it('restores a character selection while both offsets exist in the text', () => {
    const memory: VimVisualMemory = { kind: 'text', nodeId: 'b', anchor: 2, focus: 0, hadText: true }
    const longer = documentOf(node('b', 'abcdef'))
    expect(resolveVisualMemory(memory, longer, at('b'), collapsed)).toEqual(memory)
    expect(resolveVisualMemory(memory, documentOf(node('b', 'abc')), at('b'), collapsed)).toBeDefined()
    expect(resolveVisualMemory(memory, documentOf(node('b', 'ab')), at('b'), collapsed)).toBeUndefined()
  })

  it('treats an empty text as holding only offset zero', () => {
    const empty = documentOf(node('b', ''))
    const remembered = (anchor: number, focus: number, hadText: boolean): VimVisualMemory => ({
      kind: 'text',
      nodeId: 'b',
      anchor,
      focus,
      hadText,
    })
    expect(resolveVisualMemory(remembered(0, 0, false), empty, at('b'), collapsed)).toBeDefined()
    expect(resolveVisualMemory(remembered(0, 1, false), empty, at('b'), collapsed)).toBeUndefined()
  })

  it('is invalid when the remembered text was emptied after the selection', () => {
    const memory: VimVisualMemory = { kind: 'text', nodeId: 'b', anchor: 0, focus: 0, hadText: true }
    expect(resolveVisualMemory(memory, documentOf(node('b', '')), at('b'), collapsed)).toBeUndefined()
    expect(resolveVisualMemory(memory, documentOf(node('b', 'x')), at('b'), collapsed)).toBeDefined()
  })

  it('is invalid for a deleted node, a hidden node, and a node outside the location', () => {
    const memory: VimVisualMemory = { kind: 'text', nodeId: 'a1', anchor: 0, focus: 1, hadText: true }
    expect(resolveVisualMemory(memory, documentOf(node('b')), at('b'), collapsed)).toBeUndefined()
    expect(resolveVisualMemory(memory, tree, at('a'), collapsed)).toBeUndefined()
    expect(resolveVisualMemory(memory, tree, at('a'), expanded)).toBeDefined()
    expect(resolveVisualMemory(memory, tree, at('b'), expanded)).toBeDefined()
    expect(resolveVisualMemory(memory, tree, at('a2', 'a2'), expanded)).toBeUndefined()
  })

  it('restores a character selection in the current-parent heading itself', () => {
    const memory: VimVisualMemory = { kind: 'text', nodeId: 'a', anchor: 0, focus: 0, hadText: true }
    expect(resolveVisualMemory(memory, tree, at('a', 'a'), collapsed)).toBeDefined()
  })
})

describe('rememberNodeRange', () => {
  const tree = documentOf(node('a', 'A', [node('a1')]), node('b'), node('c'))

  it('remembers the sibling range ascending whatever the direction', () => {
    const state = createVimCommandState()
    rememberNodeRange(state, tree, 'a', 'c')
    expect(state.lastVisual).toEqual({ kind: 'nodes', anchorId: 'a', focusId: 'c', ids: ['a', 'b', 'c'] })
    rememberNodeRange(state, tree, 'c', 'a')
    expect(state.lastVisual).toEqual({ kind: 'nodes', anchorId: 'c', focusId: 'a', ids: ['a', 'b', 'c'] })
    rememberNodeRange(state, tree, 'b', 'b')
    expect(state.lastVisual).toEqual({ kind: 'nodes', anchorId: 'b', focusId: 'b', ids: ['b'] })
  })

  it('keeps the previous memory for missing nodes or nodes under different parents', () => {
    const state = createVimCommandState()
    rememberNodeRange(state, tree, 'b', 'c')
    const remembered = state.lastVisual
    rememberNodeRange(state, tree, 'a1', 'b')
    rememberNodeRange(state, tree, 'missing', 'b')
    rememberNodeRange(state, tree, 'b', 'missing')
    expect(state.lastVisual).toBe(remembered)
  })
})

describe('rememberIncomingNodes', () => {
  const tree = documentOf(node('a'), node('b'), node('c'))

  it('remembers the consecutive siblings from the first inserted node, selected forward', () => {
    const state = createVimCommandState()
    rememberIncomingNodes(state, tree, 'a', 2)
    expect(state.lastVisual).toEqual({ kind: 'nodes', anchorId: 'a', focusId: 'b', ids: ['a', 'b'] })
  })

  it('keeps the previous memory when fewer siblings exist or the node is missing', () => {
    const state = createVimCommandState()
    rememberIncomingNodes(state, tree, 'c', 1)
    const remembered = state.lastVisual
    rememberIncomingNodes(state, tree, 'b', 3)
    rememberIncomingNodes(state, tree, 'missing', 1)
    expect(state.lastVisual).toBe(remembered)
  })
})
