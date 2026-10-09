import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { AgendaRow } from './agenda-rows'
import { agendaVisualCandidates, agendaVisualSources, agendaVisualTarget } from './agenda-visual-selection'

const row = (id: string, depth: number, role: 'match' | 'context' = 'match', day = 10): AgendaRow => ({
  kind: 'node',
  key: `node:${day}:${id}`,
  nodeId: id,
  depth,
  role,
  day,
  hasProjectedChildren: false,
})

// @requirement PRODUCT.md §23.14
describe('Agenda Visual selection', () => {
  const rows = [
    row('a', 1),
    row('child', 2),
    row('context', 0, 'context'),
    row('b', 1),
    row('c', 1),
    row('a', 1, 'match', 11),
  ]
  it('skips context and other depths and days in forward and reverse ranges', () => {
    const expected = ['a', 'b', 'c'].map((nodeId) => ({ nodeId, day: 10 }))
    expect(agendaVisualSources(rows, 10, { anchorId: 'a', focusId: 'c' })).toEqual(expected)
    expect(agendaVisualSources(rows, 10, { anchorId: 'c', focusId: 'a' })).toEqual(expected)
    expect(agendaVisualSources(rows, 10, { anchorId: 'a', focusId: 'child' })).toEqual([])
    expect(agendaVisualCandidates(rows, 10, 'context')).toEqual([])
    expect(agendaVisualCandidates(rows, 10, 'missing')).toEqual([])
  })
  it('counts qualifying rows and clamps motions at both edges', () => {
    const ends = { anchorId: 'b', focusId: 'b' }
    expect(agendaVisualTarget(rows, 10, ends, 'down', 99)?.nodeId).toBe('c')
    expect(agendaVisualTarget(rows, 10, ends, 'up', 99)?.nodeId).toBe('a')
    expect(agendaVisualTarget(rows, 10, ends, 'first', 1)?.nodeId).toBe('a')
    expect(agendaVisualTarget(rows, 10, ends, 'last', 1)?.nodeId).toBe('c')
    expect(agendaVisualTarget(rows, 10, { anchorId: 'a', focusId: 'missing' }, 'down', 1)).toBeUndefined()
  })
  it('property: skipped rows never enter a range or become a motion target', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ depth: fc.nat(3), match: fc.boolean(), day: fc.constantFrom(10, 11) }), { maxLength: 50 }),
        fc.nat(100),
        (specs, count) => {
          const list = [
            row('anchor', 1),
            ...specs.map((spec, index) => row(`n${index}`, spec.depth, spec.match ? 'match' : 'context', spec.day)),
            row('end', 1),
          ]
          const ends = { anchorId: 'anchor', focusId: 'end' }
          const expected = list.filter(
            (entry) => entry.kind === 'node' && entry.day === 10 && entry.depth === 1 && entry.role === 'match',
          )
          expect(agendaVisualSources(list, 10, ends).map((source) => source.nodeId)).toEqual(
            expected.map((entry) => (entry.kind === 'node' ? entry.nodeId : '')),
          )
          const target = agendaVisualTarget(list, 10, { anchorId: 'anchor', focusId: 'anchor' }, 'down', count)
          expect(target).toBe(expected[Math.min(count, expected.length - 1)])
        },
      ),
    )
  })
})
