import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { displayedNodes, moveSubtree, type Document, type TreeNode } from '../domain/document'
import { dragBlock, dropTargetAtGap, dropTargetOnRow, gapLevels, isNoOpDrop, type DropTarget } from './drop-targets'
import { buildVisibleRows } from './visible-rows'

interface RawNode {
  children: RawNode[]
}

function rawNode(depth: number): fc.Arbitrary<RawNode> {
  if (depth === 0) return fc.record<RawNode>({ children: fc.constant<RawNode[]>([]) })
  return fc.record<RawNode>({ children: fc.array(rawNode(depth - 1), { maxLength: 3 }) })
}

const forest = fc.array(rawNode(3), { minLength: 1, maxLength: 4 })

function materialize(rawForest: RawNode[]): Document {
  let counter = 0
  const build = (raw: RawNode): TreeNode => {
    const id = `n${counter++}`
    return { id, text: id, children: raw.children.map(build) }
  }
  return { roots: rawForest.map(build) }
}

function allNodes(document: Document): TreeNode[] {
  const nodes: TreeNode[] = []
  const visit = (node: TreeNode): void => {
    nodes.push(node)
    node.children.forEach(visit)
  }
  document.roots.forEach(visit)
  return nodes
}

/** Reference model: the tree as ordered child-id lists keyed by parent id, with no domain code. */
function childLists(document: Document): Map<string | null, string[]> {
  const lists = new Map<string | null, string[]>([[null, document.roots.map((root) => root.id)]])
  for (const node of allNodes(document))
    lists.set(
      node.id,
      node.children.map((child) => child.id),
    )
  return lists
}

type RowSummary = readonly [id: string, depth: number, parentId: string | null]

function referenceRows(
  lists: ReadonlyMap<string | null, readonly string[]>,
  locationId: string | null,
  expanded: ReadonlySet<string>,
): RowSummary[] {
  const rows: RowSummary[] = []
  const visit = (parentId: string | null, depth: number): void => {
    for (const id of lists.get(parentId)!) {
      rows.push([id, depth, parentId])
      if (lists.get(id)!.length > 0 && expanded.has(id)) visit(id, depth + 1)
    }
  }
  visit(locationId, 0)
  return rows
}

interface Scenario {
  document: Document
  locationId: string | null
  expanded: Set<string>
  rows: ReturnType<typeof buildVisibleRows>
}

const scenario = fc
  .record({
    forest,
    locationSeed: fc.nat(),
    expandedMask: fc.array(fc.boolean(), { minLength: 40, maxLength: 40 }),
  })
  .map(({ forest: raw, locationSeed, expandedMask }): Scenario | undefined => {
    const document = materialize(raw)
    const nodes = allNodes(document)
    const slot = locationSeed % (nodes.length + 1)
    const locationId = slot === nodes.length ? null : nodes[slot]!.id
    const expanded = new Set(nodes.filter((_, index) => expandedMask[index]).map((node) => node.id))
    const rows = buildVisibleRows(displayedNodes(document, locationId), (id) => expanded.has(id), locationId)
    return rows.length === 0 ? undefined : { document, locationId, expanded, rows }
  })

function applyDrop(
  { document, locationId, expanded, rows }: Scenario,
  draggedId: string,
  target: DropTarget,
): { summary: RowSummary[]; expected: RowSummary[]; noOp: boolean } | undefined {
  const result = moveSubtree(document, draggedId, target.parentId, target.index)
  // The generated trees are far shallower than the maximum depth, so a move always fits.
  expect(result.kind).toBe('moved')
  if (result.kind !== 'moved') return undefined

  const lists = childLists(document)
  const from = rows.find((row) => row.node.id === draggedId)!.parentId
  lists.set(
    from,
    lists.get(from)!.filter((id) => id !== draggedId),
  )
  const siblings = lists.get(target.parentId)!
  lists.set(target.parentId, [...siblings.slice(0, target.index), draggedId, ...siblings.slice(target.index)])

  // The receiving fold opens, so the node and the children hidden before it become visible.
  const opened = new Set(expanded)
  if (target.parentId !== null) opened.add(target.parentId)
  const summary = buildVisibleRows(displayedNodes(result.document, locationId), (id) => opened.has(id), locationId).map(
    (row): RowSummary => [row.node.id, row.depth, row.parentId],
  )
  return {
    summary,
    expected: referenceRows(lists, locationId, opened),
    noOp: JSON.stringify(result.document) === JSON.stringify(document),
  }
}

