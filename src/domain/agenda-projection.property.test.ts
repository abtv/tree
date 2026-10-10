import fc from 'fast-check'
import { expect, it, vi } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { projectAgenda } from './agenda-projection'
import { dayNumberOf } from './calendar-date'
import * as recognition from './date-recognition'
import type { Document, TreeNode } from './document-types'

const day = (value: number) => dayNumberOf({ year: 2026, month: 10, day: value })

it('includes exactly the matching nodes and proper ancestors in scoped preorder', () => {
  const spec = fc.array(
    fc.record({
      parent: fc.nat(100),
      dates: fc.array(fc.integer({ min: 1, max: 28 }), { maxLength: 4 }),
      linked: fc.boolean(),
    }),
    { maxLength: 20 },
  )
  fc.assert(
    fc.property(spec, fc.nat(100), (entries, scopeChoice) => {
      const nodes = entries.map((entry, index) => {
        const url = `https://example.test/2026-10-${String(entry.dates[0] ?? 1).padStart(2, '0')}`
        return {
          id: String(index),
          text: `${entry.linked ? url + ' ' : ''}${entry.dates.map((date) => `2026-10-${String(date).padStart(2, '0')}`).join(' ')}`,
          ...(entry.linked ? { links: [{ start: 0, end: url.length, url }] } : {}),
          children: [] as TreeNode[],
        }
      })
      const roots: TreeNode[] = []
      nodes.forEach((node, index) => {
        const parent = entries[index]!.parent % (index + 1)
        if (parent === index) roots.push(node)
        else nodes[parent]!.children.push(node)
      })
      const scope = scopeChoice % (nodes.length + 1)
      const scopedRoots = scope === nodes.length ? roots : nodes[scope]!.children
      const preorder: { node: TreeNode; ancestors: TreeNode[] }[] = []
      const walk = (node: TreeNode, ancestors: TreeNode[]): void => {
        preorder.push({ node, ancestors })
        node.children.forEach((child) => walk(child, [...ancestors, node]))
      }
      scopedRoots.forEach((root) => walk(root, []))
      const days = [...new Set(preorder.flatMap(({ node }) => entries[Number(node.id)]!.dates))].sort((a, b) => a - b)
      const expected = days.map((date) => {
        const matches = preorder.filter(({ node }) => entries[Number(node.id)]!.dates.includes(date))
        const included = new Set(matches.flatMap(({ node, ancestors }) => [...ancestors, node].map((item) => item.id)))
        return {
          day: day(date),
          rows: preorder
            .filter(({ node }) => included.has(node.id))
            .map(({ node, ancestors }) => ({
              nodeId: node.id,
              depth: ancestors.length,
              role: entries[Number(node.id)]!.dates.includes(date) ? 'match' : 'context',
            })),
        }
      })
      expect(projectAgenda({ roots }, scope === nodes.length ? null : String(scope))).toEqual(expected)
    }),
    { numRuns: propertyRuns(300) },
  )
})

it('rescans only the replaced root path after a text edit, independent of sibling count', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 20 }), fc.integer({ min: 0, max: 50 }), (depth, width) => {
      const chain = (level: number, text: string): TreeNode => ({
        id: `p${level}`,
        text: level === depth - 1 ? text : '',
        children:
          level === depth - 1
            ? []
            : [
                chain(level + 1, text),
                ...Array.from({ length: width }, (_, index) => ({
                  id: `p${level}-s${index}`,
                  text: '2026-10-20',
                  children: [],
                })),
              ],
      })
      const document: Document = { roots: [chain(0, '2026-10-14')] }
      const edit = (node: TreeNode): TreeNode => ({
        ...node,
        text: node.children.length === 0 ? '2026-10-15' : node.text,
        children: node.children.map((child, index) => (index === 0 ? edit(child) : child)),
      })
      const scan = vi.spyOn(recognition, 'findCanonicalDates')
      try {
        const projection = projectAgenda(document, null)
        scan.mockClear()
        const changed = { roots: [edit(document.roots[0]!)] }
        const edited = projectAgenda(changed, null, { document, projection })
        expect(scan).toHaveBeenCalledTimes(depth)
        expect(edited).toEqual(projectAgenda(changed, null))
        const unchangedDay = projection.find((entry) => entry.day === day(20))
        if (unchangedDay !== undefined) expect(edited.find((entry) => entry.day === day(20))).toBe(unchangedDay)
        expect(edited.some((entry) => entry.day === day(14))).toBe(false)
        expect(edited.find((entry) => entry.day === day(15))!.rows.at(-1)).toEqual({
          nodeId: `p${depth - 1}`,
          depth: depth - 1,
          role: 'match',
        })
        expect(projectAgenda(document, null).some((entry) => entry.day === day(14))).toBe(true)
      } finally {
        scan.mockRestore()
      }
    }),
    { numRuns: propertyRuns(100) },
  )
})
