import { expect, it } from 'vitest'
import { dayNumberOf, weekdayOf } from './calendar-date'
import { parsePersistedState, serializeState, validatePersistedState } from './document'

const first = dayNumberOf({ year: 0, month: 1, day: 1 })
const last = dayNumberOf({ year: 9999, month: 12, day: 31 })
const monday = first - weekdayOf(first)
const state = {
  version: 4,
  document: { roots: [{ id: 'root', text: 'No dated occurrences', children: [] }] },
  location: { currentParentId: null, selectedNodeId: 'root' },
  view: { expandedIds: [], selectedRowTop: 42 },
}

// @requirement PRODUCT.md §16.1
// @requirement PRODUCT.md §23.5
it('round-trips calendar boundaries and off-document folds while normalizing duplicates without mutation', () => {
  const agendaFolds = { days: [first, last, first], overdueWeeks: [monday, monday, last - weekdayOf(last)] }
  const input = { ...state, view: { ...state.view, agendaFolds } }
  const before = JSON.stringify(input)

  expect(validatePersistedState(input)).toBe(input)

  const parsed = parsePersistedState(input)
  const saved = serializeState(parsed.document, parsed.location, parsed.view)

  expect(saved.view).toEqual({
    ...state.view,
    agendaFolds: { days: [first, last], overdueWeeks: [monday, last - weekdayOf(last)] },
  })
  expect(parsePersistedState(JSON.parse(JSON.stringify(saved)))).toEqual(saved)
  expect(JSON.stringify(input)).toBe(before)
})

it.each([undefined, { days: [], overdueWeeks: [] }])(
  'omits empty Agenda preferences and accepts old view state: %j',
  (agendaFolds) => {
    const parsed = parsePersistedState({ ...state, view: { ...state.view, agendaFolds } })

    expect(parsed.view).toEqual(state.view)
    expect(serializeState(parsed.document, parsed.location, parsed.view)).toEqual({ ...state, version: 6 })
  },
)

it.each([
  null,
  [],
  {},
  { days: [], overdueWeeks: null },
  { days: 'day:100', overdueWeeks: [] },
  { days: ['100'], overdueWeeks: [] },
  { days: [1.5], overdueWeeks: [] },
  { days: [NaN], overdueWeeks: [] },
  { days: [first - 1], overdueWeeks: [] },
  { days: [last + 1], overdueWeeks: [] },
  { days: [], overdueWeeks: [monday - 7] },
  { days: [], overdueWeeks: [last - weekdayOf(last) + 7] },
  { days: [], overdueWeeks: [monday + 1] },
  { days: [], overdueWeeks: [monday + 0.5] },
])('rejects malformed Agenda folds consistently: %j', (agendaFolds) => {
  const input = { ...state, view: { ...state.view, agendaFolds } }

  expect(() => validatePersistedState(input)).toThrow('The saved view state is invalid.')
  expect(() => parsePersistedState(input)).toThrow('The saved view state is invalid.')
})
