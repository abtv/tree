import { afterEach, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import type { Location, TreeNode } from '../domain/document'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { AgendaRowsCache } from './agenda-rows'

export const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
export const roots: TreeNode[] = [
  {
    id: 'scope',
    text: '2026-10-08 Scope',
    children: [
      { id: 'context', text: 'Context', children: [{ id: 'match', text: '2026-10-14 Match', children: [] }] },
      { id: 'other', text: '2026-10-28 Other', children: [] },
    ],
  },
  { id: 'outside', text: '2026-10-08 Outside', children: [] },
]

export async function agendaHarness(location: Location = { currentParentId: null, selectedNodeId: 'scope' }) {
  const save = vi.fn(async () => undefined)
  const services: EditorServices = {
    today: () => today,
    load: async () => ({ version: 4, document: { roots }, location, view: { expandedIds: [], selectedRowTop: 42 } }),
    save,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'unused')
  await store.initialize()
  return { store, services, save }
}

export function ready(store: EditorStore): ReadySnapshot {
  const snapshot = store.getSnapshot()
  if (snapshot.status !== 'ready') throw new Error('Expected ready editor')
  return snapshot
}

afterEach(() => vi.useRealTimers())

it('ends text grouping at open, close, day selection, and real-row reselection', async () => {
  for (const transition of ['open', 'close', 'day', 'real'] as const) {
    const { store } = await agendaHarness()
    if (transition !== 'open') store.openAgenda()
    const key = `node:${today}:scope`
    if (transition === 'real') store.applyAgenda({ kind: 'select', key })
    store.editText('scope', '2026-10-08 First')
    if (transition === 'open') store.openAgenda()
    else if (transition === 'close') store.closeAgenda()
    else store.applyAgenda({ kind: 'select', key: transition === 'day' ? `day:${today + 1}` : key })
    store.editText('scope', '2026-10-08 Second')
    store.closeAgenda()
    store.undo()
    expect(ready(store).document.roots[0]!.text).toBe('2026-10-08 First')
    store.undo()
    expect(ready(store).document.roots[0]!.text).toBe('2026-10-08 Scope')
    await store.flushPersistence()
  }
})

it('releases the derived cache when closing and does not republish focus on an unrelated fold', async () => {
  const { store } = await agendaHarness()
  const clear = vi.spyOn(AgendaRowsCache.prototype, 'clear')
  try {
    store.openAgenda()
    const rows = store.getAgendaRows()
    const match = rows.find((row) => row.kind === 'node' && row.nodeId === 'match')!
    const outside = rows.find((row) => row.kind === 'node' && row.nodeId === 'outside')!
    store.applyAgenda({ kind: 'select', key: outside.key, cursor: 2 })
    const focus = ready(store).focus
    store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 6}` })
    expect(ready(store).focus).toBe(focus)
    expect(ready(store).agenda!.selectedKey).toBe(outside.key)
    store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 6}` })
    store.applyAgenda({ kind: 'select', key: match.key, cursor: 3 })
    store.applyAgenda({ kind: 'toggle-fold', key: `day:${today}` })
    expect(ready(store).agenda!.selectedKey).toBe(match.key)
    store.closeAgenda()
    expect(clear).toHaveBeenCalledOnce()
  } finally {
    clear.mockRestore()
  }
})

it.each([null, 'scope'] as const)(
  'opens from %s, captures cursor/Today, and restores origin without altering Tree',
  async (parent) => {
    const location = { currentParentId: parent, selectedNodeId: parent === null ? 'scope' : 'context' }
    const { store, services, save } = await agendaHarness(location)
    const before = ready(store)
    store.openAgenda(5)
    expect(ready(store)).toMatchObject({ agenda: { scopeParentId: parent, today, selectedKey: `day:${today}` } })
    const nodes = store
      .getAgendaRows()
      .filter((row) => row.kind === 'node')
      .map((row) => row.nodeId)
    expect(nodes.includes('outside')).toBe(parent === null)
    expect(nodes.includes('scope')).toBe(parent === null)
    services.today = () => today + 1
    const opened = ready(store)
    store.openAgenda()
    expect(ready(store)).toBe(opened)
    expect(ready(store).agenda!.today).toBe(today)
    store.applyAgenda({
      kind: 'select',
      key: store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'match')!.key,
      cursor: 3,
    })
    expect(ready(store).location).toEqual({ ...location, selectedNodeId: 'match' })
    expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 3 })
    store.closeAgenda()
    const closed = ready(store)
    expect(closed.agenda).toBeUndefined()
    expect(closed.location).toEqual(location)
    expect(closed.focus).toMatchObject({ nodeId: location.selectedNodeId, cursor: 5 })
    expect(closed.focus.token).toBeGreaterThan(before.focus.token)
    expect(closed.expansion).toBe(before.expansion)
    expect(closed.document).toBe(before.document)
    store.closeAgenda()
    store.applyAgenda({ kind: 'select', key: 'missing' })
    expect(ready(store)).toBe(closed)
    expect(store.getAgendaRows()).toEqual([])
    await store.flushPersistence()
    expect(save).not.toHaveBeenCalled()
    store.openAgenda()
    expect(ready(store).agenda!.today).toBe(today + 1)
  },
)