describe('drop target properties', () => {
  it('moves the dragged block to the gap and level that were chosen, and nowhere else', () => {
    fc.assert(
      fc.property(scenario, fc.nat(), fc.nat(), fc.nat(), (value, draggedSeed, gapSeed, levelSeed) => {
        if (value === undefined) return
        const { rows } = value
        const dragged = rows[draggedSeed % rows.length]!
        const block = dragBlock(rows, dragged.node.id)!
        const gap = gapSeed % (rows.length + 1)
        const levels = gapLevels(rows, block, gap)
        if (levels === undefined) {
          expect(gap).toBeGreaterThan(block.start)
          expect(gap).toBeLessThan(block.end)
          for (const level of [0, 1, 2]) expect(dropTargetAtGap(rows, block, gap, level)).toBeUndefined()
          return
        }
        expect(levels.min).toBeLessThanOrEqual(levels.max)
        expect(dropTargetAtGap(rows, block, gap, levels.min - 1)).toBeUndefined()
        expect(dropTargetAtGap(rows, block, gap, levels.max + 1)).toBeUndefined()
        const level = levels.min + (levelSeed % (levels.max - levels.min + 1))
        const target = dropTargetAtGap(rows, block, gap, level)!
        expect(target).toBeDefined()

        const applied = applyDrop(value, dragged.node.id, target)!
        expect(applied.summary).toEqual(applied.expected)
        expect(isNoOpDrop(rows, block, target)).toBe(applied.noOp)

        // The gap and level mean what they say: the rows that stay keep their order, the block is
        // contiguous at the chosen depth, and it sits exactly where the gap is among the rest.
        const finalIds = applied.summary.map(([id]) => id)
        const blockIds = rows.slice(block.start, block.end).map((row) => row.node.id)
        const kept = rows.filter((_, index) => index < block.start || index >= block.end).map((row) => row.node.id)
        const movedAt = finalIds.indexOf(dragged.node.id)
        expect(finalIds.slice(movedAt, movedAt + blockIds.length)).toEqual(blockIds)
        expect(applied.summary[movedAt]![1]).toBe(level)
        const others = finalIds.filter((id) => !blockIds.includes(id))
        expect(others.filter((id) => kept.includes(id))).toEqual(kept)
        const position = gap <= block.start ? gap : gap - blockIds.length
        const before = finalIds.slice(0, movedAt).filter((id) => kept.includes(id))
        expect(before).toEqual(kept.slice(0, position))
      }),
      { numRuns: propertyRuns(300) },
    )
  })

  it('appends to the node dropped on and rejects the dragged block', () => {
    fc.assert(
      fc.property(scenario, fc.nat(), fc.nat(), (value, draggedSeed, rowSeed) => {
        if (value === undefined) return
        const { rows } = value
        const dragged = rows[draggedSeed % rows.length]!
        const block = dragBlock(rows, dragged.node.id)!
        const row = rowSeed % rows.length
        const target = dropTargetOnRow(rows, block, row)
        if (row >= block.start && row < block.end) {
          expect(target).toBeUndefined()
          return
        }
        expect(target).toBeDefined()
        const applied = applyDrop(value, dragged.node.id, target!)!
        expect(applied.summary).toEqual(applied.expected)
        expect(isNoOpDrop(rows, block, target!)).toBe(applied.noOp)
        const final = new Map(applied.summary.map(([id, depth, parentId]) => [id, { depth, parentId }]))
        expect(final.get(dragged.node.id)!.parentId).toBe(rows[row]!.node.id)
        // It is the last child: no later row has the same parent.
        const lastChild = applied.summary.filter(([, , parentId]) => parentId === rows[row]!.node.id).at(-1)!
        expect(lastChild[0]).toBe(dragged.node.id)
      }),
      { numRuns: propertyRuns(200) },
    )
  })
})
