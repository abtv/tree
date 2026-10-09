import { expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_DEPTH_ERROR, type Location, type TreeNode } from '../domain/document'
import { EditorStore, type EditorServices } from './editor-store'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'

const day = (month: number, date: number): number => dayNumberOf({ year: 2026, month, day: date })
const today = day(10, 8)
const roots: TreeNode[] = [
  {
    id: 'scope',
    text: 'Scope',
    children: [{ id: 'match', text: '2026-10-14 Match', children: [] }],
  },
  { id: 'dated', text: '2026-10-20 Dated', children: [] },
]

async function harness(location: Location = { currentParentId: null, selectedNodeId: 'scope' }, document = { roots }) {
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  let next = 0
  const store = new EditorStore(
    {
      today: () => today,
      load: async () => ({ version: 4, document, location, view: { expandedIds: [] } }),
      save,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => `created-${next++}`,
  )
  await store.initialize()
  store.openAgenda()
  return { store, save }
}

function ready(store: EditorStore): ReadySnapshot {
  const snapshot = store.getSnapshot()
  if (snapshot.status !== 'ready') throw new Error('Expected ready editor')
  return snapshot
}

// @requirement PRODUCT.md §23.11
it('creates a dated last root for the selected day as one undoable, persisted change', async () => {
  const { store, save } = await harness()
  const before = ready(store)
  expect(store.createAgendaDayNode('selected')).toBe(true)
  const created = ready(store)
  expect(created.document.roots.map((node) => node.id)).toEqual(['scope', 'dated', 'created-0'])
  expect(created.document.roots.at(-1)!.text).toBe('2026-10-08 ')
  expect(created.agenda).toMatchObject({
    selectedKey: `node:${today}:created-0`,
    activeOccurrence: { nodeId: 'created-0', day: today },
  })
  expect(created.location).toEqual({ currentParentId: null, selectedNodeId: 'created-0' })
  expect(created.focus).toMatchObject({ nodeId: 'created-0', cursor: 11 })
  expect(created.expansion).toBe(before.expansion)
  store.undo()
  expect(ready(store).document).toBe(before.document)
  expect(store.getAgendaRows().some((row) => row.key === ready(store).agenda!.selectedKey)).toBe(true)
  store.redo()
  expect(ready(store).document).toBe(created.document)
  expect(ready(store).agenda!.selectedKey).toBe(`node:${today}:created-0`)
  await store.flushPersistence()
  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0]).toMatchObject({ location: { currentParentId: null, selectedNodeId: 'scope' } })
  expect(save.mock.calls[0]![0].document.roots.at(-1)!.text).toBe('2026-10-08 ')
})

// @requirement PRODUCT.md §23.11
it('creates for the preceding day from a gap neighbour and reveals it', async () => {
  const { store } = await harness()
  store.applyAgenda({ kind: 'select', key: `day:${day(10, 20)}` })
  expect(store.getAgendaRows().some((row) => row.key === `day:${day(10, 19)}`)).toBe(false)
  expect(store.createAgendaDayNode('preceding')).toBe(true)
  expect(ready(store).document.roots.at(-1)!.text).toBe('2026-10-19 ')
  expect(ready(store).agenda!.revealed.has(day(10, 19))).toBe(true)
  expect(ready(store).agenda!.selectedKey).toBe(`node:${day(10, 19)}:created-0`)
})

// @requirement PRODUCT.md §23.11
it('appends inside a nested scope and keeps the scope as the current parent', async () => {
  const { store } = await harness({ currentParentId: 'scope', selectedNodeId: 'match' })
  const before = ready(store)
  expect(store.createAgendaDayNode('selected')).toBe(true)
  const state = ready(store)
  expect(state.document.roots[0]!.children.map((node) => node.id)).toEqual(['match', 'created-0'])
  expect(state.location).toEqual({ currentParentId: 'scope', selectedNodeId: 'created-0' })
  expect(state.document.roots[1]).toBe(before.document.roots[1])
})

