import { describe, expect, it } from 'vitest'
import type { AgendaRow } from '../application/agenda-rows'
import { agendaListWindow } from './agenda-list-layout'
import { buildLayout, pruneHeights } from './node-list-layout'

const rows: AgendaRow[] = Array.from({ length: 1000 }, (_, day) => ({
  kind: 'node',
  key: `node:${day}:same`,
  nodeId: 'same',
  day,
  depth: 0,
  role: 'match',
  hasProjectedChildren: false,
}))

describe('Agenda occurrence layout', () => {
  it('keeps separate heights for occurrences of one real node and prunes disappeared keys', () => {
    const heights = new Map([
      [rows[0]!.key, 50],
      [rows[1]!.key, 75],
      ['gone', 100],
    ])
    const layout = buildLayout(rows, heights)
    expect([...layout.offsets.slice(0, 4)]).toEqual([0, 50, 125, 150])
    pruneHeights(heights, rows.slice(1))
    expect([...heights]).toEqual([[rows[1]!.key, 75]])
  })
  // @requirement PRODUCT.md §23.6
  it('bounds mounted indices and pins the selected occurrence outside the viewport', () => {
    const layout = buildLayout(rows, new Map())
    const range = agendaListWindow(rows, layout, { start: 5000, end: 5600 }, rows[900]!.key)!
    expect(range.end - range.start).toBeLessThan(60)
    expect(range.pinnedIndex).toBe(900)
    expect(agendaListWindow(rows, layout, { start: 5000, end: 5600 }, rows[210]!.key)?.pinnedIndex).toBeUndefined()
    expect(agendaListWindow(rows.slice(0, 500), layout, { start: 0, end: 600 }, rows[0]!.key)).toBeUndefined()
  })
})
