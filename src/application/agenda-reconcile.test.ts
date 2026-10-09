import { expect, it } from 'vitest'
import { editNodeText, type Document } from '../domain/document'
import {
  agendaHistorySelection,
  agendaOriginLocation,
  isInAgendaScope,
  reconcileAgenda,
  reconcileAgendaSelection,
  selectedAgendaDay,
} from './agenda-reconcile'
import { agendaProjection, buildAgendaRows } from './agenda-rows'
import { openAgendaState, applyAgendaCommand, type AgendaState } from './agenda-state'

const document: Document = {
  roots: [
    {
      id: 'scope',
      text: 'Scope',
      children: [
        {
          id: 'context',
          text: 'Context',
          children: [{ id: 'match', text: '1970-04-09 1970-04-11 1970-04-13', children: [] }],
        },
        { id: 'other', text: '1970-04-11 Other', children: [] },
      ],
    },
    { id: 'outside', text: '1970-04-11 Outside', children: [] },
  ],
}

function selected(key = 'node:100:match'): AgendaState {
  const state = openAgendaState({ currentParentId: 'scope', selectedNodeId: 'context' }, 4, 100)
  return applyAgendaCommand(state, { kind: 'select', key }, buildAgendaRows(agendaProjection(document, state), state))
}

// @requirement PRODUCT.md §23.7
it('tracks explicit active occurrences, keeps added dates stable, and chooses the earlier nearest remaining day', () => {
  const state = selected()
  expect(state.activeOccurrence).toEqual({ nodeId: 'match', day: 100 })
  expect(reconcileAgenda(document, state)).toBe(state)
  const added = editNodeText(document, 'match', '1970-04-09 1970-04-11 1970-04-13 1970-04-20')
  expect(reconcileAgenda(added, state)).toBe(state)
  const removed = editNodeText(document, 'match', '1970-04-09 1970-04-13')
  expect(reconcileAgenda(removed, state)).toMatchObject({ selectedKey: 'node:98:match', activeOccurrence: { day: 98 } })
})

// @requirement PRODUCT.md §23.7
it('pins the last-date item and its ancestors in tree order, without including the scope or unrelated ancestors', () => {
  const state = selected()
  const invalid = editNodeText(document, 'match', 'Undated')
  const next = reconcileAgenda(invalid, state)!
  expect(next.pinnedOccurrence).toEqual({ nodeId: 'match', day: 100 })
  expect(next.selectedKey).toBe(state.selectedKey)
  expect(agendaProjection(invalid, next).find((day) => day.day === 100)?.rows).toEqual([
    { nodeId: 'context', depth: 0, role: 'context' },
    { nodeId: 'match', depth: 1, role: 'match' },
    { nodeId: 'other', depth: 0, role: 'match' },
  ])
  expect(reconcileAgenda(invalid, next)).toBe(next)
  const restored = reconcileAgenda(document, next)!
  expect(restored.pinnedOccurrence).toBeUndefined()
  expect(restored.activeOccurrence).toEqual({ nodeId: 'match', day: 100 })
  const rows = buildAgendaRows(agendaProjection(invalid, next), next)
  expect(applyAgendaCommand(next, { kind: 'select', key: next.selectedKey }, rows)).toBe(next)
  const left = applyAgendaCommand(next, { kind: 'select', key: 'node:100:context' }, rows)
  expect(left.pinnedOccurrence).toBeUndefined()
  expect(reconcileAgenda(invalid, left)!.selectedKey).toBe('day:100')
  expect(agendaProjection(invalid, left).find((day) => day.day === 100)?.rows).toEqual([
    { nodeId: 'other', depth: 0, role: 'match' },
  ])
})

// @requirement PRODUCT.md §23.8
it('history chooses the nearest visible occurrence and leaves out-of-scope or fully folded changes alone', () => {
  const state = selected('node:100:other')
  const folded = { ...state, collapsed: new Set(['node:100:context']) }
  expect(agendaHistorySelection(document, folded, 'match')).toMatchObject({ selectedKey: 'node:98:match' })
  const hidden = { ...folded, collapsed: new Set(['node:98:context', 'node:100:context', 'node:102:context']) }
  expect(agendaHistorySelection(document, hidden, 'match')).toBe(hidden)
  expect(agendaHistorySelection(document, state, 'outside')).toBe(state)
  expect(agendaHistorySelection(document, state, 'scope')).toBe(state)
})

it('closes a removed scope, removes a deleted/moved active item, and falls back when a selected gap disappears', () => {
  expect(reconcileAgenda({ roots: document.roots.slice(1) }, selected())).toBeUndefined()
  const state = selected()
  const removed: Document = { roots: [{ ...document.roots[0]!, children: document.roots[0]!.children.slice(1) }] }
  const next = reconcileAgenda(removed, state)!
  expect(next.selectedKey).toBe('day:100')
  expect(next.activeOccurrence).toBeUndefined()
  const opened = openAgendaState({ currentParentId: null, selectedNodeId: 'scope' }, 0, 100)
  const gap = { ...opened, selectedKey: 'gap:105:109' }
  expect(reconcileAgenda(document, gap)!.selectedKey).toBe('day:100')
  expect(selectedAgendaDay('node:-1:a:b')).toBe(-1)
  expect(selectedAgendaDay('gap:1:8')).toBeUndefined()
})

