import { expect, it } from 'vitest'
import { buildAgendaRows } from './agenda-rows'
import { applyAgendaCommand, openAgendaState, type AgendaCommand } from './agenda-state'

const opened = () => openAgendaState({ currentParentId: 'scope', selectedNodeId: 'origin' }, 7, 100)
const projection = [110, 120].map((day) => ({
  day,
  rows: [
    { nodeId: 'parent', depth: 0, role: 'context' as const },
    { nodeId: 'a', depth: 1, role: 'match' as const },
    { nodeId: 'b', depth: 2, role: 'match' as const },
  ],
}))

// @requirement PRODUCT.md §23.1
it('captures the origin and retains identity for invalid or inapplicable commands', () => {
  const state = opened()
  const rows = buildAgendaRows(projection, state)

  expect(state).toMatchObject({
    scopeParentId: 'scope',
    selectedKey: 'day:100',
    today: 100,
    origin: { location: { currentParentId: 'scope', selectedNodeId: 'origin' }, cursor: 7 },
  })
  for (const command of [
    { kind: 'select', key: 'missing' },
    { kind: 'select', key: 'day:100' },
    { kind: 'toggle-fold', key: 'day:100' },
    { kind: 'toggle-fold', key: 'node:110:a' },
    { kind: 'focus-day', key: 'node:110:a', scrollTop: 0 },
    { kind: 'return-timeline', key: 'day:100' },
  ] satisfies AgendaCommand[]) {
    expect(applyAgendaCommand(state, command, rows)).toBe(state)
  }
})

// @requirement PRODUCT.md §23.5
it.each(['close', 'close-recursive', 'toggle'] as const)(
  'folds a populated day with %s and selects its hidden entry',
  (operation) => {
    const state = { ...opened(), selectedKey: 'node:110:b', activeOccurrence: { nodeId: 'b', day: 110 } }
    const rows = buildAgendaRows(projection, state)

    const next = applyAgendaCommand(state, { kind: 'fold', key: 'day:110', operation }, rows)

    expect([...next.collapsed]).toEqual(['day:110'])
    expect(next.selectedKey).toBe('day:110')
    expect(next.activeOccurrence).toBeUndefined()
    expect(next.origin).toBe(state.origin)
    expect(
      buildAgendaRows(projection, next)
        .filter((row) => row.kind === 'node')
        .map((row) => row.day),
    ).toEqual([120, 120])
  },
)

// @requirement PRODUCT.md §23.5
it.each(['open', 'open-recursive', 'toggle'] as const)(
  'opens only the requested day with %s without moving selection',
  (operation) => {
    const state = { ...opened(), collapsed: new Set(['day:110', 'day:120']) }
    const rows = buildAgendaRows(projection, state)

    const next = applyAgendaCommand(state, { kind: 'fold', key: 'day:110', operation }, rows)

    expect([...next.collapsed]).toEqual(['day:120'])
    expect(next.selectedKey).toBe(state.selectedKey)
  },
)

// @requirement PRODUCT.md §23.5
it('ignores per-node folds while all-fold commands act on every populated day from a node', () => {
  const state = { ...opened(), selectedKey: 'node:120:a' }
  const rows = buildAgendaRows(projection, state)

  for (const operation of ['close', 'open', 'toggle', 'close-recursive', 'open-recursive'] as const) {
    expect(applyAgendaCommand(state, { kind: 'fold', key: 'node:110:a', operation }, rows)).toBe(state)
  }
  const folded = applyAgendaCommand(state, { kind: 'fold', key: 'node:120:a', operation: 'close-all' }, rows)

  expect([...folded.collapsed]).toEqual(['day:110', 'day:120'])
  expect(folded.selectedKey).toBe('day:120')
  expect(folded.collapsed.has('day:100')).toBe(false)

  const unfolded = applyAgendaCommand(
    folded,
    { kind: 'fold', key: 'day:120', operation: 'open-all' },
    buildAgendaRows(projection, folded),
  )

  expect(unfolded.collapsed.size).toBe(0)
  expect(unfolded.selectedKey).toBe('day:120')
})

// @requirement PRODUCT.md §23.5
it('toggles a day without moving an unrelated selection and preserves the nonempty folded header', () => {
  const state = { ...opened(), selectedKey: 'node:120:b' }
  const rows = buildAgendaRows(projection, state)

  const folded = applyAgendaCommand(state, { kind: 'toggle-fold', key: 'day:110' }, rows)

  expect(folded.selectedKey).toBe(state.selectedKey)
  expect(buildAgendaRows(projection, folded).find((row) => row.key === 'day:110')).toMatchObject({ content: true })
  expect(
    applyAgendaCommand(folded, { kind: 'toggle-fold', key: 'day:110' }, buildAgendaRows(projection, folded)).collapsed
      .size,
  ).toBe(0)
})

// @requirement PRODUCT.md §23.7
it('retains a pin on reselection and drops it with the old cursor when another row is selected', () => {
  const state = {
    ...opened(),
    selectedKey: 'node:110:a',
    activeOccurrence: { nodeId: 'a', day: 110 },
    pinnedOccurrence: { nodeId: 'a', day: 110 },
    selectionCursor: 9,
  }
  const rows = buildAgendaRows(projection, state)

  expect(applyAgendaCommand(state, { kind: 'select', key: state.selectedKey }, rows)).toBe(state)

  const selected = applyAgendaCommand(state, { kind: 'select', key: 'node:120:b', cursor: 3 }, rows)

  expect(selected.activeOccurrence).toEqual({ nodeId: 'b', day: 120 })
  expect(selected.pinnedOccurrence).toBeUndefined()
  expect(selected.selectionCursor).toBe(3)

  const header = applyAgendaCommand(selected, { kind: 'select', key: 'day:100' }, rows)

  expect(header.activeOccurrence).toBeUndefined()
  expect(header.selectionCursor).toBeUndefined()
})
