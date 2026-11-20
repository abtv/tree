import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { projectAgenda } from '../domain/agenda-projection'
import * as projectionModule from '../domain/agenda-projection'
import { editNodeText, type Document } from '../domain/document'
import * as recognition from '../domain/date-recognition'
import { agendaAncestorKeys, agendaProjection, AgendaRowsCache, buildAgendaRows } from './agenda-rows'
import { openAgendaState, focusAgendaState, applyAgendaCommand, dayKey, overdueKey } from './agenda-state'
import { reconcileAgenda } from './agenda-reconcile'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'
import { COLLAPSED_EXPANSION_STATE } from './expansion-state'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
const location = { currentParentId: null, selectedNodeId: 'parent' }
const document: Document = {
  roots: [
    {
      id: 'parent',
      text: 'Context',
      children: [
        { id: 'a', text: '2026-10-09 A', children: [{ id: 'b', text: '2026-10-09 B', children: [] }] },
        { id: 'c', text: '2026-10-09 C', children: [] },
      ],
    },
  ],
}

describe('Agenda rows', () => {
  it.each([
    [false, true, 1],
    [true, false, 1],
    [true, true, 0],
  ] as const)(
    'shows an undated pin according to finished-task visibility (%s, finished %s)',
    (hide, finished, count) => {
      const source: Document = {
        roots: [{ id: 'parent', text: 'Undated', children: [], ...(finished ? { struckThrough: true } : {}) }],
      }
      const state = {
        ...openAgendaState(location, 0, today),
        hideFinishedTasks: hide,
        selectedKey: `node:${today}:parent`,
        activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'parent', day: today } },
      }
      const cache = new AgendaRowsCache()

      const rows = cache.get(source, state)
      const projection = cache.getProjection(source, state)

      expect(rows.filter((row) => row.kind === 'node')).toHaveLength(count)
      expect(projection.flatMap((day) => day.rows)).toHaveLength(count)
      expect(rows.find((row) => row.key === dayKey(today))).toMatchObject({ content: count > 0 })
    },
  )

  // @requirement PRODUCT.md §23.2
  // @requirement PRODUCT.md §23.3
  // @requirement PRODUCT.md §23.15
  it('groups overdue siblings across dates and repeats paths in separate days and focused days', () => {
    const source: Document = {
      roots: [
        {
          id: 'parent',
          text: 'Work',
          children: [
            { id: 'a', text: '2026-10-01 2026-10-08 2026-10-09', children: [] },
            { id: 'b', text: '2026-10-02 2026-10-08', children: [] },
          ],
        },
      ],
    }
    const state = openAgendaState(location, 0, today)
    const cache = new AgendaRowsCache()

    const rows = cache.get(source, state)
    const paths = rows.filter((row) => row.kind === 'path')

    expect(paths.map((row) => row.parentId)).toEqual(['parent', 'parent', 'parent'])
    expect(paths[0]!.groupKey).toBe(overdueKey(state.weekStart))
    expect(rows.filter((row) => row.kind === 'node').map((row) => row.nodeId)).toEqual(['a', 'b', 'a', 'b', 'a'])

    const selected = applyAgendaCommand(state, { kind: 'select', key: paths[0]!.key }, rows)
    const shifted = applyAgendaCommand(selected, { kind: 'shift-week', direction: 1 }, rows)

    expect(shifted.selectedKey).toBe(dayKey(state.weekStart + 7))

    const focused = cache.get(source, focusAgendaState(state, today, 0))

    expect(focused.map((row) => row.kind)).toEqual(['day', 'path', 'node', 'node'])
    expect(focused.filter((row) => row.kind === 'path').map((row) => row.parentId)).toEqual(['parent'])
  })

  // @requirement PRODUCT.md §23.5
  it('refreshes rows for equal-size overlapping fold sets', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = {
      roots: [
        { id: 'parent', text: '2026-10-05', children: [] },
        { id: 'tuesday', text: '2026-10-06', children: [] },
        { id: 'wednesday', text: '2026-10-07', children: [] },
      ],
    }
    const monday = dayKey(state.weekStart)
    const tuesday = dayKey(state.weekStart + 1)
    const wednesday = dayKey(state.weekStart + 2)
    const cache = new AgendaRowsCache()
    const before = cache.get(source, { ...state, collapsed: new Set([monday, tuesday]) })

    const after = cache.get(source, { ...state, collapsed: new Set([monday, wednesday]) })

    expect(before.filter((row) => row.kind === 'node').map((row) => row.nodeId)).toEqual(['wednesday'])
    expect(after.filter((row) => row.kind === 'node').map((row) => row.nodeId)).toEqual(['tuesday'])
  })

  // @requirement PRODUCT.md §23.3
  it.each([false, true])('refreshes overdue rows and search after completion changes from %s', (struckThrough) => {
    const state = openAgendaState(location, 0, today)
    const node = { id: 'parent', text: '2026-10-04', children: [] }
    const source: Document = { roots: [{ ...node, ...(struckThrough ? { struckThrough: true as const } : {}) }] }
    const cache = new AgendaRowsCache()

    expect(cache.get(source, state).some((row) => row.kind === 'node')).toBe(!struckThrough)
    expect(cache.getProjection(source, state).flatMap((day) => day.rows)).toHaveLength(struckThrough ? 0 : 1)

    const edited: Document = { roots: [{ ...node, ...(!struckThrough ? { struckThrough: true as const } : {}) }] }

    expect(cache.get(edited, state).some((row) => row.kind === 'node')).toBe(struckThrough)
    expect(cache.getProjection(edited, state).flatMap((day) => day.rows)).toHaveLength(struckThrough ? 1 : 0)
  })

  // @requirement PRODUCT.md §23.3
  // @requirement PRODUCT.md §23.4
  it('replaces cached headings between two empty past weeks with equal row counts', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = { roots: [{ id: 'parent', text: 'Undated', children: [] }] }
    const cache = new AgendaRowsCache()
    const previous = applyAgendaCommand(state, { kind: 'shift-week', direction: -1 }, cache.get(source, state))
    const before = cache.get(source, previous)

    const earlier = applyAgendaCommand(previous, { kind: 'shift-week', direction: -1 }, before)
    const after = cache.get(source, earlier)

    expect(after).not.toBe(before)
    expect(after.filter((row) => row.kind === 'day').map((row) => row.day)).toEqual(
      Array.from({ length: 7 }, (_, index) => earlier.weekStart + index),
    )
  })

  // @requirement PRODUCT.md §23.3
  // @requirement PRODUCT.md §23.7
  it('restores the earliest overdue date after leaving an active occurrence with same-day peers', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = {
      roots: [
        { id: 'old', text: '2026-10-04 task', children: [] },
        { id: 'peer', text: '2026-10-04 peer', children: [] },
        { id: 'older-peer', text: '2026-09-15 peer', children: [] },
      ],
    }
    const cache = new AgendaRowsCache()
    const rows = cache.get(source, state)
    const row = rows.find((entry) => entry.kind === 'node' && entry.nodeId === 'old')!
    const selected = applyAgendaCommand(state, { kind: 'select', key: row.key }, rows)
    const edited = editNodeText(source, 'old', '2026-09-01 2026-10-04 task')
    const active = reconcileAgenda(edited, selected, false, cache)!
    const dates = (state: typeof active) =>
      cache.getProjection(edited, state).map((day) => [day.day, day.rows.map((entry) => entry.nodeId)])

    expect(dates(active)).toEqual([
      [dayNumberOf({ year: 2026, month: 9, day: 15 }), ['older-peer']],
      [row.day, ['old', 'peer']],
    ])

    const left = applyAgendaCommand(active, { kind: 'select', key: dayKey(today) }, cache.get(edited, active))

    expect(dates(left)).toEqual([
      [dayNumberOf({ year: 2026, month: 9, day: 1 }), ['old']],
      [dayNumberOf({ year: 2026, month: 9, day: 15 }), ['older-peer']],
      [row.day, ['peer']],
    ])
    expect(cache.get(edited, left).filter((entry) => entry.kind === 'node')).toHaveLength(3)
  })

  // @requirement PRODUCT.md §20.2.26
  // @requirement PRODUCT.md §23.7
  it('updates the searchable day when a lone node changes date within the same week', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = { roots: [{ id: 'parent', text: '2026-10-05 task', children: [] }] }
    const cache = new AgendaRowsCache()

    expect(cache.getProjection(source, state).map((entry) => entry.day)).toEqual([state.weekStart])

    const edited = editNodeText(source, 'parent', '2026-10-06 task')

    expect(cache.getProjection(edited, state).map((entry) => entry.day)).toEqual([state.weekStart + 1])
    expect(cache.get(edited, state).filter((entry) => entry.kind === 'node')).toMatchObject([
      { nodeId: 'parent', day: state.weekStart + 1 },
    ])
  })

  // @requirement PRODUCT.md §20.2.26
  // @requirement PRODUCT.md §23.3
  it('includes Monday and overdue dates but excludes the following Monday even with an active Monday occurrence', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = { roots: [{ id: 'parent', text: '2026-10-04 2026-10-05 2026-10-12', children: [] }] }
    const cache = new AgendaRowsCache()
    const projectedDays = () => cache.getProjection(source, state).map((entry) => entry.day)

    expect(projectedDays()).toEqual([state.weekStart - 1, state.weekStart])

    const rows = cache.get(source, state)
    const selected = applyAgendaCommand(state, { kind: 'select', key: `node:${state.weekStart}:parent` }, rows)

    expect(cache.getProjection(source, selected).map((entry) => entry.day)).toEqual([
      state.weekStart - 1,
      state.weekStart,
    ])
    expect(cache.get(source, selected).filter((entry) => entry.kind === 'node')).toHaveLength(2)
  })

  // @requirement PRODUCT.md §23.3
  it('resolves reveal folds for overdue, ordinary-week and focused-day occurrences', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = { roots: [{ id: 'parent', text: '2026-10-04 2026-10-05', children: [] }] }
    const projection = projectAgenda(source, null)
    const overdue = { nodeId: 'parent', day: state.weekStart - 1 }

    expect(agendaAncestorKeys(projection, overdue, state)).toEqual([overdueKey(state.weekStart)])
    expect(agendaAncestorKeys(projection, { ...overdue, day: state.weekStart }, state)).toEqual([
      dayKey(state.weekStart),
    ])
    expect(agendaAncestorKeys(projection, overdue, { ...state, weekStart: state.weekStart - 7 })).toEqual([
      dayKey(overdue.day),
    ])
    expect(agendaAncestorKeys(projection, overdue, focusAgendaState(state, overdue.day, 0))).toEqual([
      dayKey(overdue.day),
    ])
  })

  it('keeps Overdue folds independent of Sunday and preserves active dates after an earlier date is added', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = { roots: [{ id: 'old', text: '2026-10-04 task', children: [] }] }
    const cache = new AgendaRowsCache()
    const rows = cache.get(source, state)
    const row = rows.find((entry) => entry.kind === 'node')!
    const selected = applyAgendaCommand(state, { kind: 'select', key: row.key }, rows)
    const folded = applyAgendaCommand(selected, { kind: 'toggle-fold', key: rows[0]!.key }, rows)

    expect(folded.collapsed.has(`day:${state.weekStart - 1}`)).toBe(false)
    expect(
      cache.get(source, { ...folded, weekStart: state.weekStart - 7 }).some((entry) => entry.kind === 'node'),
    ).toBe(true)

    const edited = editNodeText(source, 'old', '2026-10-04 task 2026-09-01')
    const reconciled = reconcileAgenda(edited, selected, false, cache)!

    expect(reconciled.selectedKey).toBe(row.key)
    expect(cache.get(edited, reconciled).filter((entry) => entry.kind === 'node')).toHaveLength(1)
    expect(cache.getProjection(edited, reconciled).map((day) => day.day)).toEqual([row.day])

    const focused = focusAgendaState(reconciled, today, 0)

    expect(cache.getProjection(edited, focused)).toEqual([])
    expect(cache.getProjection(edited, reconciled).map((day) => day.day)).toEqual([row.day])
  })

  it('keeps remaining overdue matches when the old active date only matches a descendant', () => {
    const source: Document = {
      roots: [
        {
          id: 'parent',
          text: '2026-10-04 Parent',
          children: [{ id: 'child', text: '2026-10-04 Child', children: [] }],
        },
      ],
    }
    const cache = new AgendaRowsCache()
    const open = openAgendaState(location, 0, today)
    const originalDay = dayNumberOf({ year: 2026, month: 10, day: 4 })
    const remainingDay = dayNumberOf({ year: 2026, month: 9, day: 1 })
    const selected = applyAgendaCommand(
      open,
      { kind: 'select', key: `node:${originalDay}:parent` },
      cache.get(source, open),
    )
    expect(selected.selectedKey).toBe(`node:${originalDay}:parent`)
    const edited = editNodeText(source, 'parent', '2026-09-01 Parent')

    const projection = cache.getProjection(edited, selected)

    expect(projection.map(({ day, rows }) => [day, rows.map(({ nodeId }) => nodeId)])).toEqual([
      [remainingDay, ['parent']],
      [originalDay, ['child']],
    ])
  })

  it('shows distinct unfinished overdue nodes only in the current week and updates after strikethrough', () => {
    const state = openAgendaState(location, 0, today)
    const source: Document = {
      roots: [
        {
          id: 'parent',
          text: 'Parent',
          children: [
            { id: 'old', text: '2026-09-01 2026-09-02', children: [] },
            { id: 'done', text: '2026-09-01', struckThrough: true, children: [] },
          ],
        },
        { id: 'this-week', text: '2026-10-05', children: [] },
      ],
    }
    const cache = new AgendaRowsCache()

    const rows = cache.get(source, state)

    expect(rows[0]).toMatchObject({ kind: 'day', overdue: true, isToday: false })
    expect(
      rows
        .filter((row) => row.kind === 'node')
        .filter((row) => row.groupKey !== undefined)
        .map((row) => row.nodeId),
    ).toEqual(['old'])
    const old = rows.find((row) => row.kind === 'node' && row.nodeId === 'old')!

    expect(old).toMatchObject({ role: 'match' })

    const selected = applyAgendaCommand(state, { kind: 'select', key: old.key }, rows)
    const folded = applyAgendaCommand(selected, { kind: 'toggle-fold', key: rows[0]!.key }, rows)

    expect(folded.selectedKey).toBe(rows[0]!.key)
    expect(cache.get(source, folded).some((row) => row.kind === 'node' && row.nodeId === 'old')).toBe(false)
    expect(applyAgendaCommand(selected, { kind: 'shift-week', direction: -1 }, rows).weekStart).toBe(
      state.weekStart - 7,
    )
    for (const offset of [-7, 7]) {
      expect(
        cache
          .get(source, { ...state, weekStart: state.weekStart + offset })
          .some((row) => row.kind === 'day' && row.overdue),
      ).toBe(false)
    }
    expect(cache.get(source, focusAgendaState(state, today, 0)).some((row) => row.kind === 'day' && row.overdue)).toBe(
      false,
    )

    const completed: Document = {
      roots: [
        { ...source.roots[0]!, children: source.roots[0]!.children.map((node) => ({ ...node, struckThrough: true })) },
        source.roots[1]!,
      ],
    }
    cache.get(source, state)

    expect(cache.get(completed, state).some((row) => row.kind === 'day' && row.overdue)).toBe(false)
  })

  it('does not enumerate unchanged folds during repeated caret publications', () => {
    const cache = new AgendaRowsCache()
    const collapsed = new Set(Array.from({ length: 10000 }, (_, index) => `day:${today + index}`))
    const state = { ...openAgendaState(location, 0, today), collapsed }
    const rows = cache.get(document, state)
    const iterator = vi.spyOn(collapsed, Symbol.iterator)

    for (let index = 0; index < 30; index++) {
      expect(cache.get(document, { ...state, selectionCursor: index })).toBe(rows)
    }

    expect(iterator).not.toHaveBeenCalled()
  })

  it('reuses unaffected day fragments after reopening and adding another date', () => {
    const initial: Document = {
      roots: [
        { id: 'a', text: '2026-10-09 A', children: [] },
        { id: 'b', text: '2026-10-10 B', children: [] },
      ],
    }
    const cache = new AgendaRowsCache()
    const before = cache.get(initial, openAgendaState(location, 0, today))
    const unchanged = before.find((row) => row.kind === 'node' && row.nodeId === 'b')
    const reopened = openAgendaState(location, 0, today)
    cache.get(initial, reopened)

    const edited = editNodeText(initial, 'a', '2026-10-09 A 2026-10-15')
    const after = cache.get(edited, reopened)

    expect(after.find((row) => row.kind === 'node' && row.nodeId === 'b')).toBe(unchanged)
    expect(after).toEqual(buildAgendaRows(projectAgenda(edited, null), reopened))
  })

  it('releases only a populated cache for a replaced document', () => {
    const cache = new AgendaRowsCache()
    const clear = vi.spyOn(cache, 'clear')
    const state = openAgendaState(location, 0, today)
    cache.releaseIfStale(document)
    const before = cache.get(document, state)
    // Document replacement must release the old row fragments before the cache is used again.
    const retainedDays = Reflect.get(cache, 'dayRows') as ReadonlyMap<number, unknown>
    expect(retainedDays.size).toBeGreaterThan(0)

    cache.releaseIfStale(document)

    expect(clear).not.toHaveBeenCalled()
    expect(cache.get(document, state)).toBe(before)

    cache.releaseIfStale({ roots: [] })

    expect(clear).toHaveBeenCalledOnce()
    expect(retainedDays.size).toBe(0)
    expect(cache.get(document, state)).not.toBe(before)
  })

  it('reuses equal folded-day membership and invalidates different folds with the same size', () => {
    const cache = new AgendaRowsCache()
    const state = { ...openAgendaState(location, 0, today), collapsed: new Set([`day:${today + 1}`]) }
    const before = cache.get(document, state)

    const equal = cache.get(document, { ...state, collapsed: new Set(state.collapsed) })
    const different = cache.get(document, { ...state, collapsed: new Set([`day:${today}`]) })

    expect(equal).toBe(before)
    expect(different).not.toBe(before)
    expect(different.some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(true)
    expect(before.some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(false)
  })

  it('releases the search corpus when cleared before reopening an undated scope', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)

    expect(cache.getProjection(document, state)).not.toHaveLength(0)

    cache.clear()
    const undated: Document = { roots: [{ id: 'parent', text: 'No dates', children: [] }] }

    expect(cache.getProjection(undated, state)).toEqual([])
    expect(cache.get(undated, state).filter((row) => row.kind === 'day' && row.isToday)).toEqual([
      { kind: 'day', key: `day:${today}`, day: today, content: false, isToday: true },
    ])
  })

  it('finds only the selected occurrence ancestors, skipping preceding sibling branches', () => {
    const projection = projectAgenda(document, null)
    const day = today + 1

    expect(agendaAncestorKeys(projection, { nodeId: 'b', day })).toEqual([`day:${day}`])
    expect(agendaAncestorKeys(projection, { nodeId: 'c', day })).toEqual([`day:${day}`])
    expect(agendaAncestorKeys(projection, { nodeId: 'parent', day })).toBeUndefined()
    expect(agendaAncestorKeys(projection, { nodeId: 'missing', day })).toBeUndefined()
    expect(agendaAncestorKeys(projection, { nodeId: 'b', day: day + 1 })).toBeUndefined()
  })

  it('reuses semantically unchanged rows when an undated root is added', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const before = cache.get(document, state)

    const reconstructed = { roots: [...document.roots, { id: 'undated', text: 'No date', children: [] }] }
    const after = cache.get(reconstructed, state)

    expect(after).toBe(before)
    expect(cache.getProjection(reconstructed, state)).toEqual(
      projectAgenda(document, null).map((entry) => ({
        ...entry,
        rows: entry.rows.filter((row) => row.role === 'match'),
      })),
    )
  })

  it('refreshes projection on a direct read and switches focused days without other state changes', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)

    expect(cache.getProjection(document, state)).toEqual(
      projectAgenda(document, null).map((entry) => ({
        ...entry,
        rows: entry.rows.filter((row) => row.role === 'match'),
      })),
    )

    const focused = cache.get(document, focusAgendaState(state, today + 1, 0))

    expect(focused.filter((row) => row.kind === 'day').map((row) => row.day)).toEqual([today + 1])
    expect(cache.get(document, state).filter((row) => row.kind === 'day').length).toBeGreaterThan(1)
  })

  it('drops Overdue from the search projection on day focus even when no occurrence is active', () => {
    const source: Document = { roots: [{ id: 'old', text: '2026-10-04 Task', children: [] }] }
    const state = openAgendaState({ currentParentId: null, selectedNodeId: 'old' }, 0, today)
    const cache = new AgendaRowsCache()
    const timeline = cache.getProjection(source, state)
    const oldDay = dayNumberOf({ year: 2026, month: 10, day: 4 })
    expect(timeline.map(({ day }) => day)).toEqual([oldDay])

    const focused = cache.getProjection(source, focusAgendaState(state, today, 0))

    expect(focused).toEqual([])
    expect(cache.getProjection(source, state)).toEqual(timeline)
  })

  it('does not traverse unchanged subtrees when an edit preserves day membership', () => {
    let childrenReads = 0
    const stable = Array.from({ length: 1000 }, (_, index) => ({
      id: `stable-${index}`,
      text: '2026-10-09',
      get children() {
        childrenReads += 1
        return []
      },
    }))
    const first: Document = { roots: [{ id: 'edited', text: '2026-10-09', children: [] }, ...stable] }
    const second: Document = { roots: [{ id: 'edited', text: '2026-10-09 Changed', children: [] }, ...stable] }
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const before = cache.get(first, state)
    childrenReads = 0

    const after = cache.get(second, state)

    expect(after).toBe(before)
    expect(childrenReads).toBe(0)
  })

  // @requirement PRODUCT.md §23.1
  it('opens a newly added scope after caching a different document and scope', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    cache.get(document, state)
    const updated: Document = {
      roots: [
        ...document.roots,
        {
          id: 'new-scope',
          text: 'New scope',
          children: [{ id: 'new-match', text: '2026-10-09 New match', children: [] }],
        },
      ],
    }
    const scoped = {
      ...openAgendaState({ currentParentId: 'new-scope', selectedNodeId: 'new-match' }, 0, today),
      scopeParentId: 'new-scope',
    }

    const rows = cache.get(updated, scoped)

    expect(rows.filter((row) => row.kind === 'node').map((row) => row.nodeId)).toEqual(['new-match'])
    expect(cache.getProjection(updated, scoped)).toEqual(projectAgenda(updated, 'new-scope'))
  })

  it('marks a focused heading as Today only on the current day', () => {
    const state = openAgendaState(location, 0, today)
    const projection = projectAgenda(document, null)

    expect(buildAgendaRows(projection, focusAgendaState(state, today, 0))[0]).toMatchObject({
      day: today,
      isToday: true,
    })
    expect(buildAgendaRows(projection, focusAgendaState(state, today + 1, 0))[0]).toMatchObject({
      day: today + 1,
      isToday: false,
    })
  })

  it('releases per-day cached rows when their dates disappear', () => {
    const cache = new Map()
    const state = openAgendaState(location, 0, today)
    buildAgendaRows(projectAgenda(document, null), state, cache)

    expect(cache.has(today + 1)).toBe(true)

    buildAgendaRows([], state, cache)

    expect(cache.size).toBe(0)
  })

  it('reuses unchanged day rows when dates are added and releases them when cleared', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const before = cache.get(document, state)
    const oldNode = before.find((row) => row.kind === 'node' && row.nodeId === 'a')!
    const searchableDay = cache.getProjection(document, state)[0]

    const edited = editNodeText(document, 'a', '2026-10-09 2026-10-10 Added')
    const after = cache.get(edited, state)

    expect(after.find((row) => row.key === oldNode.key)).toBe(oldNode)
    expect(cache.getProjection(edited, state)[0]).toBe(searchableDay)
    expect(after).toEqual(buildAgendaRows(projectAgenda(edited, null), state, undefined, edited))

    const folded = cache.get(edited, { ...state, collapsed: new Set([oldNode.key]) })

    expect(folded.filter((row) => row.kind === 'node' && row.nodeId === 'b' && row.day === today + 1)).toHaveLength(1)
    expect(cache.get(document, state)).toEqual(before)

    cache.clear()

    expect(cache.get(document, state).find((row) => row.key === oldNode.key)).not.toBe(oldNode)
  })
  it('publication and rendering share one projection and stable rows for a same-date edit', () => {
    const cache = new AgendaRowsCache()
    const runtime = new EditorRuntimeState(undefined, cache)
    const agenda = openAgendaState(location, 0, today)
    const snapshot: ReadySnapshot = {
      status: 'ready',
      document,
      location,
      agenda,
      focus: runtime.newFocus('parent', 0),
      expansion: COLLAPSED_EXPANSION_STATE,
      structuralVersion: 0,
    }
    runtime.replaceReady(snapshot)
    const rows = cache.get(document, runtime.ready().agenda!)
    const project = vi.spyOn(projectionModule, 'projectAgenda')
    try {
      const edited = editNodeText(document, 'a', '2026-10-09 Changed')
      runtime.replaceReady({ ...snapshot, document: edited })

      expect(cache.get(edited, runtime.ready().agenda!)).toBe(rows)
      expect(project).toHaveBeenCalledTimes(1)
    } finally {
      project.mockRestore()
    }
  })
  it('merges a root-scope pin in chronological order, preserves matched ancestors, and ignores stale pins', () => {
    const unpinnedState = openAgendaState(location, 0, today)
    const state = {
      ...unpinnedState,
      activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'a', day: today + 1 } },
    }
    const invalid = editNodeText(document, 'a', 'Undated')
    const cache = new AgendaRowsCache()
    const unpinned = cache.get(invalid, unpinnedState)
    const pinned = cache.get(invalid, state)

    expect(pinned).not.toBe(unpinned)
    expect(pinned.find((row) => row.kind === 'node' && row.nodeId === 'a')).toMatchObject({ role: 'match' })
    expect(cache.get(invalid, unpinnedState)).toEqual(unpinned)

    const solo: Document = {
      roots: [
        { id: 'early', text: 'Undated', children: [] },
        { id: 'later', text: '2026-10-11 Later', children: [] },
      ],
    }
    const early = {
      ...state,
      activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'early', day: today + 1 } },
    }

    expect(agendaProjection(solo, early).map((day) => day.day)).toEqual([today + 1, today + 3])
    expect(agendaProjection(solo, early)[0]!.rows).toEqual([{ nodeId: 'early', depth: 0, role: 'match' }])

    const matchedParent = editNodeText(invalid, 'parent', '2026-10-09 Parent')

    expect(agendaProjection(matchedParent, state)[0]!.rows[0]!.role).toBe('match')
    expect(
      agendaProjection(invalid, {
        ...state,
        activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'missing', day: today } },
      }),
    ).toEqual(projectAgenda(invalid, null))

    const scoped = {
      ...state,
      scopeParentId: 'a',
      activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'c', day: today } },
    }

    expect(agendaProjection(invalid, scoped)).toEqual(projectAgenda(invalid, 'a'))
  })
  it('navigation with an active occurrence does not rescan or rebuild a wide Agenda', () => {
    const wide: Document = {
      roots: Array.from({ length: 10000 }, (_, index) => ({
        id: String(index),
        text: '2026-10-09 Item',
        children: [],
      })),
    }
    const runtime = new EditorRuntimeState()
    const agenda = {
      ...openAgendaState({ currentParentId: null, selectedNodeId: '0' }, 0, today),
      selectedKey: `node:${today + 1}:0`,
      activity: { kind: 'dated' as const, occurrence: { nodeId: '0', day: today + 1 } },
    }
    const snapshot: ReadySnapshot = {
      status: 'ready',
      document: wide,
      location: { currentParentId: null, selectedNodeId: '0' },
      focus: runtime.newFocus('0', 0),
      expansion: COLLAPSED_EXPANSION_STATE,
      structuralVersion: 0,
      agenda,
    }
    runtime.replaceReady(snapshot)
    const cache = new AgendaRowsCache()
    const rows = cache.get(wide, agenda)
    const scan = vi.spyOn(recognition, 'findCanonicalDates')
    const project = vi.spyOn(projectionModule, 'projectAgenda')
    try {
      for (let index = 1; index < 100; index++) {
        const next = {
          ...agenda,
          selectedKey: `node:${today + 1}:${index}`,
          activity: { kind: 'dated' as const, occurrence: { nodeId: String(index), day: today + 1 } },
        }

        runtime.replaceReady({ ...snapshot, agenda: next })

        expect(cache.get(wide, runtime.ready().agenda!)).toBe(rows)
      }

      expect(scan).not.toHaveBeenCalled()
      expect(project).not.toHaveBeenCalled()

      const edited = editNodeText(wide, '0', '2026-10-09 Item!')
      const reconciled = reconcileAgenda(edited, agenda)!

      expect(cache.get(edited, reconciled)).toBe(rows)
      // One active-text scan and one changed-node domain-summary scan; no scan of unchanged nodes.
      expect(scan).toHaveBeenCalledTimes(2)
    } finally {
      scan.mockRestore()
      project.mockRestore()
    }
  })
  it('shows all week dates and separators while excluding occurrences outside the week', () => {
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

    expect(rows.filter((row) => row.kind === 'day').map((row) => row.day)).toEqual([95, 96, 97, 98, 99, 100, 101])
    expect(rows.filter((row) => row.kind === 'separator').map((row) => row.day)).toEqual([96, 97, 98, 99, 100, 101])
    expect(rows.filter((row) => row.kind === 'node')).toEqual([])
  })

  it('invalidates semantic cache inputs separately and releases cached rows on clear', () => {
    const node = (id: string, text = '2026-10-09', children: Document['roots'] = []) => ({ id, text, children })
    const initial: Document = { roots: [node('a'), node('b')] }
    const state = openAgendaState(location, 0, today)
    const variants: Document[] = [
      { roots: [node('a'), node('c')] },
      { roots: [node('a'), node('b', 'Context', [node('child')])] },
      { roots: [node('a'), node('b', '2026-10-09', [node('child')])] },
      { roots: [node('a'), node('b', '2026-10-15')] },
      { roots: [node('a'), node('b'), node('c')] },
      { roots: [node('a'), node('b', '2026-10-09 2026-10-10')] },
      { roots: [node('a', '2026-10-09', [node('b')])] },
      { roots: [node('a', 'Context', [node('b')])] },
    ]
    for (const changed of variants) {
      const cache = new AgendaRowsCache()
      const before = cache.get(initial, state)

      const after = cache.get(changed, state)

      expect(after).not.toBe(before)
      expect(after).toEqual(buildAgendaRows(projectAgenda(changed, null), state, undefined, changed))
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
      roots: [{ id: 'a', text: 'Context', children: [{ id: 'b', text: '2026-10-09 2026-10-10', children: [] }] }],
    }

    const rows = cache.get(context, state)
    const direct = editNodeText(context, 'a', '2026-10-09')
    const changedRole = cache.get(direct, state)

    expect(changedRole).not.toBe(rows)
    expect(changedRole.find((row) => row.kind === 'node' && row.nodeId === 'a')).toMatchObject({ role: 'match' })

    const changedDate = cache.get(editNodeText(direct, 'b', '2026-10-09 2026-10-21'), state)

    expect(changedDate).not.toBe(changedRole)
    expect(changedDate.filter((row) => row.kind === 'node').map((row) => row.day)).not.toContain(today + 2)
  })

  // @requirement PRODUCT.md §23.2
  it('lists a marked node under the new Today when Agenda reopens on another day with the same document', () => {
    const cache = new AgendaRowsCache()
    const origin = { currentParentId: null, selectedNodeId: 'task' }
    const marked: Document = {
      roots: [
        { id: 'task', text: 'Task', marked: true, children: [] },
        { id: 'dated', text: '2026-10-09 Dated', children: [] },
      ],
    }
    const nodeKeys = (state: ReturnType<typeof openAgendaState>): string[] =>
      cache
        .get(marked, state)
        .filter((row) => row.kind === 'node')
        .map((row) => row.key)

    expect(nodeKeys(openAgendaState(origin, 0, today))).toEqual([`node:${today}:task`, `node:${today + 1}:dated`])

    const nextDay = openAgendaState(origin, 0, today + 1)

    // The next day already had a cached entry for the dated node; the marked node must join it.
    expect(nodeKeys(nextDay)).toEqual([`node:${today + 1}:task`, `node:${today + 1}:dated`])
    expect(cache.getProjection(marked, nextDay).map((entry) => entry.day)).toEqual([today + 1])
  })

  it('builds an empty-scope timeline on the first read and after clearing', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const empty = { roots: [] }

    const rows = cache.get(empty, state)

    expect(rows).toHaveLength(13)
    expect(rows.filter((row) => row.kind === 'day' && row.isToday)).toEqual([
      { kind: 'day', key: `day:${today}`, day: today, content: false, isToday: true },
    ])

    cache.clear()

    expect(cache.get(empty, state)).toEqual(rows)
    expect(cache.get(empty, state)).not.toBe(rows)
  })
  it('flattens only direct matches and folds only days', () => {
    const state = openAgendaState(location, 0, today)

    const projection = projectAgenda(document, null)
    const rows = buildAgendaRows(projection, state)
    const nodes = rows.filter((row) => row.kind === 'node')

    expect(nodes.map((row) => [row.nodeId, row.depth])).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 0],
    ])

    const folded = buildAgendaRows(projection, { ...state, collapsed: new Set([nodes[1]!.key]) })

    expect(folded.filter((row) => row.kind === 'node').map((row) => row.nodeId)).toEqual(['a', 'b', 'c'])

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

    const edited = editNodeText(document, 'a', '2026-10-09 Changed')

    expect(cache.get(edited, state)).toBe(before)
    expect(cache.get(editNodeText(edited, 'a', '2026-10-15 Changed'), state)).not.toBe(before)
    expect(cache.get(document, { ...state, today: today + 1 })).not.toBe(before)
    expect(cache.get(document, { ...state, collapsed: new Set([`day:${today + 1}`]) })).not.toBe(before)
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

  it.each(['2026-10-09', '2026-09-01'])(
    'reuses rows and rescans one node for a same-date keystroke at scale (%s)',
    (date) => {
      const wide: Document = {
        roots: Array.from({ length: 10000 }, (_, index) => ({
          id: String(index),
          text: `${date} Item`,
          children: [],
        })),
      }
      const cache = new AgendaRowsCache()
      const state = openAgendaState({ currentParentId: null, selectedNodeId: '0' }, 0, today)
      const rows = cache.get(wide, state)
      const searchable = cache.getProjection(wide, state)
      const scan = vi.spyOn(recognition, 'findCanonicalDates')
      const project = vi.spyOn(projectionModule, 'projectAgenda')
      try {
        const edited = editNodeText(wide, '0', `${date} Item!`)

        expect(cache.get(edited, state)).toBe(rows)
        expect(cache.getProjection(edited, state)).toBe(searchable)
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
    },
  )
})
