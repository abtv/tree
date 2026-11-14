import { pinnedAgendaOccurrence, activeAgendaOccurrence } from './agenda-state'
import { afterEach, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import type { Location, TreeNode } from '../domain/document'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { AgendaRowsCache } from './agenda-rows'
import { EditorRuntimeState } from './editor-runtime-state'

export const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
export const roots: TreeNode[] = [
  {
    id: 'scope',
    text: '2026-10-08 Scope',
    children: [
      { id: 'context', text: 'Context', children: [{ id: 'match', text: '2026-10-09 Match', children: [] }] },
      { id: 'other', text: '2026-10-11 Other', children: [] },
    ],
  },
  { id: 'outside', text: '2026-10-08 Outside', children: [] },
]

export async function agendaHarness(location: Location = { currentParentId: null, selectedNodeId: 'scope' }) {
  const save = vi.fn<EditorServices['save']>(async () => undefined)
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

// @requirement PRODUCT.md §22.2
it('reuses the unchanged Agenda projection and rows across repeated view switches', async () => {
  const { store, save } = await agendaHarness()
  store.openAgenda()
  const rows = store.getAgendaRows()

  for (let index = 0; index < 20; index++) {
    store.closeAgenda()
    store.openAgenda()

    expect(store.getAgendaRows()).toBe(rows)
    expect(ready(store).agenda!.selectedKey).toBe(`day:${today}`)
  }

  await store.flushPersistence()

  expect(save).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §22.1
it('releases a retained Agenda projection when its document changes in Tree', async () => {
  vi.useFakeTimers()
  const { store } = await agendaHarness()
  store.openAgenda()
  store.closeAgenda()
  const clear = vi.spyOn(AgendaRowsCache.prototype, 'clear')
  try {
    store.editText('outside', '2026-10-09 Changed in Tree')

    expect(clear).toHaveBeenCalledOnce()

    store.openAgenda()

    expect(
      store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'outside' && row.day === today + 1),
    ).toBe(true)
  } finally {
    clear.mockRestore()
  }
})

// @requirement PRODUCT.md §23.9
it('attaches the first clipboard image in Agenda and rejects a second before writing or creating a sibling', async () => {
  vi.useFakeTimers()
  const { store, services } = await agendaHarness()
  services.readClipboard = async () => ({ kind: 'image', png: new Uint8Array([1, 2]) })
  const write = vi.spyOn(services, 'writeAttachment')
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:outside` })

  await store.paste('outside', '2026-10-08 Outside'.length)
  await store.flushPersistence()
  const before = ready(store)

  expect(before.document.roots[1]!.attachment).toEqual({ id: 'unused', mimeType: 'image/png' })
  expect(write).toHaveBeenCalledExactlyOnceWith('unused', new Uint8Array([1, 2]))

  await store.paste('outside', '2026-10-08 Outside'.length)
  await store.flushPersistence()

  expect(write).toHaveBeenCalledTimes(1)
  expect(ready(store).document).toBe(before.document)
  expect(ready(store).focus).toBe(before.focus)

  store.undo()

  expect(ready(store).document).toEqual({ roots })
})

// @requirement PRODUCT.md §23.9
it('keeps concurrent image pastes in Agenda from creating a sibling after an attachment write completes', async () => {
  vi.useFakeTimers()
  const writes: (() => void)[] = []
  let id = 0
  const document = { roots: [{ id: 'image', text: '2026-10-08 Image', children: [] }] }
  const store = new EditorStore(
    {
      today: () => today,
      load: async () => ({
        version: 1,
        document,
        location: { currentParentId: null, selectedNodeId: 'image' },
      }),
      save: async () => undefined,
      readClipboard: async () => ({ kind: 'image', png: new Uint8Array([1, 2]) }),
      writeAttachment: () => new Promise<void>((resolve) => writes.push(resolve)),
      cleanupAttachments: async () => undefined,
    },
    () => `attachment-${++id}`,
  )
  await store.initialize()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:image` })

  const first = store.paste('image', 0)
  const second = store.paste('image', 0)
  await vi.waitFor(() => expect(writes).toHaveLength(2))
  writes[0]!()
  await first
  writes[1]!()
  await second
  await store.flushPersistence()

  expect(ready(store).document.roots).toEqual([
    { ...document.roots[0], attachment: { id: 'attachment-1', mimeType: 'image/png' } },
  ])
  expect(ready(store).agenda!.selectedKey).toBe(`node:${today}:image`)

  store.undo()

  expect(ready(store).document).toEqual(document)
})

// @requirement PRODUCT.md §20.2.26
it.each(['toggle-fold', 'fold'] as const)(
  'preserves a manual %s choice after leaving a search-opened day',
  async (kind) => {
    vi.useFakeTimers()
    const { store } = await agendaHarness()
    const key = `day:${today + 1}`
    store.openAgenda()
    store.applyAgenda({ kind: 'fold', key, operation: 'close' })
    store.search.begin(store.searchOrigin(0))
    store.search.edit('Match')
    store.search.confirm()
    await vi.advanceTimersByTimeAsync(100)

    expect(ready(store).agenda!.collapsed.has(key)).toBe(false)

    if (kind === 'fold') store.applyAgenda({ kind, key, operation: 'open' })
    else {
      store.applyAgenda({ kind, key })
      store.applyAgenda({ kind, key })
    }
    store.applyAgenda({ kind: 'select', key: `node:${today}:outside` })
    store.hideSearch()

    expect(ready(store).agenda!.collapsed.has(key)).toBe(false)
  },
)

it.each(['node', 'day'] as const)('preserves Agenda %s focus after undoing net-zero typing', async (kind) => {
  const { store } = await agendaHarness()
  store.editText('outside', '2026-10-08 Changed')
  store.editText('outside', '2026-10-08 Outside')
  store.openAgenda()
  const key = kind === 'node' ? `node:${today}:outside` : `day:${today}`
  store.applyAgenda({ kind: 'select', key, cursor: 12 })
  const before = ready(store)

  store.undo()

  expect(ready(store).document).toEqual(before.document)
  expect(ready(store).focus).toBe(before.focus)
  expect(ready(store).agenda?.selectedKey).toBe(key)
  await store.flushPersistence()
})

it('keeps search ownership when an opened Agenda day is selected without folding it', async () => {
  vi.useFakeTimers()
  const { store } = await agendaHarness()
  store.openAgenda()
  const contextKey = `day:${today + 1}`
  store.applyAgenda({ kind: 'fold', key: contextKey, operation: 'close' })
  store.search.begin(store.searchOrigin(0))
  store.search.edit('Match')
  store.search.confirm()
  await vi.advanceTimersByTimeAsync(100)

  expect(ready(store).agenda!.collapsed.has(contextKey)).toBe(false)
  store.applyAgenda({ kind: 'select', key: contextKey })
  store.applyAgenda({ kind: 'select', key: `node:${today}:outside` })
  store.hideSearch()

  expect(ready(store).agenda!.collapsed.has(contextKey)).toBe(true)
})

it('publishes and hides Agenda search while separating typing around the search jump', async () => {
  vi.useFakeTimers()
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match` })
  store.editText('match', '2026-10-09 First needle')
  const first = ready(store).document

  store.search.begin(store.searchOrigin(0))
  store.search.edit('needle')
  store.search.confirm()
  await vi.advanceTimersByTimeAsync(100)

  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 17, revealLine: true })
  expect(ready(store).location).toEqual({ currentParentId: null, selectedNodeId: 'match' })
  store.hideSearch()
  expect(store.search.session.getSnapshot().visible).toBe(false)

  store.editText('match', '2026-10-09 Second')
  store.undo()

  expect(ready(store).document).toEqual(first)
  await store.flushPersistence()
})

it('cancels an unfinished search when selecting an Agenda occurrence', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.search.begin(store.searchOrigin(0))
  store.search.edit('Match')

  store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match`, cursor: 4 })

  expect(store.search.session.getSnapshot().draft).toBeUndefined()
  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 4 })
})