it('publishes real-row selection and focus atomically, including reselection, and ignores invalid commands', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  const seen: ReadySnapshot[] = []
  store.subscribe(() => seen.push(ready(store)))
  store.applyAgenda({ kind: 'select', key: 'missing' })
  expect(seen).toEqual([])
  const key = store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'match')!.key
  store.applyAgenda({ kind: 'select', key, cursor: 8 })
  expect(seen).toHaveLength(1)
  expect(seen[0]).toMatchObject({
    agenda: { selectedKey: key },
    location: { selectedNodeId: 'match' },
    focus: { nodeId: 'match', cursor: 8 },
  })
  store.applyAgenda({ kind: 'select', key })
  expect(seen).toHaveLength(2)
  expect(ready(store).focus.cursor).toBe(0)
  const focus = ready(store).focus
  store.applyAgenda({ kind: 'select', key: `day:${today}` })
  expect(ready(store).focus).toBe(focus)
  const snapshot = ready(store)
  store.applyAgenda({ kind: 'select', key: `day:${today}` })
  expect(ready(store)).toBe(snapshot)
})

it('keeps folds and gap reveals runtime-only and returns hidden selection to its folding row', async () => {
  const { store, save } = await agendaHarness()
  store.openAgenda()
  const original = ready(store)
  const nodes = store.getAgendaRows().filter((row) => row.kind === 'node')
  const match = nodes.find((row) => row.nodeId === 'match')!
  const context = nodes.find((row) => row.nodeId === 'context')!
  store.applyAgenda({ kind: 'select', key: match.key })
  store.applyAgenda({ kind: 'toggle-fold', key: context.key })
  expect(ready(store)).toMatchObject({
    agenda: { selectedKey: context.key },
    location: { selectedNodeId: 'context' },
    focus: { nodeId: 'context', cursor: 0 },
  })
  expect(store.getAgendaRows().some((row) => row.key === match.key)).toBe(false)
  store.applyAgenda({ kind: 'toggle-fold', key: context.key })
  expect(store.getAgendaRows().some((row) => row.key === match.key)).toBe(true)
  const gap = store.getAgendaRows().find((row) => row.kind === 'gap')!
  store.applyAgenda({ kind: 'toggle-gap', key: gap.key })
  expect(ready(store).agenda!.revealed.size).toBe(7)
  store.applyAgenda({ kind: 'toggle-gap', key: gap.key })
  expect(ready(store).agenda!.revealed.size).toBe(0)
  expect(ready(store).expansion).toBe(original.expansion)
  expect(ready(store).document).toBe(original.document)
  await store.flushPersistence()
  expect(save).not.toHaveBeenCalled()
  store.closeAgenda()
})

it('captures identical serialized Tree state during Agenda even when a save was already pending', async () => {
  const { store, save } = await agendaHarness()
  let measurement = 42
  store.registerSelectedRowTopReader(() => measurement)
  store.noteViewportChange()
  await store.flushPersistence()
  const before = JSON.stringify(save.mock.calls[0])
  save.mockClear()
  measurement = 80
  store.noteViewportChange()
  store.openAgenda()
  measurement = 999
  store.applyAgenda({
    kind: 'select',
    key: store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'match')!.key,
  })
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 6}` })
  await store.flushPersistence()
  expect(JSON.stringify(save.mock.calls[0])).toBe(before.replace('42', '80'))
  expect(save).toHaveBeenCalledTimes(1)
  store.closeAgenda()
  measurement = 80
  store.noteViewportChange()
  await store.flushPersistence()
  expect(JSON.stringify(save.mock.calls[1])).toBe(before.replace('42', '80'))
})

it('uses local system Today without a service override and captures the existing focus cursor', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 8, 23, 59))
  const { store, services } = await agendaHarness()
  delete services.today
  store.selectNode('scope', 6)
  store.openAgenda()
  expect(ready(store).agenda).toMatchObject({ today, origin: { cursor: 6 } })
  vi.setSystemTime(new Date(2026, 9, 9, 0, 1))
  expect(ready(store).agenda!.today).toBe(today)
  store.closeAgenda()
  store.openAgenda()
  expect(ready(store).agenda!.today).toBe(today + 1)
})
