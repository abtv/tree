import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { assertDocument, displayedNodes, locateNode, type Document, type TreeNode } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE, expandNode } from './expansion-state'
import {
  moveHorizontalTransition,
  moveSelectionBoundaryTransition,
  moveSelectionTransition,
  openBelowTransition,
  createSiblingOrFirstChildTransition,
  deleteEmptySelectedTransition,
  deletePreviousEmptyTransition,
} from './editor-command-transitions'
import { buildVisibleRows } from './visible-rows'
import { pasteNodeForestTransition } from './editor-node-visual-transitions'

function countNodes(nodes: readonly TreeNode[]): number {
  return nodes.reduce((total, node) => total + 1 + countNodes(node.children), 0)
}

describe('editor command transition properties', () => {
  it('puts ordered fresh copies under a heading while preserving its children and location', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 5 }),
        fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 1, max: 4 }),
        fc.boolean(),
        (existing, incoming, repeat, past) => {
          const children = existing.map((text, index) => ({ id: `child-${index}`, text, children: [] }))
          const parent = { id: 'parent', text: 'Parent', children }
          const document = { roots: [parent] }
          const source = incoming.map((text, index) => ({
            id: `source-${index}`,
            text,
            children: [{ id: `nested-${index}`, text: 'Nested', children: [] }],
          }))
          let sequence = 0
          const result = pasteNodeForestTransition(
            document,
            {
              currentParentId: 'parent',
              selectedNodeId: 'parent',
            },
            'parent',
            'after',
            { nodes: source, sourceIds: [] },
            () => `copy-${++sequence}`,
            repeat,
            past,
          )
          if (result.kind === 'rejected') throw new Error(result.message)
          assertDocument(result.document)
          const copies = result.document.roots[0]!.children
          expect(copies.map((node) => node.text)).toEqual([
            ...Array.from({ length: repeat }, () => incoming).flat(),
            ...existing,
          ])
          expect(copies.slice(incoming.length * repeat)).toEqual(children)
          expect(sequence).toBe(incoming.length * repeat * 2)
          expect(result.location).toEqual({
            currentParentId: 'parent',
            selectedNodeId: past ? (children[0] ?? copies[incoming.length * repeat - 1]!).id : copies[0]!.id,
          })
          expect(result.focus).toEqual({ nodeId: result.location.selectedNodeId, cursor: 0 })
          expect(document.roots[0]).toBe(parent)
          expect(document.roots[0]!.children).toBe(children)
        },
      ),
    )
  })
  it('opens below at the visible level while preserving existing subtrees and identities', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 8 }),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('o', 'Enter'),
        (texts, expanded, focused, command) => {
          const branch: TreeNode = {
            id: 'branch',
            text: 'Branch',
            children: texts.map((text, index) => ({ id: `child-${index}`, text, children: [] })),
          }
          const siblings = [branch, { id: 'next', text: 'Next', children: [] }]
          const document: Document = {
            roots: focused ? [{ id: 'scope', text: 'Scope', children: siblings }] : siblings,
          }
          const location = { currentParentId: focused ? 'scope' : null, selectedNodeId: 'branch' }
          const result =
            command === 'o'
              ? openBelowTransition(document, location, () => 'new', expanded)
              : createSiblingOrFirstChildTransition(document, location, branch.text.length, () => 'new', expanded)
          if (!('document' in result)) throw new Error('Expected creation.')
          assertDocument(result.document)
          const created = locateNode(result.document, 'new')!
          expect(created.parent?.id ?? null).toBe(expanded ? 'branch' : location.currentParentId)
          expect(created.siblings.map((node) => node.id)).toEqual(
            expanded ? ['new', ...branch.children.map((node) => node.id)] : ['branch', 'new', 'next'],
          )
          expect(locateNode(result.document, 'branch')!.node.children.filter((node) => node.id !== 'new')).toEqual(
            branch.children,
          )
          expect(locateNode(result.document, 'next')!.node).toBe(siblings[1])
          expect(result.location).toEqual({ ...location, selectedNodeId: 'new' })
          expect(result.focus).toEqual({ nodeId: 'new', cursor: 0 })
        },
      ),
    )
  })

  it('removes exactly one preceding blank without changing the current subtree at any displayed depth', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: 10 }), (texts) => {
        const current: TreeNode = {
          id: 'current',
          text: 'Current',
          children: [{ id: 'kept', text: 'Kept', children: [] }],
        }
        const blank: TreeNode = { id: 'blank', text: '', children: [] }
        let branch: TreeNode = { id: 'parent', text: 'Parent', children: [blank, current] }
        for (const [index, text] of texts.entries()) branch = { id: `ancestor-${index}`, text, children: [branch] }
        const document: Document = { roots: [branch] }
        const location = { currentParentId: branch.id, selectedNodeId: current.id }
        const result = deletePreviousEmptyTransition(document, location, 0, () => true)!
        assertDocument(result.document)
        expect(locateNode(result.document, 'blank')).toBeUndefined()
        expect(locateNode(result.document, 'current')!.node).toEqual(current)
        expect(locateNode(result.document, 'parent')!.node.children).toEqual([current])
        expect(result.location).toEqual(location)
        expect(result.focus).toEqual({ nodeId: 'current', cursor: 0 })
        expect(deletePreviousEmptyTransition(result.document, result.location, 0, () => true)).toBeUndefined()
      }),
    )
  })

  it('deletes only the empty subtree and focuses the preceding visible row at its text end', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ text: fc.string(), expanded: fc.boolean() }), { minLength: 1, maxLength: 10 }),
        fc.boolean(),
        (ancestors, focused) => {
          let branch: TreeNode = { id: 'leaf', text: 'Last child', children: [] }
          const expanded = new Set<string>()
          for (const [index, ancestor] of ancestors.entries()) {
            const id = `branch-${index}`
            branch = { id, text: ancestor.text, children: [branch] }
            if (ancestor.expanded) expanded.add(id)
          }
          const siblings: TreeNode[] = [
            branch,
            { id: 'empty', text: '', children: [{ id: 'removed-child', text: 'Removed', children: [] }] },
          ]
          const document: Document = {
            roots: focused ? [{ id: 'scope', text: 'Scope', children: siblings }] : siblings,
          }
          const currentParentId = focused ? 'scope' : null
          const rows = buildVisibleRows(siblings, (id) => expanded.has(id))
          const emptyIndex = rows.findIndex((row) => row.node.id === 'empty')
          const target = rows[emptyIndex - 1]!.node
          const result = deleteEmptySelectedTransition(document, { currentParentId, selectedNodeId: 'empty' }, (id) =>
            expanded.has(id),
          )
          expect(result?.focus).toEqual({ nodeId: target.id, cursor: target.text.length })
          expect(result?.location).toEqual({ currentParentId, selectedNodeId: target.id })
          expect(displayedNodes(result!.document, currentParentId)).toEqual([branch])
          assertDocument(result!.document)
        },
      ),
    )
  })

  it('keeps repeated empty creation before following siblings at the same level', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 8 }),
        fc.constantFrom('o', 'Enter'),
        (texts, command) => {
          const following = texts.map((text, index) => ({ id: `next-${index}`, text, children: [] }))
          let document: Document = {
            roots: [
              { id: 'parent', text: 'Parent', children: [{ id: 'empty', text: '', children: [] }, ...following] },
            ],
          }
          let selectedNodeId = 'empty'
          for (let index = 0; index < 3; index++) {
            const id = `created-${index}`
            const location = { currentParentId: null, selectedNodeId }
            const result =
              command === 'o'
                ? openBelowTransition(document, location, () => id)
                : createSiblingOrFirstChildTransition(document, location, 0, () => id)
            if (!('document' in result)) throw new Error('Expected creation.')
            assertDocument(result.document)
            expect(result.document.roots).toHaveLength(1)
            const children = result.document.roots[0]!.children
            expect(children[index]!.id).toBe(selectedNodeId)
            expect(children[index + 1]).toEqual({ id, text: '', children: [] })
            expect(children.slice(index + 2)).toEqual(following)
            expect(result.focus).toEqual({ nodeId: id, cursor: 0 })
            expect(result.location).toEqual({ ...location, selectedNodeId: id })
            document = result.document
            selectedNodeId = id
          }
        },
      ),
    )
  })

  it('moves a last empty leaf left with repeated o or Enter without creating nodes, up to the location boundary', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        fc.boolean(),
        fc.constantFrom('o', 'Enter'),
        (texts, focused, command) => {
          let branch: TreeNode = { id: 'empty', text: '', children: [] }
          for (const [index, text] of texts.entries()) {
            branch = { id: `parent-${index}`, text, children: [branch] }
          }
          let document: Document = { roots: [branch] }
          const currentParentId = focused ? branch.id : null
          const nodeCount = texts.length + 1
          for (let index = 0; index < texts.length + 2; index++) {
            const before = document
            const selected = locateNode(before, 'empty')!
            const movesLeft = selected.parent !== null && selected.parent.id !== currentParentId
            const createId = vi.fn(() => 'created')
            const location = { currentParentId, selectedNodeId: 'empty' }
            const result =
              command === 'o'
                ? openBelowTransition(before, location, createId)
                : createSiblingOrFirstChildTransition(before, location, 0, createId)
            if (!('document' in result)) throw new Error('Expected a transition.')
            assertDocument(result.document)
            const after = locateNode(result.document, 'empty')!
            if (movesLeft) {
              expect(createId).not.toHaveBeenCalled()
              const parent = locateNode(before, selected.parent!.id)!
              expect(after.parent?.id ?? null).toBe(parent.parent?.id ?? null)
              expect(after.index).toBe(parent.index + 1)
            } else {
              expect(createId).toHaveBeenCalledTimes(1)
            }
            expect(result.location).toEqual({ currentParentId, selectedNodeId: movesLeft ? 'empty' : 'created' })
            if (!movesLeft) break
            document = result.document
            expect(locateNode(document, 'empty')!.node).toEqual({ id: 'empty', text: '', children: [] })
            expect(countNodes(document.roots)).toBe(nodeCount)
          }
        },
      ),
    )
  })

  it('moves the last-node boundary onto an image when the target has one', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ text: fc.string(), hasAttachment: fc.boolean() }), { minLength: 1, maxLength: 10 }),
        fc.nat(),
        (nodes, cursor) => {
          const document = {
            roots: nodes.map((node, index) => ({
              id: `node-${index}`,
              text: node.text,
              ...(node.hasAttachment
                ? { attachment: { id: `attachment-${index}`, mimeType: 'image/png' as const } }
                : {}),
              children: [],
            })),
          }
          const target = nodes[nodes.length - 1]!
          const rows = buildVisibleRows(document.roots, () => false)
          const focus = moveSelectionBoundaryTransition(
            document,
            { currentParentId: null, selectedNodeId: 'node-0' },
            rows,
            'last',
            cursor,
          )

          expect(focus).toEqual({
            nodeId: `node-${nodes.length - 1}`,
            cursor: target.hasAttachment ? target.text.length : Math.min(cursor, target.text.length),
          })
        },
      ),
    )
  })

  it('walks every visible row exactly once down and back up', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ childCount: fc.integer({ min: 0, max: 3 }), expanded: fc.boolean() }), {
          minLength: 1,
          maxLength: 8,
        }),
        (branches) => {
          const document: Document = {
            roots: [
              {
                id: 'parent',
                text: 'Parent',
                children: branches.map((branch, index) => ({
                  id: `child-${index}`,
                  text: `Child ${index}`,
                  children: Array.from({ length: branch.childCount }, (_, childIndex) => ({
                    id: `grand-${index}-${childIndex}`,
                    text: `Grand ${index}-${childIndex}`,
                    children: [],
                  })),
                })),
              },
            ],
          }
          let expansion = COLLAPSED_EXPANSION_STATE
          branches.forEach((branch, index) => {
            if (branch.expanded && branch.childCount > 0) expansion = expandNode(expansion, `child-${index}`)
          })
          const rows = buildVisibleRows(displayedNodes(document, 'parent'), (id) => expansion.expandedIds.has(id))
          const traverse = (direction: 'up' | 'down', start: string) => {
            const visited = [start]
            let selectedNodeId = start
            for (let index = 0; index < rows.length; index += 1) {
              if (direction === 'up' && selectedNodeId === rows[0]!.node.id) break
              if (direction === 'down' && selectedNodeId === rows[rows.length - 1]!.node.id) break
              const result = moveSelectionTransition(
                document,
                { currentParentId: 'parent', selectedNodeId },
                rows,
                direction,
                0,
              )
              if (result === undefined || result.nodeId === selectedNodeId) break
              selectedNodeId = result.nodeId
              visited.push(selectedNodeId)
            }
            return visited
          }
          const down = traverse('down', rows[0]!.node.id)
          expect(down).toEqual(rows.map((row) => row.node.id))
          expect(traverse('up', rows[rows.length - 1]!.node.id)).toEqual([...rows].reverse().map((row) => row.node.id))
          expect(
            moveSelectionTransition(
              document,
              { currentParentId: 'parent', selectedNodeId: rows[0]!.node.id },
              rows,
              'up',
              0,
            ),
          ).toEqual({ nodeId: 'parent', cursor: 0 })
        },
      ),
    )
  })

  it('agrees with the vertical and G targets from any visible row', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ childCount: fc.integer({ min: 0, max: 3 }), expanded: fc.boolean() }), {
          minLength: 1,
          maxLength: 8,
        }),
        (branches) => {
          const document: Document = {
            roots: [
              {
                id: 'parent',
                text: 'Parent',
                children: branches.map((branch, index) => ({
                  id: `child-${index}`,
                  text: `Child ${index}`,
                  children: Array.from({ length: branch.childCount }, (_, childIndex) => ({
                    id: `grand-${index}-${childIndex}`,
                    text: `Grand ${index}-${childIndex}`,
                    children: [],
                  })),
                })),
              },
            ],
          }
          let expansion = COLLAPSED_EXPANSION_STATE
          branches.forEach((branch, index) => {
            if (branch.expanded && branch.childCount > 0) expansion = expandNode(expansion, `child-${index}`)
          })
          const rows = buildVisibleRows(displayedNodes(document, 'parent'), (id) => expansion.expandedIds.has(id))
          const location = { currentParentId: 'parent' }

          for (const row of rows) {
            const at = { ...location, selectedNodeId: row.node.id }
            const cursor = row.node.text.length
            // → at the end of the text reaches the same node ↓ reaches (both undefined at the last
            // visible row, since ↓ clamps there and → simply has no next row).
            const down = moveSelectionTransition(document, at, rows, 'down', cursor)
            const right = moveHorizontalTransition(document, at, rows, 'right', cursor)
            expect(right?.nodeId).toBe(down?.nodeId)
            // ← at the beginning reaches the same node ↑ reaches, including the shared heading
            // fallback from the first visible row.
            const up = moveSelectionTransition(document, at, rows, 'up', 0)
            const left = moveHorizontalTransition(document, at, rows, 'left', 0)
            expect(left?.nodeId).toBe(up?.nodeId)
          }

          // G with no count reaches the same node repeated ↓ settles on: the location's last row.
          const g = moveSelectionBoundaryTransition(
            document,
            { ...location, selectedNodeId: rows[0]!.node.id },
            rows,
            'last',
            0,
          )
          expect(g?.nodeId).toBe(rows[rows.length - 1]!.node.id)
        },
      ),
    )
  })
})
