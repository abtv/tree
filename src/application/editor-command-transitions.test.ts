import { describe, expect, it } from 'vitest'
import type { Document } from '../domain/document'
import {
  ancestorNavigationTransition,
  deleteEmptySelectedTransition,
  deleteSelectedTransition,
  enterTransition,
  leaveTransition,
  moveHorizontalTransition,
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
})
