import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import { buildVisibleRows } from '../application/visible-rows'
import { siblingBoundaryIndices } from './visible-tree'

interface RawNode {
  children: RawNode[]
}

function rawNode(depth: number): fc.Arbitrary<RawNode> {
  if (depth === 0) return fc.constant({ children: [] })
  return fc.record<RawNode>({ children: fc.array(rawNode(depth - 1), { maxLength: 3 }) })
}

const forest = fc.array(rawNode(3), { minLength: 1, maxLength: 4 })

function materialize(rawForest: RawNode[]): TreeNode[] {
  let counter = 0
  const build = (raw: RawNode): TreeNode => {
    const id = `n${counter++}`
    return { id, text: id, children: raw.children.map(build) }
  }
  return rawForest.map(build)
}

function allIds(nodes: readonly TreeNode[]): string[] {
  const ids: string[] = []
  const visit = (node: TreeNode): void => {
    ids.push(node.id)
    node.children.forEach(visit)
  }
  nodes.forEach(visit)
  return ids
}

interface Ancestry {
  readonly node: TreeNode
  readonly parentId: string | null
  readonly siblingIndex: number
  readonly siblingCount: number
  readonly ancestorIds: readonly string[]
}

function buildAncestry(nodes: readonly TreeNode[]): Map<string, Ancestry> {
  const map = new Map<string, Ancestry>()
  const visit = (level: readonly TreeNode[], parentId: string | null, ancestorIds: readonly string[]): void => {
    level.forEach((node, index) => {
      map.set(node.id, { node, parentId, siblingIndex: index, siblingCount: level.length, ancestorIds })
      visit(node.children, node.id, [...ancestorIds, node.id])
    })
  }
  visit(nodes, null, [])
  return map
}

describe('buildVisibleRows invariants', () => {
  it('holds for arbitrary trees and expansion sets', () => {
    fc.assert(
      fc.property(forest, fc.array(fc.nat(50)), (rawForest, expandedIndices) => {
        const nodes = materialize(rawForest)
        const ids = allIds(nodes)
        const expanded = new Set(expandedIndices.map((index) => ids[index % ids.length]!))
        const ancestry = buildAncestry(nodes)
        const rows = buildVisibleRows(nodes, (id) => expanded.has(id))

        // No node appears twice (preorder over a tree visits each node once).
        const seen = new Set<string>()
        for (const row of rows) {
          expect(seen.has(row.node.id)).toBe(false)
          seen.add(row.node.id)
        }

        // A node is visible exactly when every ancestor above it is expanded.
        const expectedVisible = new Set(
          [...ancestry.entries()]
            .filter(([, entry]) => entry.ancestorIds.every((ancestorId) => expanded.has(ancestorId)))
            .map(([id]) => id),
        )
        expect(seen).toEqual(expectedVisible)

        // Depth, identity, and actual sibling context match the real tree, not the flattened position.
        for (const row of rows) {
          const entry = ancestry.get(row.node.id)!
          expect(row.node).toBe(entry.node)
          expect(row.depth).toBe(entry.ancestorIds.length)
          expect(row.parentId).toBe(entry.parentId)
          expect(row.siblingIndex).toBe(entry.siblingIndex)
          expect(row.siblingCount).toBe(entry.siblingCount)
        }

        // Rows are in preorder: a parent always precedes its own children, which are contiguous.
        const indexOf = new Map(rows.map((row, index) => [row.node.id, index]))
        for (const row of rows) {
          if (row.parentId === null) continue
          expect(indexOf.get(row.parentId)!).toBeLessThan(indexOf.get(row.node.id)!)
        }
      }),
    )
  })

  it('offers exactly one drop boundary more than the real child count, strictly ordered, for every fully expanded parent', () => {
    fc.assert(
      fc.property(forest, (rawForest) => {
        const nodes = materialize(rawForest)
        const rows = buildVisibleRows(nodes, () => true)
        const ancestry = buildAncestry(nodes)
        const realParentIds = new Set<string | null>([null, ...[...ancestry.values()].map((entry) => entry.node.id)])
        for (const parentId of realParentIds) {
          const childCount = parentId === null ? nodes.length : (ancestry.get(parentId)?.node.children.length ?? 0)
          if (childCount === 0) continue
          const boundaries = siblingBoundaryIndices(rows, parentId)
          expect(boundaries).toHaveLength(childCount + 1)
          for (let index = 1; index < boundaries.length; index += 1) {
            expect(boundaries[index]!).toBeGreaterThan(boundaries[index - 1]!)
          }
          // Every boundary but the last is exactly the start of a real child's own row, in order; the
          // last sits strictly after the final child's own start (its whole visible block).
          const childStarts = rows.reduce<number[]>((acc, row, index) => {
            if (row.parentId === parentId) acc.push(index)
            return acc
          }, [])
          expect(boundaries.slice(0, -1)).toEqual(childStarts)
          expect(boundaries[boundaries.length - 1]!).toBeGreaterThan(childStarts[childStarts.length - 1]!)
        }
      }),
    )
  })

  it('costs one row per collapsed subtree no matter how large that subtree is', () => {
    let counter = 0
    const build = (depth: number): TreeNode => {
      const id = `deep${counter++}`
      return { id, text: id, children: depth === 0 ? [] : [build(depth - 1)] }
    }
    const collapsedSubtree = build(200)
    const rows = buildVisibleRows([collapsedSubtree], () => false)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.node).toBe(collapsedSubtree)
  })
})
