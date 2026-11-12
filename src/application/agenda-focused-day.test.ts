import { describe, expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import {
  activeAgendaOccurrence,
  applyAgendaCommand,
  dayKey,
  openAgendaState,
  focusedAgendaDay,
  agendaTimelineReturn,
  focusAgendaState,
} from './agenda-state'
import { AgendaRowsCache, buildAgendaRows, type AgendaRow } from './agenda-rows'
import { reconcileAgenda } from './agenda-reconcile'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
const day = dayNumberOf({ year: 2026, month: 10, day: 14 })
const otherDay = dayNumberOf({ year: 2026, month: 10, day: 20 })
const header: AgendaRow = { kind: 'day', key: dayKey(day), day, content: true, isToday: false }

// @requirement PRODUCT.md §23.15
describe('focused Agenda day', () => {
  it('follows a live edit to its remaining date while history preserves the presentation', () => {
    const state = {
      ...focusAgendaState(openAgendaState({ currentParentId: null, selectedNodeId: 'match' }, 4, today), day, 0),
      selectedKey: `node:${day}:match`,
      activity: { kind: 'dated' as const, occurrence: { nodeId: 'match', day } },
    }
    const document = { roots: [{ id: 'match', text: 'Prepare 2026-10-20', children: [] }] }

    const edited = reconcileAgenda(document, state)!

    expect(focusedAgendaDay(edited)).toBe(otherDay)
    expect(edited.selectedKey).toBe(`node:${otherDay}:match`)
    expect(activeAgendaOccurrence(edited)).toEqual({ nodeId: 'match', day: otherDay })
    expect(agendaTimelineReturn(edited)).toBe(agendaTimelineReturn(state))
    expect(focusedAgendaDay(reconcileAgenda(document, state, true))).toBe(day)
  })

  it('reuses cached focused rows during selection changes on a large projection', () => {
    const document = {
      roots: Array.from({ length: 2000 }, (_, index) => ({
        id: `item-${index}`,
        text: '2026-10-14 Item 2026-10-20',
        children: [],
      })),
    }
    const cache = new AgendaRowsCache()
    const timeline = openAgendaState({ currentParentId: null, selectedNodeId: 'item-0' }, 0, today)
    const timelineRows = cache.get(document, timeline)

    const focused = applyAgendaCommand(timeline, { kind: 'focus-day', key: dayKey(day), scrollTop: 120 }, timelineRows)
    const focusedRows = cache.get(document, focused)

    expect(focusedRows).toHaveLength(2001)
    expect(focusedRows).not.toBe(timelineRows)
    expect(cache.get(document, { ...focused, selectedKey: `node:${day}:item-1000` })).toBe(focusedRows)

    const returned = applyAgendaCommand(focused, { kind: 'return-timeline', key: dayKey(day) }, focusedRows)
    const returnedRows = cache.get(document, returned)

    expect(returnedRows).toEqual(timelineRows)
    expect(cache.get(document, returned)).toBe(returnedRows)
  })

  it('restores the timeline selection, folds and scroll anchor after focused folds change', () => {
    const timeline = {
      ...openAgendaState({ currentParentId: null, selectedNodeId: 'source' }, 0, today),
      selectedKey: header.key,
      collapsed: new Set([dayKey(otherDay)]),
    }

    const focused = applyAgendaCommand(timeline, { kind: 'focus-day', key: header.key, scrollTop: 360 }, [header])

    expect(focusedAgendaDay(focused)).toBe(day)
    expect(focused.activity).toEqual({ kind: 'inactive' })
    expect(agendaTimelineReturn(focused)?.scrollTop).toBe(360)

    const folded = applyAgendaCommand(focused, { kind: 'toggle-fold', key: header.key }, [header])

    expect(folded.collapsed.has(header.key)).toBe(true)

    const returned = applyAgendaCommand(folded, { kind: 'return-timeline', key: header.key }, [header])

    expect(focusedAgendaDay(returned)).toBeUndefined()
    expect(agendaTimelineReturn(returned)).toBeUndefined()
    expect(agendaTimelineReturn(undefined)).toBeUndefined()
    expect(returned.selectedKey).toBe(timeline.selectedKey)
    expect(returned.collapsed).toBe(timeline.collapsed)
  })

  it('includes only the focused heading and its matches with their passive parent paths, including an empty focused day', () => {
    const state = focusAgendaState(
      openAgendaState({ currentParentId: null, selectedNodeId: 'match' }, 0, today),
      day,
      0,
    )

    const rows = buildAgendaRows(
      [
        {
          day,
          rows: [
            { nodeId: 'context', depth: 0, role: 'context' },
            { nodeId: 'match', depth: 1, role: 'match' },
          ],
        },
        { day: otherDay, rows: [{ nodeId: 'other', depth: 0, role: 'match' }] },
      ],
      state,
    )

    expect(rows.map((row) => row.key)).toEqual([dayKey(day), `node:${day}:match`])
    expect(buildAgendaRows([], state)).toEqual([{ ...header, content: false }])
  })

  it('rejects nested focusing and returning from the timeline', () => {
    const timeline = openAgendaState({ currentParentId: null, selectedNodeId: 'source' }, 0, today)

    expect(applyAgendaCommand(timeline, { kind: 'return-timeline', key: header.key }, [header])).toBe(timeline)

    const focused = applyAgendaCommand(timeline, { kind: 'focus-day', key: header.key, scrollTop: 0 }, [header])

    expect(applyAgendaCommand(focused, { kind: 'focus-day', key: header.key, scrollTop: 50 }, [header])).toBe(focused)
  })

  it('restores a selected node without activating it and retains a zero return position', () => {
    const timeline = {
      ...openAgendaState({ currentParentId: null, selectedNodeId: 'match' }, 0, today),
      selectedKey: `node:${day}:match`,
      activity: { kind: 'dated' as const, occurrence: { nodeId: 'match', day } },
    }

    const focused = applyAgendaCommand(timeline, { kind: 'focus-day', key: header.key, scrollTop: 0 }, [header])
    const returned = applyAgendaCommand(focused, { kind: 'return-timeline', key: header.key }, [header])

    expect(agendaTimelineReturn(focused)?.scrollTop).toBe(0)
    expect(returned.selectedKey).toBe(timeline.selectedKey)
    expect(returned.activity).toEqual({ kind: 'inactive' })
    expect(returned.presentation).toEqual({ kind: 'timeline' })
    expect(returned.collapsed).toBe(timeline.collapsed)
  })
})
