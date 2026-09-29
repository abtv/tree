import { describe, expect, it } from 'vitest'
import { isValidLocation, type Document, type LinkRange, type TreeNode } from '../domain/document'
import { changeSiteFocus, locateChangeSite } from './editor-undo-focus'

function node(id: string, text: string, children: TreeNode[] = [], options: Partial<TreeNode> = {}): TreeNode {
  return { id, text, children, ...options }
}

const image = { attachment: { id: 'png', mimeType: 'image/png' as const } }

function tree(...roots: TreeNode[]): Document {
  return { roots }
}

const collapsed = () => false

describe('locateChangeSite', () => {
  it('reports no site for the same document', () => {
    const document = tree(node('a', 'text'))
    expect(locateChangeSite(document, document)).toBeUndefined()
  })

  it('reports no site when two distinct snapshots hold the same content', () => {
    expect(locateChangeSite(tree(node('a', 'text')), tree(node('a', 'text')))).toBeUndefined()
  })

  it('locates a mid-text edit at the first differing character', () => {
    expect(locateChangeSite(tree(node('a', 'abde')), tree(node('a', 'abcde')))).toEqual({
      nodeId: 'a',
      parentId: null,
      cursor: 2,
    })
  })

  it('locates appended text at the end of the shorter text', () => {
    expect(locateChangeSite(tree(node('a', 'ab')), tree(node('a', 'abcd')))).toEqual({
      nodeId: 'a',
      parentId: null,
      cursor: 2,
    })
  })

  it('locates a trailing deletion past the end of the restored text, leaving the clamp to the caret transition', () => {
    expect(locateChangeSite(tree(node('a', 'abc')), tree(node('a', 'ab')))).toEqual({
      nodeId: 'a',
      parentId: null,
      cursor: 2,
    })
  })

  it('locates an attachment-only change at the terminal image character', () => {
    expect(locateChangeSite(tree(node('a', 'abc')), tree(node('a', 'abc', [], image)))).toEqual({
      nodeId: 'a',
      parentId: null,
      cursor: 3,
    })
  })

  it('locates a link-only change at the first changed range', () => {
    const links: LinkRange[] = [{ start: 0, end: 2, url: 'https://example.com/' }]
    const changed: LinkRange[] = [{ start: 0, end: 2, url: 'https://example.com/other' }]
    expect(
      locateChangeSite(tree(node('a', 'ab', [], { links })), tree(node('a', 'ab', [], { links: changed }))),
    ).toEqual({ nodeId: 'a', parentId: null, cursor: 0 })
  })

  it('locates a change inside a child and reports its parent', () => {
    const before = tree(node('root', 'Root', [node('a', 'one'), node('b', 'two')]))
    const after = tree(node('root', 'Root', [node('a', 'one'), node('b', 'tXo')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'b', parentId: 'root', cursor: 1 })
  })

  it('locates an inserted sibling at its start', () => {
    const before = tree(node('root', 'Root', [node('a', 'A'), node('c', 'C')]))
    const after = tree(node('root', 'Root', [node('a', 'A'), node('b', 'B'), node('c', 'C')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'b', parentId: 'root', cursor: 0 })
  })

  it('locates a removed middle sibling at the following survivor', () => {
    const before = tree(node('root', 'Root', [node('a', 'A'), node('b', 'B'), node('c', 'C')]))
    const after = tree(node('root', 'Root', [node('a', 'A'), node('c', 'C')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'c', parentId: 'root', cursor: 0 })
  })

  it('locates a removed last sibling at the preceding survivor', () => {
    const before = tree(node('root', 'Root', [node('a', 'A'), node('b', 'B')]))
    const after = tree(node('root', 'Root', [node('a', 'A')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'a', parentId: 'root', cursor: 0 })
  })

  it('locates a removed only child at the parent heading', () => {
    const before = tree(node('root', 'Root', [node('a', 'A')]))
    const after = tree(node('root', 'Root'))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'root', parentId: 'root', cursor: 0 })
  })

  it('reports no site when the last root disappears', () => {
    expect(locateChangeSite(tree(node('a', 'A')), tree())).toBeUndefined()
  })

  it('locates a removed subtree at the following survivor without descending into it', () => {
    const before = tree(node('root', 'Root', [node('a', 'A', [node('deep', 'deep')]), node('b', 'B')]))
    const after = tree(node('root', 'Root', [node('b', 'B')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'b', parentId: 'root', cursor: 0 })
  })

  it('locates a reorder at the first position whose occupant differs', () => {
    const before = tree(node('root', 'Root', [node('a', 'A'), node('b', 'B'), node('c', 'C')]))
    const after = tree(node('root', 'Root', [node('b', 'B'), node('a', 'A'), node('c', 'C')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'b', parentId: 'root', cursor: 0 })
  })

  it('locates a replaced sibling range at the replacement', () => {
    const before = tree(node('root', 'Root', [node('a', 'A'), node('b', 'B'), node('c', 'C')]))
    const after = tree(node('root', 'Root', [node('fresh', '')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'fresh', parentId: 'root', cursor: 0 })
  })

  it('locates a multi-node put at the first pasted node', () => {
    const before = tree(node('root', 'Root', [node('a', 'A')]))
    const after = tree(node('root', 'Root', [node('a', 'A'), node('p1', 'one'), node('p2', 'two')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'p1', parentId: 'root', cursor: 0 })
  })

  it('skips reallocated nodes whose content is unchanged', () => {
    // A whole-node Visual case command rebuilds every selected subtree, including nodes with no
    // letters to change, so a differing reference is not by itself a change.
    const before = tree(node('root', 'Root', [node('a', '123'), node('b', 'abc')]))
    const after = tree(node('root', 'Root', [node('a', '123'), node('b', 'ABC')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'b', parentId: 'root', cursor: 0 })
  })

  it('prefers a node’s own text change over a change among its children', () => {
    const before = tree(node('root', 'Root', [node('a', 'one')]))
    const after = tree(node('root', 'Rxot', [node('a', 'ONE')]))
    expect(locateChangeSite(before, after)).toEqual({ nodeId: 'root', parentId: null, cursor: 1 })
  })
})

describe('changeSiteFocus', () => {
  const before = tree(node('root', 'Root', [node('a', 'one'), node('b', 'two')]))
  const after = tree(node('root', 'Root', [node('a', 'one'), node('b', 'tXo')]))

  it('displays the change site at its own parent level', () => {
    const target = changeSiteFocus(before, after, { currentParentId: 'root', selectedNodeId: 'a' }, collapsed)
    expect(target).toEqual({
      location: { currentParentId: 'root', selectedNodeId: 'b' },
      focus: { nodeId: 'b', cursor: 1 },
    })
    expect(isValidLocation(after, target!.location)).toBe(true)
  })

  it('re-levels to the change site when it sits outside the displayed level', () => {
    const nested = tree(node('root', 'Root', [node('a', 'one'), node('b', 'two', [node('deep', 'deep')])]))
    const outside = tree(node('root', 'Root', [node('a', 'one'), node('b', 'two', [node('deep', 'dXep')])]))
    const target = changeSiteFocus(nested, outside, { currentParentId: 'root', selectedNodeId: 'a' }, collapsed)
    expect(target).toEqual({
      location: { currentParentId: 'b', selectedNodeId: 'deep' },
      focus: { nodeId: 'deep', cursor: 1 },
    })
    expect(isValidLocation(outside, target!.location)).toBe(true)
  })

  it('keeps the location when the change site is a visible descendant shown by inline expansion', () => {
    // Undoing `dd` on `deep` restores it beneath expanded `alpha` and `b`; the location stays the root.
    const removed = tree(node('alpha', 'Alpha', [node('b', 'two')]), node('beta', 'Beta'))
    const restored = tree(node('alpha', 'Alpha', [node('b', 'two', [node('deep', 'deep')])]), node('beta', 'Beta'))
    const root = { currentParentId: null, selectedNodeId: 'b' }
    const expanded = (id: string) => id === 'alpha' || id === 'b'
    const target = changeSiteFocus(removed, restored, root, expanded)
    expect(target).toEqual({
      location: { currentParentId: null, selectedNodeId: 'deep' },
      focus: { nodeId: 'deep', cursor: 0 },
    })
    const inside = changeSiteFocus(removed, restored, { currentParentId: 'alpha', selectedNodeId: 'b' }, expanded)
    expect(inside?.location).toEqual({ currentParentId: 'alpha', selectedNodeId: 'deep' })
    // A collapsed ancestor hides the site, so the change is displayed at its own parent as before.
    expect(changeSiteFocus(removed, restored, root, (id) => id === 'alpha')?.location).toEqual({
      currentParentId: 'b',
      selectedNodeId: 'deep',
    })
  })

  it('keeps the current-parent heading selected when the change is in the heading itself', () => {
    const heading = tree(node('root', 'Rxot', [node('a', 'one'), node('b', 'two')]))
    const target = changeSiteFocus(before, heading, { currentParentId: 'root', selectedNodeId: 'a' }, collapsed)
    expect(target).toEqual({
      location: { currentParentId: 'root', selectedNodeId: 'root' },
      focus: { nodeId: 'root', cursor: 1 },
    })
    expect(isValidLocation(heading, target!.location)).toBe(true)
  })

  it('reports no target when the snapshots hold the same content', () => {
    expect(changeSiteFocus(before, before, { currentParentId: 'root', selectedNodeId: 'a' }, collapsed)).toBeUndefined()
  })
})
