import { describe, expect, it } from 'vitest'
import type { AgendaRow } from '../application/agenda-rows'
import { agendaDragSource, agendaDropTarget, agendaRowKeyAtPoint } from './agenda-drop-targets'

const dayRow: AgendaRow = { kind: 'day', key: 'day:20375', day: 20375, content: true, isToday: false }
const gapRow: AgendaRow = {
  kind: 'gap',
  key: 'gap:1:5',
  startDay: 1,
  endDay: 5,
  count: 5,
  expanded: false,
}
const nodeRow = (role: 'match' | 'context', day = 20375): AgendaRow => ({
  kind: 'node',
  key: `node:${day}:n`,
  day,
  nodeId: 'n',
  depth: 0,
  role,
  hasProjectedChildren: false,
})

// @requirement PRODUCT.md §23.12
describe('Agenda drag sources and drop targets', () => {
  it('drags only direct matches', () => {
    expect(agendaDragSource(nodeRow('match'))).toEqual({ nodeId: 'n', day: 20375, key: 'node:20375:n' })
    expect(agendaDragSource(nodeRow('context'))).toBeUndefined()
    expect(agendaDragSource(dayRow)).toBeUndefined()
    expect(agendaDragSource(gapRow)).toBeUndefined()
  })

  it('drops on any row of another day, including its header', () => {
    const source = agendaDragSource(nodeRow('match'))!
    expect(agendaDropTarget({ ...dayRow, day: 20376, key: 'day:20376' }, source)).toEqual({ kind: 'day', day: 20376 })
    expect(agendaDropTarget(nodeRow('match', 20376), source)).toEqual({ kind: 'day', day: 20376 })
    expect(agendaDropTarget(nodeRow('context', 20376), source)).toEqual({ kind: 'day', day: 20376 })
  })

  it('treats the source day as a no-op and a gap as invalid', () => {
    const source = agendaDragSource(nodeRow('match'))!
    expect(agendaDropTarget(dayRow, source)).toEqual({ kind: 'none' })
    expect(agendaDropTarget(nodeRow('context'), source)).toEqual({ kind: 'none' })
    expect(agendaDropTarget(gapRow, source)).toEqual({ kind: 'invalid' })
  })

  it('finds the row under the pointer and ignores rows without height', () => {
    const regions = [
      { key: 'a', top: 0, bottom: 20 },
      { key: 'zero', top: 20, bottom: 20 },
      { key: 'b', top: 20, bottom: 40 },
    ]
    expect(agendaRowKeyAtPoint(regions, 0)).toBe('a')
    expect(agendaRowKeyAtPoint(regions, 19.9)).toBe('a')
    expect(agendaRowKeyAtPoint(regions, 20)).toBe('b')
    expect(agendaRowKeyAtPoint(regions, 40)).toBeUndefined()
    expect(agendaRowKeyAtPoint(regions, -1)).toBeUndefined()
  })
})
