import { describe, expect, it, vi } from 'vitest'
import type { Document, TreeNode } from '../domain/document'
import { MAX_DOCUMENT_DEPTH_ERROR } from '../domain/document'
import {
  ancestorNavigationTransition,
  createSiblingOrFirstChildTransition,
  deleteEmptySelectedTransition,
  deleteSelectedTransition,
  enterTransition,
  leaveTransition,
  moveHorizontalTransition,
  moveNodeTransition,
  moveSelectionTransition,
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

    expect(transition.document.roots[0]!.children.map((node) => node.id)).toEqual(['second'])
    expect(transition.location).toEqual({ currentParentId: 'root', selectedNodeId: 'second' })
    expect(transition.focus).toEqual({ nodeId: 'second', cursor: 0 })
  })

  it('moves outward when deleting the current parent and replaces the only root', () => {
    const nested = {
      roots: [{ id: 'outer', text: 'Outer', children: [{ id: 'parent', text: 'Parent', children: [] }] }],
    }
    expect(
      deleteSelectedTransition(nested, { currentParentId: 'parent', selectedNodeId: 'parent' }, () => 'new'),
    ).toMatchObject({
      location: { currentParentId: 'outer', selectedNodeId: 'outer' },
      focus: { nodeId: 'outer', cursor: 0 },
    })
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

  it('moves only nodes displayed at the current location and adjusts a later insertion index', () => {
    const moved = moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'first' }, 'first', 2)
    expect(moved?.document.roots[0]!.children.map((node) => node.id)).toEqual(['second', 'first'])
    expect(moved?.location).toEqual({ currentParentId: 'root', selectedNodeId: 'first' })
    expect(moved?.focus).toEqual({ nodeId: 'first', cursor: 0 })
    expect(
      moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'first' }, 'root', 0),
    ).toBeUndefined()
    expect(
      moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'first' }, 'first', 1),
    ).toBeUndefined()
  })
})
