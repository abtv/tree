import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_DEPTH_ERROR, type Document, type TreeNode } from '../domain/document'
import { agendaProjection, buildAgendaRows } from './agenda-rows'
import { dayKey, openAgendaState, type AgendaState } from './agenda-state'
import {
  createDayNodeTransition,
  openDatedSiblingTransition,
  splitDatedNodeTransition,
} from './editor-agenda-transitions'

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

const url = 'https://example.com/a'
const splitDocument = (text: string, links: TreeNode['links'] = undefined): Document => ({
  roots: [
    { id: 'a', text, ...(links === undefined ? {} : { links }), children: [{ id: 'kid', text: 'Kid', children: [] }] },
    { id: 'b', text: 'B', children: [] },
  ],
})
const at = { currentParentId: null, selectedNodeId: 'a' }
const split = (doc: Document, cursor: number, displayed = day(10, 14)) =>
  splitDatedNodeTransition(doc, at, open(), displayed, cursor, () => 'new')

// @requirement PRODUCT.md §23.11
describe('splitting a dated node in Agenda', () => {
  it('gives the new part the displayed date, keeps the caret after it, and activates it', () => {
    const doc = splitDocument('2026-10-14 Prepare release')
    const result = split(doc, '2026-10-14 Prepare'.length)
    expect(result.document.roots.map((node) => [node.id, node.text])).toEqual([
      ['a', '2026-10-14 Prepare'],
      ['new', '2026-10-14 release'],
      ['b', 'B'],
    ])
    expect(result.document.roots[0]!.children.map((node) => node.id)).toEqual(['kid'])
    expect(result.location).toEqual({ currentParentId: null, selectedNodeId: 'new' })
    expect(result.focus).toEqual({ nodeId: 'new', cursor: 11 })
    expect(result.agenda).toMatchObject({
      selectedKey: `node:${day(10, 14)}:new`,
      activeOccurrence: { nodeId: 'new', day: day(10, 14) },
    })
    expect(doc.roots[0]!.text).toBe('2026-10-14 Prepare release')
  })

  it('adds no date when the new part already holds the displayed day', () => {
    const result = split(splitDocument('Prepare 2026-10-14 now'), 'Prepare'.length)
    expect(result.document.roots[1]).toEqual({ id: 'new', text: ' 2026-10-14 now', children: [] })
    expect(result.focus.cursor).toBe(0)
  })

  it('inherits only the displayed day and leaves other dates in the new part', () => {
    const result = split(splitDocument('2026-10-14 One 2026-10-20 Two'), '2026-10-14 One'.length)
    expect(result.document.roots[1]!.text).toBe('2026-10-14 2026-10-20 Two')
  })

  it('inserts a dated empty node before when the caret is at the start of non-empty text', () => {
    const doc = splitDocument('2026-10-14 Prepare')
    const result = split(doc, 0)
    expect(result.document.roots.map((node) => [node.id, node.text])).toEqual([
      ['new', '2026-10-14 '],
      ['a', '2026-10-14 Prepare'],
      ['b', 'B'],
    ])
    expect(result.document.roots[1]).toBe(doc.roots[0])
    expect(result.focus).toEqual({ nodeId: 'new', cursor: 11 })
  })

  it('splits an empty node into a dated empty node after it', () => {
    const result = split(splitDocument(''), 0)
    expect(result.document.roots.map((node) => [node.id, node.text])).toEqual([
      ['a', ''],
      ['new', '2026-10-14 '],
      ['b', 'B'],
    ])
    expect(result.focus.cursor).toBe(11)
  })

  it('keeps hyperlink offsets behind the inserted date and in the left part', () => {
    const text = `Go ${url} then ${url}`
    const links = [
      { start: 3, end: 3 + url.length, url },
      { start: text.length - url.length, end: text.length, url },
    ]
    const result = split(splitDocument(text, links), `Go ${url}`.length)
    const left = result.document.roots[0]!
    const right = result.document.roots[1]!
    expect(left.text).toBe(`Go ${url}`)
    expect(left.links).toEqual([links[0]])
    expect(right.text).toBe(`2026-10-14 then ${url}`)
    expect(right.links).toHaveLength(1)
    expect(right.text.slice(right.links![0]!.start, right.links![0]!.end)).toBe(url)
  })
})

// @requirement PRODUCT.md §23.11
describe('opening a dated sibling beside a dated node', () => {
  it.each([
    ['after', ['a', 'new', 'b']],
    ['before', ['new', 'a', 'b']],
  ] as const)('creates the sibling %s the node with the displayed date and the caret after it', (position, ids) => {
    const doc = splitDocument('2026-10-14 Prepare')
    const result = openDatedSiblingTransition(doc, at, open(), day(10, 20), position, () => 'new')
    expect(result.document.roots.map((node) => node.id)).toEqual(ids)
    expect(result.document.roots.find((node) => node.id === 'new')).toEqual({
      id: 'new',
      text: '2026-10-20 ',
      children: [],
    })
    expect(result.document.roots.find((node) => node.id === 'a')).toBe(doc.roots[0])
    expect(result.location).toEqual({ currentParentId: null, selectedNodeId: 'new' })
    expect(result.focus).toEqual({ nodeId: 'new', cursor: 11 })
    expect(result.agenda).toMatchObject({
      selectedKey: `node:${day(10, 20)}:new`,
      activeOccurrence: { nodeId: 'new', day: day(10, 20) },
    })
  })

  it('creates a sibling after a node with children, not a child', () => {
    const result = openDatedSiblingTransition(
      splitDocument('2026-10-14 Prepare'),
      at,
      open(),
      day(10, 14),
      'after',
      () => 'new',
    )
    expect(result.document.roots[0]!.children.map((node) => node.id)).toEqual(['kid'])
    expect(result.document.roots.map((node) => node.id)).toEqual(['a', 'new', 'b'])
  })
})
