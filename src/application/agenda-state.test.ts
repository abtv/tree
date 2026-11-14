import {
  activeAgendaOccurrence,
  pinnedAgendaOccurrence,
  applyAgendaCommand,
  openAgendaState,
  type AgendaCommand,
} from './agenda-state'
import { expect, it } from 'vitest'
import { buildAgendaRows } from './agenda-rows'

const opened = () => openAgendaState({ currentParentId: 'scope', selectedNodeId: 'origin' }, 7, 100)
const projection = [99, 101].map((day) => ({
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
    activity: { kind: 'inactive' },
    scopeParentId: 'scope',
    selectedKey: 'day:100',
    today: 100,
    origin: { location: { currentParentId: 'scope', selectedNodeId: 'origin' }, cursor: 7 },
  })
  for (const command of [
    { kind: 'select', key: 'missing' },
    { kind: 'select', key: 'day:100' },
    { kind: 'toggle-fold', key: 'day:100' },
    { kind: 'toggle-fold', key: 'node:99:a' },
    { kind: 'focus-day', key: 'node:99:a', scrollTop: 0 },
    { kind: 'return-timeline', key: 'day:100' },
  ] satisfies AgendaCommand[]) {
    expect(applyAgendaCommand(state, command, rows)).toBe(state)
  }
})

// @requirement PRODUCT.md §23.5
it.each(['close', 'close-recursive', 'toggle'] as const)(
  'folds a populated day with %s and selects its hidden entry',
  (operation) => {
    const state = {
      ...opened(),
      selectedKey: 'node:99:b',
      activity: { kind: 'dated' as const, occurrence: { nodeId: 'b', day: 99 } },
    }
    const rows = buildAgendaRows(projection, state)

    const next = applyAgendaCommand(state, { kind: 'fold', key: 'day:99', operation }, rows)

    expect([...next.collapsed]).toEqual(['day:99'])
    expect(next.selectedKey).toBe('day:99')
    expect(activeAgendaOccurrence(next)).toBeUndefined()
    expect(next.origin).toBe(state.origin)
    expect(
      buildAgendaRows(projection, next)
        .filter((row) => row.kind === 'node')
        .map((row) => row.day),
    ).toEqual([101, 101])
  },
)

// @requirement PRODUCT.md §23.5
it.each(['open', 'open-recursive', 'toggle'] as const)(
  'opens only the requested day with %s without moving selection',
  (operation) => {
    const state = { ...opened(), collapsed: new Set(['day:99', 'day:101']) }
    const rows = buildAgendaRows(projection, state)

    const next = applyAgendaCommand(state, { kind: 'fold', key: 'day:99', operation }, rows)

    expect([...next.collapsed]).toEqual(['day:101'])
    expect(next.selectedKey).toBe(state.selectedKey)
  },
)

// @requirement PRODUCT.md §23.5
it('ignores per-node folds while all-fold commands act on every populated day from a node', () => {
  const state = { ...opened(), selectedKey: 'node:101:a' }
  const rows = buildAgendaRows(projection, state)

  for (const operation of ['close', 'open', 'toggle', 'close-recursive', 'open-recursive'] as const) {
    expect(applyAgendaCommand(state, { kind: 'fold', key: 'node:99:a', operation }, rows)).toBe(state)
  }
  const folded = applyAgendaCommand(state, { kind: 'fold', key: 'node:101:a', operation: 'close-all' }, rows)

  expect([...folded.collapsed]).toEqual(['day:99', 'day:101'])
  expect(folded.selectedKey).toBe('day:101')
  expect(folded.collapsed.has('day:100')).toBe(false)

  const unfolded = applyAgendaCommand(
    folded,
    { kind: 'fold', key: 'day:101', operation: 'open-all' },
    buildAgendaRows(projection, folded),
  )

  expect(unfolded.collapsed.size).toBe(0)
  expect(unfolded.selectedKey).toBe('day:101')
})

// @requirement PRODUCT.md §23.5
it('toggles a day without moving an unrelated selection and preserves the nonempty folded header', () => {
  const state = { ...opened(), selectedKey: 'node:101:b' }
  const rows = buildAgendaRows(projection, state)

  const folded = applyAgendaCommand(state, { kind: 'toggle-fold', key: 'day:99' }, rows)

  expect(folded.selectedKey).toBe(state.selectedKey)
  expect(buildAgendaRows(projection, folded).find((row) => row.key === 'day:99')).toMatchObject({ content: true })
  expect(
    applyAgendaCommand(folded, { kind: 'toggle-fold', key: 'day:99' }, buildAgendaRows(projection, folded)).collapsed
      .size,
  ).toBe(0)
})

// @requirement PRODUCT.md §23.7
it('retains a pin on reselection and drops it with the old cursor when another row is selected', () => {
  const state = {
    ...opened(),
    selectedKey: 'node:99:a',
    activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'a', day: 99 } },
    selectionCursor: 9,
  }
  const rows = buildAgendaRows(projection, state)

  expect(applyAgendaCommand(state, { kind: 'select', key: state.selectedKey }, rows)).toBe(state)

  const selected = applyAgendaCommand(state, { kind: 'select', key: 'node:101:b', cursor: 3 }, rows)

  expect(activeAgendaOccurrence(selected)).toEqual({ nodeId: 'b', day: 101 })
  expect(pinnedAgendaOccurrence(selected)).toBeUndefined()
  expect(selected.selectionCursor).toBe(3)

  const header = applyAgendaCommand(selected, { kind: 'select', key: 'day:100' }, rows)

  expect(activeAgendaOccurrence(header)).toBeUndefined()
  expect(header.activity).toEqual({ kind: 'inactive' })
  expect(header.selectionCursor).toBeUndefined()
})
