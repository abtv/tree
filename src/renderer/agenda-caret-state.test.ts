import { expect, it } from 'vitest'
import { agendaCaret, arriveAgendaCaret, isAgendaVerticalArrival, moveAgendaCaret } from './agenda-caret-state'

it('keeps a synthetic selection until a different occurrence, focus intent or surface arrives', () => {
  const arrival = { key: 'day:1', focusToken: 3, surface: 'synthetic' as const, cursor: 4 }
  const initial = arriveAgendaCaret(undefined, arrival)
  const moved = moveAgendaCaret(initial, { key: 'day:1', anchor: 2, focus: 8 })

  expect(agendaCaret(moved)).toEqual({ key: 'day:1', anchor: 2, focus: 8 })
  expect(arriveAgendaCaret(moved, arrival)).toBe(moved)
  expect(moveAgendaCaret(moved, { key: 'day:2', anchor: 0, focus: 0 })).toBe(moved)
  expect(agendaCaret(arriveAgendaCaret(moved, { ...arrival, focusToken: 4 }))).toEqual({
    key: 'day:1',
    anchor: 4,
    focus: 4,
  })
  expect(agendaCaret(arriveAgendaCaret(moved, { ...arrival, key: 'day:2', cursor: 0 }))).toEqual({
    key: 'day:2',
    anchor: 0,
    focus: 0,
  })

  const native = arriveAgendaCaret(moved, { ...arrival, surface: 'native' })

  expect(native).toEqual({ kind: 'native', key: 'day:1', focusToken: 3 })
  expect(agendaCaret(native)).toEqual({ key: 'day:1', anchor: 0, focus: 0 })
  expect(moveAgendaCaret(native, { key: 'day:1', anchor: 1, focus: 1 })).toBe(native)
  expect(agendaCaret(arriveAgendaCaret(native, arrival))).toEqual({ key: 'day:1', anchor: 4, focus: 4 })
})

it('preserves vertical intent only across the published occurrence and focus currency', () => {
  const goal = { agendaKey: 'node:2:a', focusToken: 4 }

  expect(isAgendaVerticalArrival('day:2', 'node:2:a', 'node:2:a', 4, goal)).toBe(true)
  for (const [source, target, selected, token, pending] of [
    ['node:2:a', 'node:2:a', 'node:2:a', 4, goal],
    ['day:2', undefined, 'node:2:a', 4, goal],
    ['day:2', 'node:3:a', 'node:2:a', 4, goal],
    ['day:2', 'node:2:a', 'node:3:a', 4, goal],
    ['day:2', 'node:2:a', 'node:2:a', 5, goal],
    ['day:2', 'node:2:a', 'node:2:a', 4, undefined],
    ['day:2', 'node:2:a', 'node:2:a', 4, { focusToken: 4 }],
  ] as const)
    expect(isAgendaVerticalArrival(source, target, selected, token, pending)).toBe(false)
})
