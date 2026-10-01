import { describe, expect, it, vi } from 'vitest'
import type { Document, TreeNode } from '../domain/document'
import { assertDocument, displayedNodes, MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_DEPTH_ERROR } from '../domain/document'
import { buildVisibleRows } from './visible-rows'
import {
  ancestorNavigationTransition,
  createFirstChildTransition,
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

// A visible descendant several levels below the current parent, reachable through inline expansion
// (docs/PRODUCT.md §2.4): `alpha` is a top-level root; `alpha1` is its child; `alpha1a` is `alpha1`'s
// own child. The current parent stays `null` throughout, matching how expansion never changes it.
const nestedDocument: Document = {
  roots: [
    {
      id: 'alpha',
      text: 'Alpha',
      children: [
        {
          id: 'alpha1',
          text: 'Alpha child one',
          children: [{ id: 'alpha1a', text: 'Alpha grandchild', children: [] }],
        },
        { id: 'alpha2', text: 'Alpha child two', children: [] },
      ],
    },
    { id: 'beta', text: 'Beta', children: [] },
  ],
}

function rowsFor(
  document: Document,
  location: { currentParentId: string | null },
  expandedIds: readonly string[] = [],
) {
  return buildVisibleRows(displayedNodes(document, location.currentParentId), (id) => expandedIds.includes(id))
}
const rootLocation = { currentParentId: null, selectedNodeId: 'alpha' }

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

  it('rejects a sibling subtree paste that would pass the maximum depth before consuming an ID', () => {
    let node: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
    for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1) {
      node = { id: `n${index}`, text: '', children: [node] }
    }
    const deepDocument: Document = { roots: [node] }
    const source: TreeNode = {
      id: 'source',
      text: 'Source',
      children: [{ id: 'source-child', text: 'Child', children: [] }],
    }
    const createId = vi.fn(() => 'unused')

    expect(
      pasteSubtreeTransition(
        deepDocument,
        { currentParentId: `n${MAX_DOCUMENT_DEPTH - 1}`, selectedNodeId: `n${MAX_DOCUMENT_DEPTH - 1}` },
        'after',
        source,
        createId,
      ),
    ).toEqual({ kind: 'rejected', message: MAX_DOCUMENT_DEPTH_ERROR })
    expect(createId).not.toHaveBeenCalled()

    // One level higher the same two-level subtree lands exactly on the limit and is accepted.
    let nextId = 0
    const accepted = pasteSubtreeTransition(
      deepDocument,
      { currentParentId: `n${MAX_DOCUMENT_DEPTH - 2}`, selectedNodeId: `n${MAX_DOCUMENT_DEPTH - 2}` },
      'after',
      source,
      () => `copy-${nextId++}`,
    )
    if (!('document' in accepted)) throw new Error('Expected an accepted transition.')
    expect(() => assertDocument(accepted.document)).not.toThrow()
  })

  // @requirement PRODUCT.md §4.1
  // @requirement PRODUCT.md §4.2
  // @requirement PRODUCT.md §4.3
  it('resolves vertical and horizontal navigation targets without changing the document', () => {
    const childLocation = { currentParentId: 'root', selectedNodeId: 'first' }

    const rows = rowsFor(document, childLocation)
    expect(moveSelectionTransition(document, childLocation, rows, 'up', 4)).toEqual({ nodeId: 'root', cursor: 4 })
    expect(moveSelectionTransition(document, childLocation, rows, 'down', 99)).toEqual({ nodeId: 'second', cursor: 6 })
    expect(moveHorizontalTransition(document, childLocation, rows, 'left', 0)).toEqual({ nodeId: 'root', cursor: 4 })
    expect(moveHorizontalTransition(document, childLocation, rows, 'right', 2)).toBeUndefined()
    expect(document.roots[0]!.children.map((node) => node.id)).toEqual(['first', 'second'])
  })

  it('resolves first and last displayed nodes while clamping the cursor', () => {
    const childLocation = { currentParentId: 'root', selectedNodeId: 'first' }
    const rows = rowsFor(document, childLocation)
    const rootRows = rowsFor(document, { currentParentId: null })

    expect(moveSelectionBoundaryTransition(document, childLocation, rows, 'parent', 99)).toEqual({
      nodeId: 'root',
      cursor: 4,
    })
    expect(
      moveSelectionBoundaryTransition(
        document,
        { currentParentId: null, selectedNodeId: 'other-root' },
        rootRows,
        'parent',
        99,
      ),
    ).toEqual({ nodeId: 'root', cursor: 4 })
    expect(moveSelectionBoundaryTransition(document, childLocation, rows, 'first', 99)).toEqual({
      nodeId: 'first',
      cursor: 5,
    })
    expect(moveSelectionBoundaryTransition(document, childLocation, rows, 'last', 99)).toEqual({
      nodeId: 'second',
      cursor: 6,
    })
    expect(
      moveSelectionBoundaryTransition(
        document,
        { currentParentId: null, selectedNodeId: 'root' },
        rootRows,
        'last',
        99,
        1,
      ),
    ).toEqual({
      nodeId: 'root',
      cursor: 4,
    })
    expect(
      moveSelectionBoundaryTransition(
        document,
        { currentParentId: null, selectedNodeId: 'root' },
        rootRows,
        'last',
        99,
        2,
      ),
    ).toEqual({
      nodeId: 'other-root',
      cursor: 10,
    })
  })

  it('moves a last-node boundary to its image character when the target has an image', () => {
    const imageDocument: Document = {
      roots: [
        { id: 'first', text: 'First', children: [] },
        { id: 'last', text: 'Last', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
      ],
    }

    expect(
      moveSelectionBoundaryTransition(
        imageDocument,
        { currentParentId: null, selectedNodeId: 'first' },
        rowsFor(imageDocument, { currentParentId: null }),
        'last',
        0,
      ),
    ).toEqual({ nodeId: 'last', cursor: 4 })
  })

  // @requirement PRODUCT.md §2.2
  // @requirement PRODUCT.md §6.1
  // @requirement PRODUCT.md §7.1
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

  // @requirement PRODUCT.md §8.1
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

    if (!('document' in after) || !('document' in before)) throw new Error('Expected accepted transitions.')

    expect(after.document.roots[0]!.children.map((node) => node.id)).toEqual(['first', 'copy', 'second'])
    expect(after.location).toEqual({ currentParentId: 'root', selectedNodeId: 'copy' })
    expect(after.focus).toEqual({ nodeId: 'copy', cursor: 0 })
    expect(after.document.roots[0]!.children[1]!.children[0]!.id).toBe('copy-child')
    expect(before.document.roots[0]!.children.map((node) => node.id)).toEqual(['before-copy', 'first', 'second'])
    expect(before.location).toEqual({ currentParentId: 'root', selectedNodeId: 'before-copy' })
    expect(before.focus).toEqual({ nodeId: 'before-copy', cursor: 0 })
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

  it('selects the real parent without changing the location when the only visible descendant is deleted', () => {
    const location = { currentParentId: null, selectedNodeId: 'alpha1a' }
    expect(deleteSelectedTransition(nestedDocument, location, () => 'new')).toMatchObject({
      location: { currentParentId: null, selectedNodeId: 'alpha1' },
      focus: { nodeId: 'alpha1', cursor: 0 },
    })
    expect(
      deleteSelectedTransition(nestedDocument, { currentParentId: 'alpha', selectedNodeId: 'alpha1a' }, () => 'new'),
    ).toMatchObject({ location: { currentParentId: 'alpha', selectedNodeId: 'alpha1' } })
  })

  it('does not enter the parent when Backspace deletes an empty first visible descendant', () => {
    const empty: Document = {
      roots: [
        {
          id: 'alpha',
          text: 'Alpha',
          children: [{ id: 'alpha1', text: 'One', children: [{ id: 'alpha1a', text: '', children: [] }] }],
        },
      ],
    }
    expect(deleteEmptySelectedTransition(empty, { currentParentId: null, selectedNodeId: 'alpha1a' })).toMatchObject({
      location: { currentParentId: null, selectedNodeId: 'alpha1' },
      focus: { nodeId: 'alpha1', cursor: 3 },
    })
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

  // @requirement PRODUCT.md §8.2
  // @requirement PRODUCT.md §19
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

  it('creates a first child of the selected node', () => {
    const child = createFirstChildTransition(
      document,
      { currentParentId: null, selectedNodeId: 'root' },
      () => 'new-child',
    )

    if (!('document' in child)) throw new Error('Expected an accepted transition.')
    expect(child.document.roots[0]!.children.map((node) => node.id)).toEqual(['new-child', 'first', 'second'])
    expect(child.location).toEqual({ currentParentId: 'root', selectedNodeId: 'new-child' })
    expect(child.focus).toEqual({ nodeId: 'new-child', cursor: 0 })
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

  it('is a no-op when an out-of-range insertion index clamps back to the source position', () => {
    // An insertion index far past the end of the sibling list clamps to "after the last sibling",
    // which is exactly where 'second' already is: nothing should move, and no transition is produced.
    expect(
      moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'second' }, 'second', 999),
    ).toBeUndefined()

    const singleRoot: Document = { roots: [{ id: 'only', text: 'Only', children: [] }] }
    expect(moveNodeTransition(singleRoot, { currentParentId: null, selectedNodeId: 'only' }, 'only', 2)).toBeUndefined()
  })

  it('ignores a drag source that no longer exists', () => {
    expect(
      moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'first' }, 'missing', 1),
    ).toBeUndefined()
  })

  it('keeps a drag at its source insertion slot unchanged', () => {
    expect(
      moveNodeTransition(document, { currentParentId: 'root', selectedNodeId: 'second' }, 'second', 1),
    ).toBeUndefined()
  })

  it('does not route horizontal text movement from a heading to its child', () => {
    const heading = { currentParentId: 'root', selectedNodeId: 'root' }
    const rows = rowsFor(document, heading)
    expect(moveHorizontalTransition(document, heading, rows, 'left', 4)).toBeUndefined()
    expect(moveHorizontalTransition(document, heading, rows, 'right', 2)).toBeUndefined()
    expect(moveHorizontalTransition(document, heading, rows, 'right', 4)).toEqual({ nodeId: 'first', cursor: 0 })
  })

  it('moves the caret within a heading or final row when vertical navigation has no adjacent row', () => {
    const heading = { currentParentId: 'second', selectedNodeId: 'second' }
    expect(moveSelectionTransition(document, heading, [], 'up', 3)).toEqual({ nodeId: 'second', cursor: 0 })
    expect(moveSelectionTransition(document, heading, [], 'down', 3)).toEqual({ nodeId: 'second', cursor: 6 })
    expect(moveSelectionTransition(document, heading, [], 'down', 6)).toBeUndefined()
    const final = { currentParentId: 'root', selectedNodeId: 'second' }
    expect(moveSelectionTransition(document, final, rowsFor(document, final), 'down', 2)).toEqual({
      nodeId: 'second',
      cursor: 6,
    })
  })

  it('does not enter an already selected heading even when it has children', () => {
    expect(enterTransition(document, { currentParentId: 'root', selectedNodeId: 'root' })).toBeUndefined()
  })

  it('ignores horizontal navigation from a node absent from the visible rows', () => {
    const location = { currentParentId: 'root', selectedNodeId: 'second' }
    const rows = rowsFor(document, location).slice(0, 1)
    expect(moveHorizontalTransition(document, location, rows, 'left', 0)).toBeUndefined()
  })

  it('keeps a leftward text motion inside a child when the caret is not at its beginning', () => {
    const location = { currentParentId: 'root', selectedNodeId: 'second' }
    expect(moveHorizontalTransition(document, location, rowsFor(document, location), 'left', 2)).toBeUndefined()
  })

  it('ignores downward movement from a node absent from the visible rows', () => {
    const location = { currentParentId: 'root', selectedNodeId: 'missing' }
    expect(moveSelectionTransition(document, location, rowsFor(document, location), 'down', 2)).toBeUndefined()
  })

  it('leaves an empty heading without a last-row boundary target', () => {
    const location = { currentParentId: 'second', selectedNodeId: 'second' }
    expect(moveSelectionBoundaryTransition(document, location, [], 'last', 0)).toBeUndefined()
    expect(moveSelectionBoundaryTransition(document, location, [], 'first', 0)).toBeUndefined()
  })

  it('rejects ancestor navigation to an unrelated or missing node', () => {
    const location = { currentParentId: 'root', selectedNodeId: 'first' }
    expect(ancestorNavigationTransition(document, location, 'other-root')).toBeUndefined()
    expect(ancestorNavigationTransition(document, location, 'missing')).toBeUndefined()
  })

  it('does not navigate to an ancestor from the document container', () => {
    expect(
      ancestorNavigationTransition(document, { currentParentId: null, selectedNodeId: 'root' }, 'root'),
    ).toBeUndefined()
  })

  describe('sibling-relative commands at descendant depth (inline expansion)', () => {
    it('moves in both directions through the flattened visible rows', () => {
      const rows = rowsFor(nestedDocument, rootLocation, ['alpha', 'alpha1'])
      expect(moveSelectionTransition(nestedDocument, rootLocation, rows, 'down', 0)).toEqual({
        nodeId: 'alpha1',
        cursor: 0,
      })
      expect(
        moveSelectionTransition(nestedDocument, { ...rootLocation, selectedNodeId: 'alpha1a' }, rows, 'up', 0),
      ).toEqual({ nodeId: 'alpha1', cursor: 0 })
      expect(
        moveSelectionTransition(nestedDocument, { ...rootLocation, selectedNodeId: 'alpha1a' }, rows, 'down', 0),
      ).toEqual({ nodeId: 'alpha2', cursor: 0 })
      expect(
        moveSelectionTransition(nestedDocument, { ...rootLocation, selectedNodeId: 'alpha2' }, rows, 'down', 0),
      ).toEqual({ nodeId: 'beta', cursor: 0 })
      expect(
        moveSelectionTransition(nestedDocument, { ...rootLocation, selectedNodeId: 'missing' }, rows, 'up', 0),
      ).toBeUndefined()
    })

    it('returns no target when a boundary motion would keep the same caret state', () => {
      const rows = rowsFor(nestedDocument, rootLocation)
      expect(moveSelectionTransition(nestedDocument, rootLocation, rows, 'up', 0)).toBeUndefined()
      expect(
        moveSelectionTransition(
          nestedDocument,
          { ...rootLocation, selectedNodeId: 'beta' },
          rows,
          'down',
          'Beta'.length,
        ),
      ).toBeUndefined()
      expect(
        moveSelectionTransition(
          nestedDocument,
          { currentParentId: 'alpha', selectedNodeId: 'alpha' },
          rowsFor(nestedDocument, { currentParentId: 'alpha' }),
          'up',
          0,
        ),
      ).toBeUndefined()
    })

    it('keeps gg anchored to the current-parent heading while G reaches the location’s last visible row', () => {
      const nested: Document = {
        roots: [
          {
            id: 'parent',
            text: 'Parent',
            children: [
              { id: 'child1', text: 'Child one', children: [{ id: 'grand', text: 'Grand', children: [] }] },
              { id: 'child2', text: 'Child two', children: [] },
            ],
          },
        ],
      }
      const location = { currentParentId: 'parent' }
      const collapsedRows = rowsFor(nested, location)
      const atGrandchild = { currentParentId: 'parent', selectedNodeId: 'grand' }
      // gg (boundary 'parent') must stay anchored to the current-parent heading regardless of how
      // deep the focused descendant is, never generalized to the descendant's own real parent.
      expect(moveSelectionBoundaryTransition(nested, atGrandchild, collapsedRows, 'parent', 99)).toEqual({
        nodeId: 'parent',
        cursor: 6,
      })
      // G (boundary 'last') now reaches the location's last visible row. With child1 collapsed,
      // grand is not even visible, and the last visible row is child2 — not grand, which is where
      // the pre-T3 sibling-scoped rule would have left it.
      expect(moveSelectionBoundaryTransition(nested, atGrandchild, collapsedRows, 'last', 99)).toEqual({
        nodeId: 'child2',
        cursor: 9,
      })
      // Expanding child1 makes grand a visible row; G still reaches the location's last visible row
      // (child2), walking past the expanded branch instead of stopping inside it.
      const expandedRows = rowsFor(nested, location, ['child1'])
      expect(moveSelectionBoundaryTransition(nested, atGrandchild, expandedRows, 'last', 99)).toEqual({
        nodeId: 'child2',
        cursor: 9,
      })
      // A count of 2 against the expanded rows reaches the second visible row (grand).
      expect(moveSelectionBoundaryTransition(nested, atGrandchild, expandedRows, 'last', 99, 2)).toEqual({
        nodeId: 'grand',
        cursor: 5,
      })
    })

    it('crosses an expanded branch boundary with the left and right transitions', () => {
      const rows = rowsFor(nestedDocument, rootLocation, ['alpha', 'alpha1'])
      // Leaving the branch downward: alpha1a (the branch's last visible descendant) to alpha2 (the
      // next visible row after the whole branch), not alpha1's own actual next sibling — there is
      // none, since alpha1a is alpha1's child, not its sibling.
      expect(
        moveHorizontalTransition(
          nestedDocument,
          { ...rootLocation, selectedNodeId: 'alpha1a' },
          rows,
          'right',
          'Alpha grandchild'.length,
        ),
      ).toEqual({ nodeId: 'alpha2', cursor: 0 })
      // Entering the branch upward: alpha2 back to alpha1a (the previous visible row), not alpha1's
      // own actual sibling head.
      expect(
        moveHorizontalTransition(nestedDocument, { ...rootLocation, selectedNodeId: 'alpha2' }, rows, 'left', 0),
      ).toEqual({ nodeId: 'alpha1a', cursor: 'Alpha grandchild'.length })
      // alpha1's previous visible row is alpha itself (its real parent), so the ordinary
      // previous-visible-row lookup already reaches it without falling back to the real-parent
      // branch; that fallback only fires from the location's actual first visible row (alpha),
      // covered separately below.
      expect(
        moveHorizontalTransition(nestedDocument, { ...rootLocation, selectedNodeId: 'alpha1' }, rows, 'left', 0),
      ).toEqual({ nodeId: 'alpha', cursor: 'Alpha'.length })
      // The last visible row of the location has no next row: → is a no-op.
      expect(
        moveHorizontalTransition(
          nestedDocument,
          { ...rootLocation, selectedNodeId: 'beta' },
          rows,
          'right',
          'Beta'.length,
        ),
      ).toBeUndefined()
      // The first visible row of a root-level location has no current parent: ← is a no-op.
      expect(moveHorizontalTransition(nestedDocument, rootLocation, rows, 'left', 0)).toBeUndefined()
    })

    it('scopes a dragged descendant’s insertion index to its own real siblings', () => {
      // alpha1 and alpha2 are alpha's real children; dragging alpha1 to insertion index 2 (after
      // alpha2) must land it there among alpha's children, never among the top-level roots.
      const moved = moveNodeTransition(nestedDocument, rootLocation, 'alpha1', 2)
      const alpha = moved?.document.roots.find((node) => node.id === 'alpha')
      expect(alpha?.children.map((node) => node.id)).toEqual(['alpha2', 'alpha1'])
      expect(moved?.document.roots.map((node) => node.id)).toEqual(['alpha', 'beta'])
    })
  })
})
