import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isPendingMoveSource, pendingMoveSources, pendingMoveTargetDay } from './agenda-pending-move'
import type { AgendaRow } from './agenda-rows'

const node = (id: string, day: number, depth: number, role: 'match' | 'context' = 'match'): AgendaRow => ({
  kind: 'node',
  key: `node:${day}:${id}`,
  day,
  nodeId: id,
  depth,
  role,
  hasProjectedChildren: false,
})
const header = (day: number): AgendaRow => ({ kind: 'day', key: `day:${day}`, day, content: true, isToday: false })
const gap: AgendaRow = { kind: 'gap', key: 'gap:20:30', startDay: 20, endDay: 30, count: 11, expanded: false }

// @requirement PRODUCT.md §23.13
describe('pending move sources', () => {
  const rows: AgendaRow[] = [
    header(10),
    node('a', 10, 0, 'context'),
    node('b', 10, 1),
    node('c', 10, 2),
    node('d', 10, 1),
    node('e', 10, 0, 'context'),
    node('f', 10, 1),
    header(11),
    node('g', 11, 1),
  ]
  const ids = (key: string, count: number): string[] =>
    pendingMoveSources(rows, key, count).map((source) => source.nodeId)

  it('marks only the selected direct match without a count', () => {
    expect(pendingMoveSources(rows, 'node:10:b', 1)).toEqual([{ nodeId: 'b', day: 10 }])
  })

  it('adds the next direct matches at the same level and skips other levels and contextual ancestors', () => {
    expect(ids('node:10:b', 2)).toEqual(['b', 'd'])
    // Different real parents may be marked together (D5); the context row `e` between them is skipped.
    expect(ids('node:10:b', 3)).toEqual(['b', 'd', 'f'])
  })

  it('marks the rows that exist when the count exceeds them and stops at the day boundary', () => {
    expect(ids('node:10:b', 99)).toEqual(['b', 'd', 'f'])
    expect(ids('node:10:f', 5)).toEqual(['f'])
  })

  it('marks nothing unless a direct match is selected', () => {
    expect(ids('node:10:a', 1)).toEqual([])
    expect(ids('day:10', 1)).toEqual([])
    expect(pendingMoveSources([header(10), gap], gap.key, 1)).toEqual([])
    expect(ids('missing', 1)).toEqual([])
  })

  it('does not run past a gap', () => {
    const list = [header(10), node('x', 10, 0), gap, header(31), node('y', 31, 0)]
    expect(pendingMoveSources(list, 'node:10:x', 4).map((source) => source.nodeId)).toEqual(['x'])
  })

  // @requirement PRODUCT.md §23.13
  it('property: sources are distinct direct matches of one day at one depth, in row order, at most the count', () => {
    const row = fc.record({
      depth: fc.nat(2),
      role: fc.constantFrom<'match' | 'context'>('match', 'context'),
    })
    fc.assert(
      fc.property(fc.array(row, { minLength: 1, maxLength: 12 }), fc.nat(15), fc.nat(11), (specs, count, pick) => {
        const list = [header(5), ...specs.map((spec, index) => node(`n${index}`, 5, spec.depth, spec.role))]
        const selected = list[1 + (pick % specs.length)]!
        const sources = pendingMoveSources(list, selected.key, count)
        if (selected.kind !== 'node' || selected.role !== 'match') {
          expect(sources).toEqual([])
          return
        }
        expect(sources.length).toBeGreaterThanOrEqual(1)
        expect(sources.length).toBeLessThanOrEqual(Math.max(1, count))
        expect(sources[0]!.nodeId).toBe(selected.nodeId)
        const order = sources.map((source) =>
          list.findIndex((candidate) => candidate.key === `node:5:${source.nodeId}`),
        )
        expect([...order].sort((a, b) => a - b)).toEqual(order)
        expect(new Set(order).size).toBe(order.length)
        for (const index of order) {
          const candidate = list[index]!
          expect(candidate.kind === 'node' && candidate.role === 'match' && candidate.depth === selected.depth).toBe(
            true,
          )
        }
      }),
    )
  })
})

// @requirement PRODUCT.md §23.13
describe('pending move queries', () => {
  it('recognizes only the marked occurrence of a node, not its mirror on another day', () => {
    const agenda = { pendingMove: [{ nodeId: 'a', day: 10 }] }
    expect(isPendingMoveSource(agenda, 'a', 10)).toBe(true)
    expect(isPendingMoveSource(agenda, 'a', 11)).toBe(false)
    expect(isPendingMoveSource(agenda, 'b', 10)).toBe(false)
    expect(isPendingMoveSource({}, 'a', 10)).toBe(false)
    // Any one marked occurrence is enough when several are marked.
    const several = {
      pendingMove: [
        { nodeId: 'a', day: 10 },
        { nodeId: 'b', day: 10 },
      ],
    }
    expect(isPendingMoveSource(several, 'a', 10)).toBe(true)
    expect(isPendingMoveSource(several, 'b', 10)).toBe(true)
    expect(isPendingMoveSource(several, 'c', 10)).toBe(false)
  })

  it('targets the day of a day or node row and nothing for a gap or a missing row', () => {
    expect(pendingMoveTargetDay(header(12))).toBe(12)
    expect(pendingMoveTargetDay(node('a', 13, 0, 'context'))).toBe(13)
    expect(pendingMoveTargetDay(gap)).toBeUndefined()
    expect(pendingMoveTargetDay(undefined)).toBeUndefined()
  })
})