it.each(['unrelated-fold', 'reselect'] as const)('respects the typing boundary for %s in Agenda', async (command) => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match` })
  const original = ready(store).document
  store.editText('match', '2026-10-09 First')
  const first = ready(store).document

  if (command === 'reselect') store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match` })
  else store.applyAgenda({ kind: 'toggle-fold', key: `day:${today}` })
  store.editText('match', '2026-10-09 Second')
  store.undo()

  expect(ready(store).document).toEqual(command === 'reselect' ? first : original)
  await store.flushPersistence()
})

it('keeps a restored date folded when undo changes the active occurrence day', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:scope` })
  store.editText('scope', '2026-10-11 Scope')
  store.applyAgenda({ kind: 'fold', key: `day:${today}`, operation: 'close' })
  const collapsed = ready(store).agenda!.collapsed

  store.undo()

  expect(ready(store).agenda!.collapsed).toBe(collapsed)
  expect(ready(store).agenda!.collapsed.has(`day:${today}`)).toBe(true)
  expect(store.getAgendaRows().some((row) => row.key === `node:${today}:scope`)).toBe(false)
  await store.flushPersistence()
})

it('recursive day folds hide the flat entries and opening the day restores them', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `node:${today + 1}:scope` })

  store.applyAgenda({ kind: 'fold', key: `day:${today + 1}`, operation: 'close-recursive' })

  expect([...ready(store).agenda!.collapsed]).toEqual([`day:${today + 1}`])

  store.applyAgenda({ kind: 'fold', key: `day:${today + 1}`, operation: 'open' })
  store.applyAgenda({ kind: 'fold', key: `node:${today + 1}:scope`, operation: 'open' })

  expect(store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'match')).toBe(true)
})

it('restores the real selection from another day when returning to the timeline', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match` })
  store.applyAgenda({ kind: 'focus-day', key: `day:${today}`, scrollTop: 0 })
  store.applyAgenda({ kind: 'select', key: `node:${today}:outside` })

  store.applyAgenda({ kind: 'return-timeline', key: `day:${today}` })

  expect(ready(store).agenda?.selectedKey).toBe(`node:${today + 1}:match`)
  expect(ready(store).location.selectedNodeId).toBe('match')
  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 0 })
})

