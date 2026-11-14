import { expect, it } from 'vitest'
import fc from 'fast-check'
import { dayNumberOf, weekdayOf } from '../domain/calendar-date'
import {
  agendaWeekDays,
  agendaWeekStart,
  applyAgendaCommand,
  dayKey,
  openAgendaState,
  focusAgendaState,
} from './agenda-state'
import { AgendaRowsCache, buildAgendaRows } from './agenda-rows'
import { reconcileAgenda } from './agenda-reconcile'

const location = { currentParentId: null, selectedNodeId: 'a' }
const today = dayNumberOf({ year: 2026, month: 12, day: 30 })

it('shifts a focused day and restores the original week, selection, folds and scroll anchor', () => {
  const original = openAgendaState(location, 4, today)
  const focused = focusAgendaState(original, today, 125)
  const shifted = applyAgendaCommand(focused, { kind: 'shift-week', direction: 1 }, buildAgendaRows([], focused))

  expect(shifted.presentation).toMatchObject({
    kind: 'focused-day',
    day: today + 7,
    timelineReturn: { weekStart: original.weekStart, scrollTop: 125 },
  })

  const returned = applyAgendaCommand(
    shifted,
    { kind: 'return-timeline', key: shifted.selectedKey },
    buildAgendaRows([], shifted),
  )

  expect(returned.weekStart).toBe(original.weekStart)
  expect(returned.selectedKey).toBe(original.selectedKey)
  expect(returned.collapsed).toBe(original.collapsed)
})

it.each([
  [{ year: 0, month: 1, day: 1 }, -1],
  [{ year: 9999, month: 12, day: 31 }, 1],
] as const)('keeps navigation inside the canonical calendar at %j', (date, direction) => {
  const state = openAgendaState(location, 0, dayNumberOf(date))
  const rows = buildAgendaRows([], state)

  expect(applyAgendaCommand(state, { kind: 'shift-week', direction }, rows)).toBe(state)
})

it.each([
  [{ year: 0, month: 1, day: 1 }, -1],
  [{ year: 9999, month: 12, day: 31 }, 1],
] as const)('allows a week shift landing exactly on the canonical boundary %j', (date, direction) => {
  const boundary = dayNumberOf(date)
  const state = openAgendaState(location, 4, boundary - direction * 7)

  const next = applyAgendaCommand(state, { kind: 'shift-week', direction }, buildAgendaRows([], state))

  expect(next.selectedKey).toBe(dayKey(boundary))
  expect(next.weekStart).toBe(agendaWeekStart(boundary))
  expect(next.selectionCursor).toBe(0)

  const days = agendaWeekDays(next.weekStart)

  expect(days).toContain(boundary)
  expect(days.every((day) => (direction === -1 ? day >= boundary : day <= boundary))).toBe(true)
})

// @requirement PRODUCT.md §23.1
// @requirement PRODUCT.md §23.3
// @requirement PRODUCT.md §23.4
it('keeps every weekday while moving across months, years and empty weeks', () => {
  fc.assert(
    fc.property(fc.integer({ min: -20000, max: 40000 }), fc.constantFrom(-1 as const, 1 as const), (day, direction) => {
      const state = openAgendaState(location, 4, day)
      const rows = buildAgendaRows([], state)
      const days = rows.filter((row) => row.kind === 'day').map((row) => row.day)

      expect(days).toHaveLength(7)
      expect(weekdayOf(days[0]!)).toBe(0)
      expect(weekdayOf(days[6]!)).toBe(6)

      const next = applyAgendaCommand(state, { kind: 'shift-week', direction }, rows)

      expect(next.selectedKey).toBe(dayKey(day + direction * 7))
      expect(next.weekStart).toBe(state.weekStart + direction * 7)
      expect(next.origin).toBe(state.origin)
      expect(next.today).toBe(day)
      expect(next.selectionCursor).toBe(0)
    }),
  )
})

it('leaves a pinned occurrence and selects its weekday heading in the next week', () => {
  const state = {
    ...openAgendaState(location, 4, today),
    selectedKey: `node:${today}:a`,
    activity: { kind: 'pinned-until-leave' as const, occurrence: { day: today, nodeId: 'a' } },
  }
  const rows = buildAgendaRows([{ day: today, rows: [{ nodeId: 'a', depth: 0, role: 'match' }] }], state)

  const next = applyAgendaCommand(state, { kind: 'shift-week', direction: 1 }, rows)

  expect(next.activity).toEqual({ kind: 'inactive' })
  expect(next.selectedKey).toBe(dayKey(today + 7))
  expect(agendaWeekDays(next.weekStart)).toContain(today + 7)
})

// @requirement PRODUCT.md §20.2.26
it('limits cached search to the week including folded days and reuses unchanged projection', () => {
  const document = {
    roots: [
      { id: 'a', text: '2026-12-30 2027-01-06 needle', children: [] },
      { id: 'b', text: '2027-01-01 needle', children: [] },
    ],
  }
  const cache = new AgendaRowsCache()
  const state = { ...openAgendaState(location, 0, today), collapsed: new Set([dayKey(today)]) }
  const projection = cache.getProjection(document, state)

  expect(projection.map((day) => day.day)).toEqual([today, today + 2])
  expect(cache.get(document, state).some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(false)
  expect(cache.getProjection(document, { ...state, selectionCursor: 3 })).toBe(projection)

  const next = applyAgendaCommand(state, { kind: 'shift-week', direction: 1 }, cache.get(document, state))

  expect(cache.getProjection(document, next).map((day) => day.day)).toEqual([today + 7])
})

// @requirement PRODUCT.md §23.7
it('follows live date migration across weeks but preserves the displayed week through history', () => {
  const state = {
    ...openAgendaState(location, 0, today),
    selectedKey: `node:${today}:a`,
    activity: { kind: 'dated' as const, occurrence: { day: today, nodeId: 'a' } },
  }
  const document = { roots: [{ id: 'a', text: '2027-01-06', children: [] }] }

  expect(reconcileAgenda(document, state)?.weekStart).toBe(agendaWeekStart(today + 7))
  expect(reconcileAgenda(document, state)?.selectedKey).toBe(`node:${today + 7}:a`)
  expect(reconcileAgenda(document, state, true)?.weekStart).toBe(state.weekStart)
})