// @requirement PRODUCT.md §23.11
it('does nothing away from a day container, outside Agenda, or while persistence is locked', async () => {
  const { store, save } = await harness()
  store.applyAgenda({ kind: 'select', key: `node:${day(10, 14)}:match` })
  const onNode = ready(store)
  expect(store.createAgendaDayNode('selected')).toBe(false)
  expect(ready(store)).toBe(onNode)
  const gap = store.getAgendaRows().find((row) => row.kind === 'gap')!
  store.applyAgenda({ kind: 'select', key: gap.key })
  const onGap = ready(store)
  expect(store.createAgendaDayNode('preceding')).toBe(false)
  expect(ready(store)).toBe(onGap)

  store.applyAgenda({ kind: 'select', key: `day:${today}` })
  const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime
  runtime.replaceReady({ ...ready(store), persistenceLocked: true })
  const locked = ready(store)
  expect(store.createAgendaDayNode('selected')).toBe(false)
  expect(ready(store)).toBe(locked)
  runtime.replaceReady({ ...ready(store), persistenceLocked: false })

  store.closeAgenda()
  const closed = ready(store)
  expect(store.createAgendaDayNode('selected')).toBe(false)
  expect(ready(store)).toBe(closed)
  await store.flushPersistence()
  expect(save).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §23.11
it('reports the depth error and changes nothing when the scope cannot take another child', async () => {
  let node: TreeNode = { id: `n${MAX_DOCUMENT_DEPTH - 1}`, text: '', children: [] }
  for (let index = MAX_DOCUMENT_DEPTH - 2; index >= 0; index -= 1) {
    node = { id: `n${index}`, text: '', children: [node] }
  }
  const { store } = await harness(
    { currentParentId: `n${MAX_DOCUMENT_DEPTH - 1}`, selectedNodeId: `n${MAX_DOCUMENT_DEPTH - 1}` },
    { roots: [node] },
  )
  const before = ready(store)
  expect(store.createAgendaDayNode('selected')).toBe(false)
  expect(ready(store).document).toBe(before.document)
  expect(ready(store).operationError).toBe(MAX_DOCUMENT_DEPTH_ERROR)
})

// @requirement PRODUCT.md §23.11
it('splits a dated node into two dated nodes as one undoable, persisted change', async () => {
  const { store, save } = await harness()
  store.applyAgenda({ kind: 'select', key: `node:${day(10, 20)}:dated` })
  const before = ready(store)
  expect(store.splitAgendaNode('2026-10-20 Da'.length)).toBe(true)
  const after = ready(store)
  expect(after.document.roots.map((node) => [node.id, node.text])).toEqual([
    ['scope', 'Scope'],
    ['dated', '2026-10-20 Da'],
    ['created-0', '2026-10-20 ted'],
  ])
  expect(after.location).toEqual({ currentParentId: null, selectedNodeId: 'created-0' })
  expect(after.focus).toMatchObject({ nodeId: 'created-0', cursor: 11 })
  expect(after.agenda).toMatchObject({
    selectedKey: `node:${day(10, 20)}:created-0`,
    activeOccurrence: { nodeId: 'created-0', day: day(10, 20) },
  })
  expect(store.getAgendaRows().filter((row) => row.kind === 'node' && row.day === day(10, 20))).toHaveLength(2)
  store.undo()
  expect(ready(store).document).toBe(before.document)
  expect(ready(store).agenda!.selectedKey).toBe(`node:${day(10, 20)}:dated`)
  store.redo()
  expect(ready(store).document).toBe(after.document)
  await store.flushPersistence()
  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0].document.roots.map((node) => node.text)).toEqual([
    'Scope',
    '2026-10-20 Da',
    '2026-10-20 ted',
  ])
})

// @requirement PRODUCT.md §23.11
it('opens a dated real sibling after or before a dated node, as one undoable change', async () => {
  const { store } = await harness({ currentParentId: 'scope', selectedNodeId: 'match' })
  store.applyAgenda({ kind: 'select', key: `node:${day(10, 14)}:match` })
  const before = ready(store)
  expect(store.createAgendaSibling('after')).toBe(true)
  expect(ready(store).document.roots[0]!.children.map((node) => [node.id, node.text])).toEqual([
    ['match', '2026-10-14 Match'],
    ['created-0', '2026-10-14 '],
  ])
  expect(ready(store).focus).toMatchObject({ nodeId: 'created-0', cursor: 11 })
  expect(ready(store).agenda!.activeOccurrence).toEqual({ nodeId: 'created-0', day: day(10, 14) })
  store.undo()
  expect(ready(store).document).toBe(before.document)
  store.applyAgenda({ kind: 'select', key: `node:${day(10, 14)}:match` })
  expect(store.createAgendaSibling('before')).toBe(true)
  expect(ready(store).document.roots[0]!.children.map((node) => node.id)).toEqual(['created-1', 'match'])
})

// @requirement PRODUCT.md §23.11
it('does not split or open siblings away from a direct match, outside Agenda, or while locked', async () => {
  const { store, save } = await harness()
  const attempt = (): boolean[] => [store.splitAgendaNode(0), store.createAgendaSibling('after')]
  const unchanged = ready(store)
  // A day container, a gap, and a contextual ancestor are never splittable.
  expect(attempt()).toEqual([false, false])
  const gap = store.getAgendaRows().find((row) => row.kind === 'gap')!
  store.applyAgenda({ kind: 'select', key: gap.key })
  expect(attempt()).toEqual([false, false])
  store.applyAgenda({ kind: 'select', key: `node:${day(10, 14)}:scope` })
  expect(attempt()).toEqual([false, false])
  expect(ready(store).document).toBe(unchanged.document)

  store.applyAgenda({ kind: 'select', key: `node:${day(10, 20)}:dated` })
  const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime
  runtime.replaceReady({ ...ready(store), persistenceLocked: true })
  const locked = ready(store)
  expect(attempt()).toEqual([false, false])
  expect(ready(store)).toBe(locked)
  runtime.replaceReady({ ...ready(store), persistenceLocked: false })

  store.closeAgenda()
  const closed = ready(store)
  expect(attempt()).toEqual([false, false])
  expect(ready(store)).toBe(closed)
  await store.flushPersistence()
  expect(save).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §23.11
it('does nothing for the day before the earliest canonical date', async () => {
  const first = dayNumberOf({ year: 0, month: 1, day: 1 })
  const { store } = await harness()
  const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime
  const state = ready(store)
  runtime.replaceReady({ ...state, agenda: { ...state.agenda!, today: first, selectedKey: `day:${first}` } })
  const before = ready(store)
  expect(store.createAgendaDayNode('preceding')).toBe(false)
  expect(ready(store)).toBe(before)
  expect(store.createAgendaDayNode('selected')).toBe(true)
  expect(ready(store).document.roots.at(-1)!.text).toBe('0000-01-01 ')
})
