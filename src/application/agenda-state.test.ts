import { expect, it } from 'vitest'
import { buildAgendaRows } from './agenda-rows'
import { applyAgendaCommand, openAgendaState } from './agenda-state'

it('keeps recursive and global folds confined to projected branches and preserves unrelated selections', () => {
  const state = openAgendaState({ currentParentId: null, selectedNodeId: 'a' }, 0, 100)
  const projection = [
    {
      day: 100,
      rows: [
        { nodeId: 'a', depth: 0, role: 'context' as const },
        { nodeId: 'b', depth: 1, role: 'match' as const },
        { nodeId: 'c', depth: 2, role: 'match' as const },
        { nodeId: 'd', depth: 0, role: 'match' as const },
        { nodeId: 'e', depth: 1, role: 'match' as const },
      ],
    },
    {
      day: 110,
      rows: [
        { nodeId: 'f', depth: 0, role: 'match' as const },
        { nodeId: 'g', depth: 1, role: 'match' as const },
      ],
    },
  ]
  const rows = buildAgendaRows(projection, state)
  for (const selectedKey of ['node:100:c', 'node:100:d', 'node:100:e', 'node:110:g', 'day:99']) {
    for (const [key, operation, collapsed, hidden] of [
      [
        'node:100:a',
        'close-recursive',
        ['node:100:a', 'node:100:b'],
        selectedKey === 'node:100:c' ? 'node:100:a' : selectedKey,
      ],
      [
        'day:100',
        'close-recursive',
        ['day:100', 'node:100:a', 'node:100:b', 'node:100:d'],
        selectedKey.startsWith('node:100:') ? 'day:100' : selectedKey,
      ],
      ['node:100:d', 'close', ['node:100:d'], selectedKey === 'node:100:e' ? 'node:100:d' : selectedKey],
      [
        'node:110:f',
        'close-all',
        ['day:100', 'node:100:a', 'node:100:b', 'node:100:d', 'day:110', 'node:110:f'],
        selectedKey.startsWith('node:100:') ? 'day:100' : selectedKey === 'node:110:g' ? 'day:110' : selectedKey,
      ],
    ] as const) {
      const next = applyAgendaCommand({ ...state, selectedKey }, { kind: 'fold', key, operation }, rows)
      expect([...next.collapsed]).toEqual(collapsed)
      expect(next.selectedKey).toBe(hidden)
    }
  }
  const folded = { ...state, collapsed: new Set(['node:100:a', 'node:100:b', 'node:100:d', 'node:110:f']) }
  expect([
    ...applyAgendaCommand(folded, { kind: 'fold', key: 'day:100', operation: 'open-recursive' }, rows).collapsed,
  ]).toEqual(['node:110:f'])
  expect([
    ...applyAgendaCommand(folded, { kind: 'fold', key: 'node:100:b', operation: 'open-recursive' }, rows).collapsed,
  ]).toEqual(['node:100:a', 'node:100:d', 'node:110:f'])
})

// @requirement PRODUCT.md §23.10
it('applies all fold operations only to the requested projected branch and normalizes hidden selection', () => {
  const state = openAgendaState({ currentParentId: null, selectedNodeId: 'a' }, 0, 100)
  const projection = [
    {
      day: 100,
      rows: [
        { nodeId: 'a', depth: 0, role: 'context' as const },
        { nodeId: 'b', depth: 1, role: 'match' as const },
        { nodeId: 'c', depth: 2, role: 'match' as const },
        { nodeId: 'd', depth: 0, role: 'match' as const },
      ],
    },
    { day: 101, rows: [{ nodeId: 'a', depth: 0, role: 'match' as const }] },
  ]
  const rows = buildAgendaRows(projection, state)
  const selected = { ...state, selectedKey: 'node:100:c' }
  const fold = (
    operation: 'close' | 'open' | 'toggle' | 'close-recursive' | 'open-recursive' | 'close-all' | 'open-all',
    initial = selected,
  ) => applyAgendaCommand(initial, { kind: 'fold', key: 'node:100:a', operation }, rows)
  const closed = fold('close')
  expect([...closed.collapsed]).toEqual(['node:100:a'])
  expect(closed.selectedKey).toBe('node:100:a')
  expect([...fold('open', closed).collapsed]).toEqual([])
  expect([...fold('toggle').collapsed]).toEqual(['node:100:a'])
  const recursive = fold('close-recursive')
  expect([...recursive.collapsed]).toEqual(['node:100:a', 'node:100:b'])
  expect(recursive.selectedKey).toBe('node:100:a')
  expect([...fold('open-recursive', recursive).collapsed]).toEqual([])
  const all = fold('close-all')
  expect([...all.collapsed]).toEqual(['day:100', 'node:100:a', 'node:100:b', 'day:101'])
  expect(all.selectedKey).toBe('day:100')
  expect([...fold('open-all', all).collapsed]).toEqual([])
  expect(all.origin).toBe(state.origin)
  expect(all.revealed).toBe(state.revealed)
})

it('captures the origin and keeps invalid or inapplicable commands as identity transitions', () => {
  const state = openAgendaState({ currentParentId: 'scope', selectedNodeId: 'origin' }, 7, 100)
  expect(state).toMatchObject({
    scopeParentId: 'scope',
    selectedKey: 'day:100',
    today: 100,
    origin: { location: { currentParentId: 'scope', selectedNodeId: 'origin' }, cursor: 7 },
  })
  const rows = buildAgendaRows([{ day: 110, rows: [{ nodeId: 'a', depth: 0, role: 'match' }] }], state)
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

it('does not fold an empty day, but a folded content branch leaves the day non-empty', () => {
  const state = openAgendaState({ currentParentId: null, selectedNodeId: 'a' }, 0, 100)
  const projection = [
    {
      day: 100,
      rows: [
        { nodeId: 'a', depth: 0, role: 'context' as const },
        { nodeId: 'b', depth: 1, role: 'match' as const },
      ],
    },
  ]
  const rows = buildAgendaRows(projection, state)
  expect(applyAgendaCommand(state, { kind: 'toggle-fold', key: 'day:99' }, rows)).toBe(state)
  const folded = applyAgendaCommand(state, { kind: 'toggle-fold', key: 'node:100:a' }, rows)
  const nextRows = buildAgendaRows(projection, folded)
  expect(nextRows.find((row) => row.key === 'day:100')).toMatchObject({ content: true })
  expect(nextRows.some((row) => row.key === 'node:100:b')).toBe(false)
  expect(applyAgendaCommand(folded, { kind: 'toggle-fold', key: 'day:100' }, nextRows).collapsed.has('day:100')).toBe(
    true,
  )
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
