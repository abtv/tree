import { expect, it } from 'vitest'
import { buildAgendaRows } from './agenda-rows'
import { applyAgendaCommand, openAgendaState, reconcileAgenda } from './agenda-state'

it('captures the origin and keeps invalid or inapplicable commands as identity transitions', () => {
  const state = openAgendaState({ currentParentId: 'scope', selectedNodeId: 'origin' }, 7, 100)
  expect(state).toMatchObject({
    scopeParentId: 'scope',
    selectedKey: 'day:100',
    today: 100,
    origin: { location: { currentParentId: 'scope', selectedNodeId: 'origin' }, cursor: 7 },
  })
  const rows = buildAgendaRows([{ day: 110, rows: [{ nodeId: 'a', depth: 0, role: 'match' }] }], state)
  expect(reconcileAgenda(state)).toBe(state)
  expect(applyAgendaCommand(state, { kind: 'select', key: state.selectedKey }, rows)).toBe(state)
  expect(applyAgendaCommand(state, { kind: 'select', key: 'missing' }, rows)).toBe(state)
  expect(applyAgendaCommand(state, { kind: 'select', key: rows[0]!.key }, rows).selectedKey).toBe(rows[0]!.key)
  expect(applyAgendaCommand(state, { kind: 'toggle-gap', key: state.selectedKey }, rows)).toBe(state)
  const node = rows.find((row) => row.kind === 'node')!
  const gap = rows.find((row) => row.kind === 'gap')!
  expect(applyAgendaCommand(state, { kind: 'toggle-fold', key: node.key }, rows)).toBe(state)
  expect(applyAgendaCommand(state, { kind: 'toggle-fold', key: gap.key }, rows)).toBe(state)
})

it('reveals the next chunk and collapses the expanded header without changing the origin', () => {
  const state = openAgendaState({ currentParentId: null, selectedNodeId: 'a' }, 0, 100)
  const projection = [{ day: 120, rows: [{ nodeId: 'a', depth: 0, role: 'match' as const }] }]
  const rows = buildAgendaRows(projection, state)
  const gap = rows.find((row) => row.kind === 'gap')!
  const next = applyAgendaCommand(state, { kind: 'toggle-gap', key: gap.key }, rows)
  expect([...next.revealed]).toEqual([104, 105, 106, 107, 108, 109, 110])
  expect(next.selectedKey).toBe(gap.key)
  expect(next.origin).toBe(state.origin)
  const restored = applyAgendaCommand(next, { kind: 'toggle-gap', key: gap.key }, buildAgendaRows(projection, next))
  expect(restored.revealed.size).toBe(0)
})

it('collapses only descendants on the same day and moves a hidden selection to the folding row', () => {
  const state = openAgendaState({ currentParentId: null, selectedNodeId: 'a' }, 0, 100)
  const projection = [
    {
      day: 100,
      rows: [
        { nodeId: 'a', depth: 0, role: 'context' as const },
        { nodeId: 'b', depth: 1, role: 'match' as const },
        { nodeId: 'c', depth: 0, role: 'match' as const },
      ],
    },
    { day: 101, rows: [{ nodeId: 'a', depth: 0, role: 'match' as const }] },
  ]
  const rows = buildAgendaRows(projection, state)
  for (const [selectedKey, expected] of [
    ['node:100:b', 'node:100:a'],
    ['node:100:c', 'node:100:c'],
    ['node:101:a', 'node:101:a'],
    ['day:99', 'day:99'],
  ] as const) {
    const next = applyAgendaCommand({ ...state, selectedKey }, { kind: 'toggle-fold', key: 'node:100:a' }, rows)
    expect(next.selectedKey).toBe(expected)
  }
  const selected = { ...state, selectedKey: 'node:100:b' }
  const folded = applyAgendaCommand(selected, { kind: 'toggle-fold', key: 'day:100' }, rows)
  expect(folded.selectedKey).toBe('day:100')
  expect(
    applyAgendaCommand(folded, { kind: 'toggle-fold', key: 'day:100' }, buildAgendaRows(projection, folded)).collapsed
      .size,
  ).toBe(0)
})