it('returns to a visible day when the timeline selection was an expired pin', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match` })
  store.editText('match', '')
  store.applyAgenda({ kind: 'focus-day', key: `day:${today}`, scrollTop: 0 })

  store.applyAgenda({ kind: 'return-timeline', key: `day:${today}` })

  expect(ready(store).agenda?.selectedKey).toBe(`day:${today + 1}`)
  expect(store.getAgendaRows().some((row) => row.key === ready(store).agenda?.selectedKey)).toBe(true)
})

// @requirement PRODUCT.md §23.7
// @requirement PRODUCT.md §23.8
it('pins the last date through Undo/Redo and leaves it only on another selection, without a history entry', async () => {
  const { store, save } = await agendaHarness({ currentParentId: 'scope', selectedNodeId: 'context' })

  store.openAgenda()
  const key = `node:${today + 1}:match`

  store.applyAgenda({ kind: 'select', key, cursor: 12 })
  const original = ready(store)

  store.editText('match', 'Undated')

  expect(ready(store).agenda).toMatchObject({
    selectedKey: key,
    activity: { kind: 'pinned-until-leave' as const, occurrence: { nodeId: 'match', day: today + 1 } },
  })
  expect(ready(store).focus).toBe(original.focus)
  expect(store.getAgendaRows().some((row) => row.key === key)).toBe(true)

  store.undo()

  expect(ready(store).document).toBe(original.document)
  expect(pinnedAgendaOccurrence(ready(store).agenda!)).toBeUndefined()
  expect(ready(store).agenda!.selectedKey).toBe(key)

  store.redo()

  expect(pinnedAgendaOccurrence(ready(store).agenda!)).toBeDefined()

  store.applyAgenda({ kind: 'select', key: `day:${today}` })

  expect(pinnedAgendaOccurrence(ready(store).agenda!)).toBeUndefined()
  expect(store.getAgendaRows().some((row) => row.key === key)).toBe(false)

  store.undo()

  expect(ready(store).document).toBe(original.document)
  expect(ready(store).agenda!.selectedKey).toBe(key)
  expect(ready(store).location.currentParentId).toBe('scope')

  await store.flushPersistence()

  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0]).not.toHaveProperty('agenda')
})

// @requirement PRODUCT.md §23.8
it('history preserves Agenda day folds and focus for hidden or out-of-scope changes', async () => {
  const { store } = await agendaHarness({ currentParentId: 'scope', selectedNodeId: 'context' })

  store.editText('outside', '2026-10-08 Changed outside')
  store.openAgenda()
  const key = `node:${today + 1}:match`

  store.applyAgenda({ kind: 'select', key, cursor: 7 })
  const before = ready(store)

  store.undo()

  expect(ready(store).agenda).toBe(before.agenda)
  expect(ready(store).location).toEqual(before.location)
  expect(ready(store).focus).toBe(before.focus)

  store.redo()

  expect(ready(store).agenda).toBe(before.agenda)
  expect(ready(store).focus).toBe(before.focus)

  store.editText('match', '2026-10-09 Changed')
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  const folded = ready(store)

  store.undo()

  expect(ready(store).agenda!.collapsed).toBe(folded.agenda!.collapsed)
  expect(ready(store).agenda!.selectedKey).toBe(folded.agenda!.selectedKey)
  expect(ready(store).focus).toBe(folded.focus)
  expect(ready(store).location.currentParentId).toBe('scope')

  await store.flushPersistence()
})

// @requirement PRODUCT.md §23.7
it('clears a pin when its day is selected, maintaining a valid visible selection', async () => {
  const { store } = await agendaHarness({ currentParentId: 'scope', selectedNodeId: 'context' })

  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match` })
  store.editText('match', 'No date')
  store.applyAgenda({ kind: 'select', key: `day:${today + 1}` })

  expect(pinnedAgendaOccurrence(ready(store).agenda!)).toBeUndefined()
  expect(store.getAgendaRows().some((row) => row.key === ready(store).agenda!.selectedKey)).toBe(true)

  store.closeAgenda()

  expect(ready(store).location).toEqual({ currentParentId: 'scope', selectedNodeId: 'context' })

  await store.flushPersistence()
})

