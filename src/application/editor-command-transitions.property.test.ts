import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { displayedNodes, type Document } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE, expandNode } from './expansion-state'
import {
  moveHorizontalTransition,
  moveSelectionBoundaryTransition,
  moveSelectionTransition,
} from './editor-command-transitions'
import { buildVisibleRows } from './visible-rows'

describe('editor command transition properties', () => {
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
