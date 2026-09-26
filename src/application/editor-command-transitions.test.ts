import { describe, expect, it, vi } from 'vitest'
import type { Document, TreeNode } from '../domain/document'
import { MAX_DOCUMENT_DEPTH_ERROR } from '../domain/document'
import {
  ancestorNavigationTransition,
  createSiblingTransition,
  createSiblingOrFirstChildTransition,
  deleteEmptySelectedTransition,
  deleteSelectedTransition,
  enterTransition,
  leaveTransition,
  moveHorizontalTransition,
  moveNodeTransition,
  moveSelectionBoundaryTransition,
  moveSelectionTransition,
  pasteSubtreeTransition,
} from './editor-command-transitions'

const document: Document = {
  roots: [
    {
      id: 'root',
      text: 'Root',
      children: [
        { id: 'first', text: 'First', children: [] },
        { id: 'second', text: 'Second', children: [] },
      ],
    },
    { id: 'other-root', text: 'Other root', children: [] },
  ],
}

describe('editor command transitions', () => {
  it('rejects a child at maximum depth before requesting an ID', () => {
    const deepest: TreeNode = {
      id: 'n19',
      text: '',
      children: [],
    }
    let root: TreeNode = deepest
    for (let index = 18; index >= 0; index -= 1) {
      root = { id: `n${index}`, text: '', children: [root] }
    }
    const deepDocument = { roots: [root] }
    const createId = vi.fn(() => 'unused')
    const result = createSiblingOrFirstChildTransition(
      deepDocument,
      { currentParentId: deepest.id, selectedNodeId: deepest.id },
      0,
      createId,
    )

    expect(result).toEqual({ kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR })
    expect(createId).not.toHaveBeenCalled()
  })

  it('resolves vertical and horizontal navigation targets without changing the document', () => {
    const childLocation = { currentParentId: 'root', selectedNodeId: 'first' }

    expect(moveSelectionTransition(document, childLocation, 'up', 4)).toEqual({ nodeId: 'root', cursor: 4 })
    expect(moveSelectionTransition(document, childLocation, 'down', 99)).toEqual({ nodeId: 'second', cursor: 6 })
    expect(moveHorizontalTransition(document, childLocation, 'left', 0)).toEqual({ nodeId: 'root', cursor: 4 })
    expect(moveHorizontalTransition(document, childLocation, 'right', 2)).toBeUndefined()
    expect(document.roots[0]!.children.map((node) => node.id)).toEqual(['first', 'second'])
  })

  it('resolves first and last displayed nodes while clamping the cursor', () => {
    const childLocation = { currentParentId: 'root', selectedNodeId: 'first' }

    expect(moveSelectionBoundaryTransition(document, childLocation, 'parent', 99)).toEqual({
      nodeId: 'root',
      cursor: 4,
    })
    expect(
      moveSelectionBoundaryTransition(document, { currentParentId: null, selectedNodeId: 'other-root' }, 'parent', 99),
    ).toEqual({ nodeId: 'root', cursor: 4 })
    expect(moveSelectionBoundaryTransition(document, childLocation, 'first', 99)).toEqual({
      nodeId: 'first',
      cursor: 5,
    })
    expect(moveSelectionBoundaryTransition(document, childLocation, 'last', 99)).toEqual({
      nodeId: 'second',
      cursor: 6,
    })
  })

  it('resolves entering, leaving, and ancestor navigation locations with a beginning cursor', () => {
    expect(enterTransition(document, { currentParentId: null, selectedNodeId: 'root' })).toEqual({
      location: { currentParentId: 'root', selectedNodeId: 'first' },
      focus: { nodeId: 'first', cursor: 0 },
    })
    expect(leaveTransition(document, { currentParentId: 'root', selectedNodeId: 'second' })).toEqual({
      location: { currentParentId: null, selectedNodeId: 'root' },
      focus: { nodeId: 'root', cursor: 0 },
    })
    expect(ancestorNavigationTransition(document, { currentParentId: 'root', selectedNodeId: 'second' }, null)).toEqual(
      {
        location: { currentParentId: null, selectedNodeId: 'root' },
        focus: { nodeId: 'root', cursor: 0 },
      },
    )
  })

  it('selects the next sibling when deleting a displayed node', () => {
    const transition = deleteSelectedTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'first' },
      () => 'new',
    )
    if (transition === undefined) throw new Error('Expected a deletion transition.')

    expect(transition.document.roots[0]!.children.map((node) => node.id)).toEqual(['second'])
    expect(transition.location).toEqual({ currentParentId: 'root', selectedNodeId: 'second' })
    expect(transition.focus).toEqual({ nodeId: 'second', cursor: 0 })
  })

  it('pastes a copied subtree before or after the selected sibling', () => {
    const source: TreeNode = {
      id: 'copied',
      text: 'Copied',
      children: [{ id: 'copied-child', text: 'Child', children: [] }],
    }
    const afterIds = ['copy', 'copy-child']
    const beforeIds = ['before-copy', 'before-child']
    const after = pasteSubtreeTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'first' },
      'after',
      source,
      () => afterIds.shift()!,
    )
    const before = pasteSubtreeTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'first' },
      'before',
      source,
      () => beforeIds.shift()!,
    )

    expect(after.document.roots[0]!.children.map((node) => node.id)).toEqual(['first', 'copy', 'second'])
    expect(after.location.selectedNodeId).toBe('copy')
    expect(after.document.roots[0]!.children[1]!.children[0]!.id).toBe('copy-child')
    expect(before.document.roots[0]!.children.map((node) => node.id)).toEqual(['before-copy', 'first', 'second'])
    expect(before.location.selectedNodeId).toBe('before-copy')
    expect(before.document.roots[0]!.children[0]!.children[0]!.id).toBe('before-child')
  })

  it('does not delete the current parent', () => {
    const nested = {
      roots: [{ id: 'outer', text: 'Outer', children: [{ id: 'parent', text: 'Parent', children: [] }] }],
    }
    expect(
      deleteSelectedTransition(nested, { currentParentId: 'parent', selectedNodeId: 'parent' }, () => 'new'),
    ).toBeUndefined()
  })

  it('still replaces the only top-level root when it is deleted', () => {
    expect(
      deleteSelectedTransition(
        { roots: [{ id: 'root', text: '', children: [] }] },
        { currentParentId: null, selectedNodeId: 'root' },
        () => 'new',
      ),
    ).toMatchObject({
      document: { roots: [{ id: 'new', text: '', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'new' },
    })
  })

  it('uses the empty-node Backspace destinations and preserves the only root', () => {
    const empty = {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: [
            { id: 'previous', text: 'Previous', children: [] },
            { id: 'empty', text: '', children: [] },
          ],
        },
      ],
    }
    expect(deleteEmptySelectedTransition(empty, { currentParentId: 'root', selectedNodeId: 'empty' })).toMatchObject({
      location: { currentParentId: 'root', selectedNodeId: 'previous' },
      focus: { nodeId: 'previous', cursor: 8 },
    })
    expect(
      deleteEmptySelectedTransition(
        { roots: [{ id: 'root', text: '', children: [] }] },
        { currentParentId: null, selectedNodeId: 'root' },
      ),
    ).toBeUndefined()
  })

  it('creates siblings before or through splits, and creates a first child from the current parent', () => {
    const before = createSiblingOrFirstChildTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'first' },
      0,
      () => 'before',
    )
    if (!('document' in before)) throw new Error('Expected an accepted transition.')
    expect(before.document.roots[0]!.children.map((node) => [node.id, node.text])).toEqual([
      ['before', ''],
      ['first', 'First'],
      ['second', 'Second'],
    ])
    expect(before.location).toEqual({ currentParentId: 'root', selectedNodeId: 'before' })
    expect(before.focus).toEqual({ nodeId: 'before', cursor: 0 })

    const split = createSiblingOrFirstChildTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'first' },
      2,
      () => 'split',
    )
    if (!('document' in split)) throw new Error('Expected an accepted transition.')
    expect(split.document.roots[0]!.children.map((node) => [node.id, node.text])).toEqual([
      ['first', 'Fi'],
      ['split', 'rst'],
      ['second', 'Second'],
    ])
    expect(split.location).toEqual({ currentParentId: 'root', selectedNodeId: 'split' })

    const child = createSiblingOrFirstChildTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'root' },
      0,
      () => 'child',
    )
    if (!('document' in child)) throw new Error('Expected an accepted transition.')
    expect(child.document.roots[0]!.children.map((node) => node.id)).toEqual(['child', 'first', 'second'])
    expect(child.location).toEqual({ currentParentId: 'root', selectedNodeId: 'child' })
  })

  it('creates an empty sibling before or after without changing the selected node text', () => {
    const before = createSiblingTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'first' },
      'before',
      () => 'before-empty',
    )
    expect(before.document.roots[0]!.children.map((node) => [node.id, node.text])).toEqual([
      ['before-empty', ''],
      ['first', 'First'],
      ['second', 'Second'],
    ])
    expect(before.focus).toEqual({ nodeId: 'before-empty', cursor: 0 })

    const after = createSiblingTransition(
      document,
      { currentParentId: 'root', selectedNodeId: 'first' },
      'after',
      () => 'after-empty',
    )
    expect(after.document.roots[0]!.children.map((node) => [node.id, node.text])).toEqual([
      ['first', 'First'],
      ['after-empty', ''],
      ['second', 'Second'],
    ])
    expect(after.focus).toEqual({ nodeId: 'after-empty', cursor: 0 })
  })

  it('moves only nodes displayed at the current location and adjusts a later insertion index', () => {
    const moved = moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'first' }, 'first', 2, 3)
    expect(moved?.document.roots[0]!.children.map((node) => node.id)).toEqual(['second', 'first'])
    expect(moved?.location).toEqual({ currentParentId: 'root', selectedNodeId: 'first' })
    expect(moved?.focus).toEqual({ nodeId: 'first', cursor: 3 })
    expect(
      moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'first' }, 'root', 0),
    ).toBeUndefined()
    expect(
      moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'first' }, 'first', 1),
    ).toBeUndefined()
  })
})