it('closes Agenda when its scope disappears and normalizes a deleted origin on close', async () => {
  const { store } = await agendaHarness()
  store.createSiblingOrFirstChild(0)
  store.selectNode('unused', 0)

  store.enter()
  store.openAgenda()

  expect(ready(store).agenda!.scopeParentId).toBe('unused')

  store.undo()

  expect(ready(store).agenda).toBeUndefined()
  expect(ready(store).location).toEqual({ currentParentId: null, selectedNodeId: 'scope' })
  expect(ready(store).focus.nodeId).toBe('scope')

  await store.flushPersistence()

  const origin = await agendaHarness()

  origin.store.deleteSelected()
  origin.store.undo()
  origin.store.openAgenda()
  origin.store.redo()
  origin.store.closeAgenda()

  expect(ready(origin.store).location.selectedNodeId).toBe('outside')

  await origin.store.flushPersistence()
})

it('rejects edits and history while persistence is locked, but allows leaving a pinned item', async () => {
  const { store } = await agendaHarness()

  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:scope` })
  store.editText('scope', 'No date')
  // The lock itself is tested through real save failures elsewhere; inject only its ready state here.
  const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime

  runtime.replaceReady({ ...ready(store), persistenceLocked: true })
  const before = ready(store)

  store.editText('scope', '2026-10-08 Forbidden')
  store.undo()
  store.redo()

  expect(ready(store)).toBe(before)

  store.applyAgenda({ kind: 'select', key: `day:${today}` })

  expect(pinnedAgendaOccurrence(ready(store).agenda!)).toBeUndefined()
  expect(ready(store).document).toBe(before.document)
})

// @requirement PRODUCT.md §23.8
it('publishes the change-site cursor and real-node selection when history switches occurrences', async () => {
  const { store } = await agendaHarness()

  store.editText('match', '2026-10-09 2026-10-10 Match')
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:outside`, cursor: 2 })
  const before = ready(store)

  store.undo()

  expect(ready(store).agenda!.selectedKey).toBe(`node:${today + 1}:match`)
  expect(ready(store).location).toEqual({ currentParentId: null, selectedNodeId: 'match' })
  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 11 })
  expect(ready(store).focus.token).toBeGreaterThan(before.focus.token)

  const undone = ready(store).focus

  store.redo()

  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 11 })
  expect(ready(store).focus.token).toBeGreaterThan(undone.token)

  await store.flushPersistence()
})

