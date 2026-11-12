import { expect, it } from 'vitest'
import type { AgendaRow } from './agenda-rows'
import { agendaLineNumbers } from './line-numbers'

// @requirement PRODUCT.md §2.1
it('numbers only direct-match occurrences, including repeated nodes', () => {
  const rows: AgendaRow[] = [
    { kind: 'day', key: 'day:1', day: 1, isToday: true, content: true },
    { kind: 'node', key: 'node:1:a', nodeId: 'a', day: 1, depth: 0, role: 'match' },
    { kind: 'node', key: 'node:1:b', nodeId: 'b', day: 1, depth: 1, role: 'match' },
    { kind: 'day', key: 'day:2', day: 2, isToday: false, content: true },
    { kind: 'node', key: 'node:2:b', nodeId: 'b', day: 2, depth: 0, role: 'match' },
  ]

  expect([...agendaLineNumbers(rows)]).toEqual([
    ['node:1:a', 1],
    ['node:1:b', 2],
    ['node:2:b', 3],
  ])
  expect([...agendaLineNumbers([rows[3]!, rows[4]!])]).toEqual([['node:2:b', 1]])
  expect(agendaLineNumbers([]).size).toBe(0)
})
