import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { projectAgenda } from '../domain/agenda-projection'
import * as projectionModule from '../domain/agenda-projection'
import { editNodeText, type Document } from '../domain/document'
import * as recognition from '../domain/date-recognition'
import { AgendaRowsCache, buildAgendaRows } from './agenda-rows'
import { openAgendaState } from './agenda-state'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
const location = { currentParentId: null, selectedNodeId: 'parent' }
const document: Document = {
  roots: [
    {
      id: 'parent',
      text: 'Context',
      children: [
        { id: 'a', text: '2026-10-14 A', children: [{ id: 'b', text: '2026-10-14 B', children: [] }] },
        { id: 'c', text: '2026-10-14 C', children: [] },
      ],
    },
  ],
}

describe('Agenda rows', () => {
  it('uses stable gap keys and distinguishes children from a following sibling', () => {
    const state = openAgendaState(location, 0, 100)
    const rows = buildAgendaRows(
      [
        {
          day: 120,
          rows: [
            { nodeId: 'a', depth: 0, role: 'match' },
            { nodeId: 'b', depth: 0, role: 'match' },
          ],
        },
      ],
      state,
    )
    expect(rows.find((row) => row.kind === 'gap')).toEqual({
      kind: 'gap',
      key: 'gap:104:119',
      startDay: 104,
      endDay: 119,
      count: 16,
      expanded: false,
    })
    expect(rows.filter((row) => row.kind === 'node').map((row) => row.hasProjectedChildren)).toEqual([false, false])
  })

  it('invalidates semantic cache inputs separately and releases cached rows on clear', () => {
    const node = (id: string, text = '2026-10-14', children: Document['roots'] = []) => ({ id, text, children })
    const initial: Document = { roots: [node('a'), node('b')] }
    const state = openAgendaState(location, 0, today)
    const variants: Document[] = [
      { roots: [node('a'), node('c')] },
      { roots: [node('a'), node('b', 'Context', [node('child')])] },
      { roots: [node('a'), node('b', '2026-10-14', [node('child')])] },
      { roots: [node('a'), node('b', '2026-10-15')] },
      { roots: [node('a'), node('b'), node('c')] },
      { roots: [node('a'), node('b', '2026-10-14 2026-10-20')] },
      { roots: [node('a', '2026-10-14', [node('b')])] },
      { roots: [node('a', 'Context', [node('b')])] },
    ]
    for (const changed of variants) {
      const cache = new AgendaRowsCache()
      const before = cache.get(initial, state)
      const after = cache.get(changed, state)
      expect(after).not.toBe(before)
      expect(after).toEqual(buildAgendaRows(projectAgenda(changed, null), state))
    }
    const cache = new AgendaRowsCache()
    const before = cache.get(initial, state)
    const changedToday = cache.get(initial, { ...state, today: today + 1 })
    expect(changedToday.find((row) => row.kind === 'day' && row.isToday)).toMatchObject({ day: today + 1 })
    const returning = cache.get(initial, state)
    expect(returning).not.toBe(changedToday)
    cache.clear()
    expect(cache.get(initial, state)).not.toBe(returning)
    expect(cache.get(initial, state)).toEqual(before)
  })

  it('notices a changed role with unchanged hierarchy and a changed second date', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const context: Document = {
      roots: [{ id: 'a', text: 'Context', children: [{ id: 'b', text: '2026-10-14 2026-10-20', children: [] }] }],
    }
    const rows = cache.get(context, state)
    const direct = editNodeText(context, 'a', '2026-10-14')
    const changedRole = cache.get(direct, state)
    expect(changedRole).not.toBe(rows)
    expect(changedRole.find((row) => row.kind === 'node' && row.nodeId === 'a')).toMatchObject({ role: 'match' })
    const changedDate = cache.get(editNodeText(direct, 'b', '2026-10-14 2026-10-21'), state)
    expect(changedDate).not.toBe(changedRole)
    expect(changedDate.filter((row) => row.kind === 'node').map((row) => row.day)).not.toContain(today + 12)
  })

  it('builds an empty-scope timeline on the first read and after clearing', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const empty = { roots: [] }
    const rows = cache.get(empty, state)
    expect(rows).toHaveLength(7)
    cache.clear()
    expect(cache.get(empty, state)).toEqual(rows)
    expect(cache.get(empty, state)).not.toBe(rows)
  })
  it('composes timeline and scoped preorder, preserving siblings after a collapsed branch', () => {
    const state = openAgendaState(location, 0, today)
    const projection = projectAgenda(document, null)
    const rows = buildAgendaRows(projection, state)
    const nodes = rows.filter((row) => row.kind === 'node')
    expect(nodes.map((row) => [row.nodeId, row.depth, row.role, row.hasProjectedChildren])).toEqual([
      ['parent', 0, 'context', true],
      ['a', 1, 'match', true],
      ['b', 2, 'match', false],
      ['c', 1, 'match', false],
    ])
    const folded = buildAgendaRows(projection, { ...state, collapsed: new Set([nodes[1]!.key]) })
    expect(folded.filter((row) => row.kind === 'node').map((row) => row.nodeId)).toEqual(['parent', 'a', 'c'])
    const day = rows.find((row) => row.kind === 'day' && row.content)!
    const hidden = buildAgendaRows(projection, { ...state, collapsed: new Set([day.key]) })
    expect(hidden.filter((row) => row.kind === 'node')).toEqual([])
    expect(hidden.find((row) => row.key === day.key)).toMatchObject({ content: true })
  })

  it('reuses rows across selection and unchanged date membership, and invalidates each derived input', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const before = cache.get(document, state)
    expect(cache.get(document, state)).toBe(before)
    expect(cache.get(document, { ...state, selectedKey: 'another' })).toBe(before)
    const edited = editNodeText(document, 'a', '2026-10-14 Changed')
    expect(cache.get(edited, state)).toBe(before)
    expect(cache.get(editNodeText(edited, 'a', '2026-10-15 Changed'), state)).not.toBe(before)
    expect(cache.get(document, { ...state, today: today + 1 })).not.toBe(before)
    expect(cache.get(document, { ...state, revealed: new Set([today + 4]) })).not.toBe(before)
    expect(cache.get(document, { ...state, collapsed: new Set([`day:${today + 6}`]) })).not.toBe(before)
    expect(
      cache
        .get(document, { ...state, scopeParentId: 'a' })
        .filter((row) => row.kind === 'node')
        .map((row) => row.nodeId),
    ).toEqual(['b'])
    cache.clear()
    expect(cache.get(document, state)).toEqual(before)
    expect(cache.get(document, state)).not.toBe(before)
  })

  it('keeps one row array and rescans one node for a same-date keystroke in a wide document', () => {
    const wide: Document = {
      roots: Array.from({ length: 10000 }, (_, index) => ({
        id: String(index),
        text: '2026-10-14 Item',
        children: [],
      })),
    }
    const cache = new AgendaRowsCache()
    const state = openAgendaState({ currentParentId: null, selectedNodeId: '0' }, 0, today)
    const rows = cache.get(wide, state)
    const scan = vi.spyOn(recognition, 'findCanonicalDates')
    const project = vi.spyOn(projectionModule, 'projectAgenda')
    try {
      const edited = editNodeText(wide, '0', '2026-10-14 Item!')
      expect(cache.get(edited, state)).toBe(rows)
      expect(scan).toHaveBeenCalledTimes(1)
      expect(project).toHaveBeenCalledTimes(1)
      scan.mockClear()
      project.mockClear()
      for (let count = 0; count < 100; count++) expect(cache.get(edited, state)).toBe(rows)
      expect(scan).not.toHaveBeenCalled()
      expect(project).not.toHaveBeenCalled()
    } finally {
      scan.mockRestore()
      project.mockRestore()
    }
  })
})