it('continues a live edit in a folded remaining day but history preserves presentation', () => {
  const state = { ...selected(), collapsed: new Set(['day:98', 'node:98:context']) }
  const changed = editNodeText(document, 'match', '1970-04-09')
  const live = reconcileAgenda(changed, state)!
  expect(live.selectedKey).toBe('node:98:match')
  expect(live.collapsed.size).toBe(0)
  const history = reconcileAgenda(changed, state, true)!
  expect(history.collapsed).toBe(state.collapsed)
  expect(
    buildAgendaRows(agendaProjection(changed, history), history).some((row) => row.key === history.selectedKey),
  ).toBe(true)
})

it('scope membership excludes missing nodes, the scope root, and outside branches', () => {
  const state = selected()
  expect(isInAgendaScope(document, state, 'match')).toBe(true)
  expect(isInAgendaScope(document, state, 'context')).toBe(true)
  expect(isInAgendaScope(document, state, 'scope')).toBe(false)
  expect(isInAgendaScope(document, state, 'outside')).toBe(false)
  expect(isInAgendaScope(document, state, 'missing')).toBe(false)
  expect(isInAgendaScope(document, { ...state, scopeParentId: null }, 'outside')).toBe(true)
  const nestedOutside: Document = {
    roots: [
      ...document.roots,
      { id: 'outside-parent', text: 'Outside', children: [{ id: 'outside-child', text: '1970-04-11', children: [] }] },
    ],
  }
  expect(isInAgendaScope(nestedOutside, state, 'outside-child')).toBe(false)
})

it('normalizes a removed origin to the nearest surviving scope along its former path', () => {
  const before: Document = { roots: [{ id: 'grand', text: 'Grand', children: document.roots }] }
  const state = {
    ...selected(),
    origin: { location: { currentParentId: 'scope', selectedNodeId: 'missing' }, cursor: 9 },
  }
  expect(agendaOriginLocation(before, state)).toEqual({ currentParentId: 'scope', selectedNodeId: 'scope' })
  const after: Document = { roots: [{ ...before.roots[0]!, children: [document.roots[1]!] }] }
  expect(agendaOriginLocation(after, state, before)).toEqual({ currentParentId: 'grand', selectedNodeId: 'grand' })
  expect(agendaOriginLocation(document, state, { roots: [] })).toEqual({
    currentParentId: 'scope',
    selectedNodeId: 'scope',
  })
  const gone = { ...state, origin: { location: { currentParentId: 'gone', selectedNodeId: 'missing' }, cursor: 4 } }
  expect(agendaOriginLocation(document, gone)).toEqual({ currentParentId: null, selectedNodeId: 'scope' })
  expect(
    agendaOriginLocation(document, {
      ...gone,
      origin: { location: { currentParentId: null, selectedNodeId: 'missing' }, cursor: 4 },
    }),
  ).toEqual({ currentParentId: null, selectedNodeId: 'scope' })
})

it('history measures nearest occurrences from the outgoing day rather than a migrated active day', () => {
  const state = selected('node:100:other')
  const header = { ...state, selectedKey: 'day:99' }
  delete header.activeOccurrence
  expect(agendaHistorySelection(document, header, 'match').selectedKey).toBe('node:98:match')
  expect(agendaHistorySelection(document, header, 'missing')).toBe(header)
  expect(agendaHistorySelection(document, state, 'match', 103).selectedKey).toBe('node:102:match')
  const withPin = reconcileAgenda(editNodeText(document, 'match', 'Undated'), selected())!
  const invalid = editNodeText(document, 'match', 'Undated')
  const left = agendaHistorySelection(invalid, withPin, 'context')
  expect(left.pinnedOccurrence).toBeUndefined()
  expect(left.selectedKey).toBe('day:100')
})

it.each([
  ['day:100', 100],
  ['node:12345:node:id', 12345],
  ['node:-123:a', -123],
  ['day:0', 0],
  ['gap:100:110', undefined],
  ['prefixday:100', undefined],
] as const)('extracts the calendar day from %s', (key, expected) => {
  expect(selectedAgendaDay(key)).toBe(expected)
})

it('falls back to an empty displayed day rather than the nearest content occurrence', () => {
  const state = { ...selected(), selectedKey: 'node:99:removed' }
  const rows = buildAgendaRows(agendaProjection(document, state), state)
  expect(reconcileAgendaSelection(state, rows).selectedKey).toBe('day:99')
})
