import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { projectAgenda } from '../domain/agenda-projection'
import * as projectionModule from '../domain/agenda-projection'
import { editNodeText, type Document } from '../domain/document'
import * as recognition from '../domain/date-recognition'
import { agendaAncestorKeys, agendaProjection, AgendaRowsCache, buildAgendaRows } from './agenda-rows'
import { openAgendaState, focusAgendaState } from './agenda-state'
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
        { id: 'a', text: '2026-10-14 A', children: [{ id: 'b', text: '2026-10-14 B', children: [] }] },
        { id: 'c', text: '2026-10-14 C', children: [] },
      ],
    },
  ],
}

describe('Agenda rows', () => {
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
        { id: 'a', text: '2026-10-14 A', children: [] },
        { id: 'b', text: '2026-10-20 B', children: [] },
      ],
    }
    const cache = new AgendaRowsCache()
    const before = cache.get(initial, openAgendaState(location, 0, today))
    const unchanged = before.find((row) => row.kind === 'node' && row.nodeId === 'b')
    const reopened = openAgendaState(location, 0, today)
    cache.get(initial, reopened)

    const edited = editNodeText(initial, 'a', '2026-10-14 A 2026-10-15')
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

    cache.releaseIfStale(document)

    expect(clear).not.toHaveBeenCalled()
    expect(cache.get(document, state)).toBe(before)

    cache.releaseIfStale({ roots: [] })

    expect(clear).toHaveBeenCalledOnce()
    expect(cache.get(document, state)).not.toBe(before)
  })

  it('reuses equal folded-day membership and invalidates different folds with the same size', () => {
    const cache = new AgendaRowsCache()
    const state = { ...openAgendaState(location, 0, today), collapsed: new Set([`day:${today + 6}`]) }
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
    expect(cache.get(undated, state)).toEqual([
      { kind: 'day', key: `day:${today}`, day: today, content: false, isToday: true },
    ])
  })

  it('finds only the selected occurrence ancestors, skipping preceding sibling branches', () => {
    const projection = projectAgenda(document, null)
    const day = today + 6

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

    const focused = cache.get(document, focusAgendaState(state, today + 6, 0))

    expect(focused.filter((row) => row.kind === 'day').map((row) => row.day)).toEqual([today + 6])
    expect(cache.get(document, state).filter((row) => row.kind === 'day').length).toBeGreaterThan(1)
  })

  it('does not traverse unchanged subtrees when an edit preserves day membership', () => {
    let childrenReads = 0
    const stable = Array.from({ length: 1000 }, (_, index) => ({
      id: `stable-${index}`,
      text: '2026-10-14',
      get children() {
        childrenReads += 1
        return []
      },
    }))
    const first: Document = { roots: [{ id: 'edited', text: '2026-10-14', children: [] }, ...stable] }
    const second: Document = { roots: [{ id: 'edited', text: '2026-10-14 Changed', children: [] }, ...stable] }
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const before = cache.get(first, state)
    childrenReads = 0

    const after = cache.get(second, state)

    expect(after).toBe(before)
    expect(childrenReads).toBe(0)
  })

  it('marks a focused heading as Today only on the current day', () => {
    const state = openAgendaState(location, 0, today)
    const projection = projectAgenda(document, null)

    expect(buildAgendaRows(projection, focusAgendaState(state, today, 0))[0]).toMatchObject({
      day: today,
      isToday: true,
    })
    expect(buildAgendaRows(projection, focusAgendaState(state, today + 6, 0))[0]).toMatchObject({
      day: today + 6,
      isToday: false,
    })
  })

  it('releases per-day cached rows when their dates disappear', () => {
    const cache = new Map()
    const state = openAgendaState(location, 0, today)
    buildAgendaRows(projectAgenda(document, null), state, cache)

    expect(cache.has(today + 6)).toBe(true)

    buildAgendaRows([], state, cache)

    expect(cache.size).toBe(0)
  })

  it('reuses unchanged day rows when dates are added and releases them when cleared', () => {
    const cache = new AgendaRowsCache()
    const state = openAgendaState(location, 0, today)
    const before = cache.get(document, state)
    const oldNode = before.find((row) => row.kind === 'node' && row.nodeId === 'a')!
    const searchableDay = cache.getProjection(document, state)[0]

    const edited = editNodeText(document, 'a', '2026-10-14 2026-10-20 Added')
    const after = cache.get(edited, state)

    expect(after.find((row) => row.key === oldNode.key)).toBe(oldNode)
    expect(cache.getProjection(edited, state)[0]).toBe(searchableDay)
    expect(after).toEqual(buildAgendaRows(projectAgenda(edited, null), state))

    const folded = cache.get(edited, { ...state, collapsed: new Set([oldNode.key]) })

    expect(folded.filter((row) => row.kind === 'node' && row.nodeId === 'b' && row.day === today + 6)).toHaveLength(1)
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
      const edited = editNodeText(document, 'a', '2026-10-14 Changed')
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
      activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'a', day: today + 6 } },
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
        { id: 'later', text: '2026-10-28 Later', children: [] },
      ],
    }
    const early = {
      ...state,
      activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'early', day: today + 6 } },
    }

    expect(agendaProjection(solo, early).map((day) => day.day)).toEqual([today + 6, today + 20])
    expect(agendaProjection(solo, early)[0]!.rows).toEqual([{ nodeId: 'early', depth: 0, role: 'match' }])

    const matchedParent = editNodeText(invalid, 'parent', '2026-10-14 Parent')

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
        text: '2026-10-14 Item',
        children: [],
      })),
    }
    const runtime = new EditorRuntimeState()
    const agenda = {
      ...openAgendaState({ currentParentId: null, selectedNodeId: '0' }, 0, today),
      selectedKey: `node:${today + 6}:0`,
      activity: { kind: 'dated' as const, occurrence: { nodeId: '0', day: today + 6 } },
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
          selectedKey: `node:${today + 6}:${index}`,
          activity: { kind: 'dated' as const, occurrence: { nodeId: String(index), day: today + 6 } },
        }

        runtime.replaceReady({ ...snapshot, agenda: next })

        expect(cache.get(wide, runtime.ready().agenda!)).toBe(rows)
      }

      expect(scan).not.toHaveBeenCalled()
      expect(project).not.toHaveBeenCalled()

      const edited = editNodeText(wide, '0', '2026-10-14 Item!')
      const reconciled = reconcileAgenda(edited, agenda)!

      expect(cache.get(edited, reconciled)).toBe(rows)
      // One active-text scan and one changed-node domain-summary scan; no scan of unchanged nodes.
      expect(scan).toHaveBeenCalledTimes(2)
    } finally {
      scan.mockRestore()
      project.mockRestore()
    }
  })
  it('omits empty dates and gives immediate children no parent path', () => {
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

    expect(rows.filter((row) => row.kind === 'day').map((row) => row.key)).toEqual(['day:100', 'day:120'])
    expect(rows.filter((row) => row.kind === 'node').map((row) => row.parentPath)).toEqual([[], []])
    expect(rows.filter((row) => row.kind === 'node').map((row) => row.startsPathGroup)).toEqual([true, false])
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

    expect(rows).toEqual([{ kind: 'day', key: `day:${today}`, day: today, content: false, isToday: true }])

    cache.clear()

    expect(cache.get(empty, state)).toEqual(rows)
    expect(cache.get(empty, state)).not.toBe(rows)
  })
  it('groups only direct matches by their real parent and folds only days', () => {
    const state = openAgendaState(location, 0, today)

    const projection = projectAgenda(document, null)
    const rows = buildAgendaRows(projection, state)
    const nodes = rows.filter((row) => row.kind === 'node')

    expect(nodes.map((row) => [row.nodeId, row.parentPath, row.startsPathGroup])).toEqual([
      ['a', ['parent'], true],
      ['b', ['parent', 'a'], true],
      ['c', ['parent'], true],
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

    const edited = editNodeText(document, 'a', '2026-10-14 Changed')

    expect(cache.get(edited, state)).toBe(before)
    expect(cache.get(editNodeText(edited, 'a', '2026-10-15 Changed'), state)).not.toBe(before)
    expect(cache.get(document, { ...state, today: today + 1 })).not.toBe(before)
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
    const searchable = cache.getProjection(wide, state)
    const scan = vi.spyOn(recognition, 'findCanonicalDates')
    const project = vi.spyOn(projectionModule, 'projectAgenda')
    try {
      const edited = editNodeText(wide, '0', '2026-10-14 Item!')

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
  })
})
