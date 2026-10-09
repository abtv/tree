import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_DEPTH_ERROR, type Document, type TreeNode } from '../domain/document'
import { agendaProjection, buildAgendaRows } from './agenda-rows'
import { dayKey, openAgendaState, type AgendaState } from './agenda-state'
import { createDayNodeTransition } from './editor-agenda-transitions'

const day = (month: number, date: number): number => dayNumberOf({ year: 2026, month, day: date })
const today = day(10, 8)

function open(scopeParentId: string | null = null): AgendaState {
  return openAgendaState({ currentParentId: scopeParentId, selectedNodeId: scopeParentId ?? 'first' }, 0, today)
}

function rowsOf(document: Document, state: AgendaState) {
  return buildAgendaRows(agendaProjection(document, state), state)
}

const document: Document = {
  roots: [
    { id: 'first', text: '2026-10-15 First', children: [{ id: 'child', text: 'Child', children: [] }] },
    { id: 'second', text: 'Second', children: [] },
  ],
}

// @requirement PRODUCT.md §23.11
describe('creating a dated node from an Agenda day', () => {
  it('appends the dated text as the last root and makes it the active occurrence', () => {
    const state = open()
    const result = createDayNodeTransition(document, state, rowsOf(document, state), day(10, 8), () => 'created')
    if (result === undefined || result.kind === 'rejected') throw new Error('Expected a transition')
    expect(result.document.roots.map((node) => node.id)).toEqual(['first', 'second', 'created'])
    expect(result.document.roots.at(-1)).toEqual({ id: 'created', text: '2026-10-08 ', children: [] })
    expect(result.document.roots[0]).toBe(document.roots[0])
    expect(result.location).toEqual({ currentParentId: null, selectedNodeId: 'created' })
    expect(result.focus).toEqual({ nodeId: 'created', cursor: 11 })
    expect(result.agenda).toMatchObject({
      selectedKey: `node:${day(10, 8)}:created`,
      activeOccurrence: { nodeId: 'created', day: day(10, 8) },
    })
    expect(result.agenda.revealed).toBe(state.revealed)
    expect(document.roots).toHaveLength(2)
  })

  it('appends to the scope node and keeps the scope as the current parent', () => {
    const state = open('first')
    const result = createDayNodeTransition(document, state, rowsOf(document, state), day(10, 9), () => 'created')
    if (result === undefined || result.kind === 'rejected') throw new Error('Expected a transition')
    expect(result.document.roots[0]!.children.map((node) => node.id)).toEqual(['child', 'created'])
    expect(result.location).toEqual({ currentParentId: 'first', selectedNodeId: 'created' })
    expect(result.document.roots[1]).toBe(document.roots[1])
  })

  it('unfolds a collapsed day without touching the original fold set', () => {
    const state = { ...open(), collapsed: new Set([dayKey(day(10, 15)), 'node:other']) }
    const result = createDayNodeTransition(document, state, rowsOf(document, state), day(10, 15), () => 'created')
    if (result === undefined || result.kind === 'rejected') throw new Error('Expected a transition')
    expect([...result.agenda.collapsed]).toEqual(['node:other'])
    expect(state.collapsed.has(dayKey(day(10, 15)))).toBe(true)
  })

  it('reveals a day that lies inside a gap and keeps shown days unchanged', () => {
    const state = open()
    const rows = rowsOf(document, state)
    expect(rows.some((row) => row.kind === 'day' && row.day === day(10, 14))).toBe(false)
    const result = createDayNodeTransition(document, state, rows, day(10, 14), () => 'created')
    if (result === undefined || result.kind === 'rejected') throw new Error('Expected a transition')
    expect([...result.agenda.revealed]).toEqual([day(10, 14)])
    expect(state.revealed.size).toBe(0)
    expect(rowsOf(result.document, result.agenda).some((row) => row.key === result.agenda.selectedKey)).toBe(true)
  })

  it('rejects creation below the maximum depth without allocating an identifier', () => {
    let node: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
    for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1) {
      node = { id: `n${index}`, text: '', children: [node] }
    }
    const deep: Document = { roots: [node] }
    const state = open(`n${MAX_DOCUMENT_DEPTH - 1}`)
    const createId = vi.fn(() => 'created')
    expect(createDayNodeTransition(deep, state, rowsOf(deep, state), today, createId)).toEqual({
      kind: 'rejected',
      message: MAX_DOCUMENT_DEPTH_ERROR,
    })
    expect(createId).not.toHaveBeenCalled()
    const shallower = open(`n${MAX_DOCUMENT_DEPTH - 2}`)
    expect(createDayNodeTransition(deep, shallower, rowsOf(deep, shallower), today, () => 'created')).toMatchObject({
      location: { selectedNodeId: 'created' },
    })
  })

  it('does nothing before the earliest canonical date', () => {
    const state = open()
    const first = dayNumberOf({ year: 0, month: 1, day: 1 })
    const createId = vi.fn(() => 'created')
    expect(createDayNodeTransition(document, state, [], first - 1, createId)).toBeUndefined()
    expect(createId).not.toHaveBeenCalled()
    expect(createDayNodeTransition(document, state, [], first, createId)).toMatchObject({
      document: { roots: [{}, {}, { text: '0000-01-01 ' }] },
    })
  })
})