// @requirement PRODUCT.md §23.8
it('uses the selected day for history proximity and retains focus for path-only change sites', async () => {
  const { store } = await agendaHarness({ currentParentId: 'scope', selectedNodeId: 'context' })

  store.editText('match', '2026-10-09 Match 2026-10-10')
  store.endTextSession()
  store.editText('match', '2026-10-09 Changed 2026-10-10')
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `day:${today + 2}` })
  store.undo()

  expect(ready(store).agenda!.selectedKey).toBe(`node:${today + 2}:match`)
  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 11 })
  expect(ready(store).location).toEqual({ currentParentId: 'scope', selectedNodeId: 'match' })

  store.closeAgenda()
  store.editText('context', 'Modified context')
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today + 3}:other`, cursor: 5 })
  const before = ready(store).focus

  store.undo()

  expect(ready(store).agenda!.selectedKey).toBe(`node:${today + 3}:other`)
  expect(activeAgendaOccurrence(ready(store).agenda!)).toEqual({ nodeId: 'other', day: today + 3 })
  expect(ready(store).location).toEqual({ currentParentId: 'scope', selectedNodeId: 'other' })
  expect(ready(store).focus).toBe(before)

  await store.flushPersistence()
})

it('history keeps a valid Root location when deleting the selected last projected branch', async () => {
  const { store } = await agendaHarness()

  store.editText('outside', 'Undated outside')
  store.deleteSelected()
  store.undo()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:scope` })

  expect(ready(store).location.selectedNodeId).toBe('scope')

  store.redo()

  expect(ready(store).agenda!.selectedKey).toBe(`day:${today}`)
  expect(ready(store).location).toEqual({ currentParentId: null, selectedNodeId: 'outside' })
  expect(ready(store).focus).toMatchObject({ nodeId: 'outside', cursor: 0 })

  await store.flushPersistence()
})

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

it('keeps the derived cache warm when closing and does not republish focus on an unrelated fold', async () => {
  const { store } = await agendaHarness()
  const clear = vi.spyOn(AgendaRowsCache.prototype, 'clear')
  try {
    store.openAgenda()
    const rows = store.getAgendaRows()
    const match = rows.find((row) => row.kind === 'node' && row.nodeId === 'match')!
    const outside = rows.find((row) => row.kind === 'node' && row.nodeId === 'outside')!

    store.applyAgenda({ kind: 'select', key: outside.key, cursor: 2 })
    const focus = ready(store).focus

    store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })

    expect(ready(store).focus).toBe(focus)
    expect(ready(store).agenda!.selectedKey).toBe(outside.key)

    store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
    store.applyAgenda({ kind: 'select', key: match.key, cursor: 3 })
    store.applyAgenda({ kind: 'toggle-fold', key: `day:${today}` })

    expect(ready(store).agenda!.selectedKey).toBe(match.key)

    store.closeAgenda()

    expect(clear).not.toHaveBeenCalled()
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
  expect(seen[0]!.focus).not.toHaveProperty('revealLine')

  store.applyAgenda({ kind: 'select', key })

  expect(seen).toHaveLength(2)
  expect(ready(store).focus.cursor).toBe(0)

  store.applyAgenda({ kind: 'select', key, cursor: 3, revealLine: true })

  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 3, revealLine: true })

  const focus = ready(store).focus

  store.applyAgenda({ kind: 'select', key: `day:${today}` })

  expect(ready(store).focus).toBe(focus)

  const snapshot = ready(store)

  store.applyAgenda({ kind: 'select', key: `day:${today}` })

  expect(ready(store)).toBe(snapshot)
})

it('keeps day folds runtime-only and returns hidden selection to its day', async () => {
  const { store, save } = await agendaHarness()
  store.openAgenda()
  const original = ready(store)
  const key = `node:${today + 1}:match`

  store.applyAgenda({ kind: 'select', key })
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })

  expect(ready(store).agenda!.selectedKey).toBe(`day:${today + 1}`)
  expect(store.getAgendaRows().some((row) => row.key === key)).toBe(false)

  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })

  expect(store.getAgendaRows().some((row) => row.key === key)).toBe(true)
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
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
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
