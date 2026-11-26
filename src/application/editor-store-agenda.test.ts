import { pinnedAgendaOccurrence, activeAgendaOccurrence } from './agenda-state'
import { afterEach, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import * as projection from '../domain/agenda-projection'
import type { Location, PersistedView, TreeNode } from '../domain/document'
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

export async function agendaHarness(
  location: Location = { currentParentId: null, selectedNodeId: 'scope' },
  documentRoots: TreeNode[] = roots,
  view: PersistedView = { expandedIds: [], selectedRowTop: 42 },
) {
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  const services: EditorServices = {
    today: () => today,
    load: async () => ({
      version: 4,
      document: { roots: documentRoots },
      location,
      view,
    }),
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

// @requirement PRODUCT.md §2.6
it('stars the real Agenda node and rejects synthetic selections', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `day:${today}` })
  const before = ready(store).document

  expect(store.starTarget).toBeUndefined()
  expect(store.toggleStarNode()).toBe(false)
  expect(ready(store).document).toBe(before)

  store.applyAgenda({ kind: 'select', key: `node:${today}:scope` })
  expect(store.toggleStarNode()).toBe(true)
  expect(store.starTarget).toMatchObject({ id: 'scope', starred: true })
  expect(ready(store).agenda?.selectedKey).toBe(`node:${today}:scope`)
  await store.flushPersistence()
})

// @requirement PRODUCT.md §2.7
it('marks the real Agenda node and rejects synthetic selections', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `day:${today}` })
  const before = ready(store).document

  expect(store.toggleMarkNode()).toBe(false)
  expect(ready(store).document).toBe(before)

  store.applyAgenda({ kind: 'select', key: `node:${today}:scope` })
  expect(store.toggleMarkNode()).toBe(true)
  expect(store.starTarget).toMatchObject({ id: 'scope', marked: true })
  expect(ready(store).agenda?.selectedKey).toBe(`node:${today}:scope`)
  await store.flushPersistence()
})

// @requirement PRODUCT.md §23.2
it('lists a marked node without a date under Today in Tree order', async () => {
  const { store } = await agendaHarness({ currentParentId: 'scope', selectedNodeId: 'context' })

  expect(store.toggleMarkNode()).toBe(true)
  store.openAgenda()
  const nodeKeys = store
    .getAgendaRows()
    .filter((row) => row.kind === 'node' && row.day === today)
    .map((row) => row.key)

  expect(nodeKeys).toEqual([`node:${today}:scope`, `node:${today}:context`, `node:${today}:outside`])
  await store.flushPersistence()
})

// @requirement PRODUCT.md §23.7
it('keeps an unmarked active item on Today until selection leaves it, and undo restores the mark', async () => {
  const { store } = await agendaHarness({ currentParentId: 'scope', selectedNodeId: 'context' })
  store.toggleMarkNode()
  store.openAgenda()
  const key = `node:${today}:context`
  store.applyAgenda({ kind: 'select', key })

  expect(store.toggleMarkNode()).toBe(true)

  expect(pinnedAgendaOccurrence(ready(store).agenda)).toEqual({ nodeId: 'context', day: today })
  expect(store.getAgendaRows().some((row) => row.key === key)).toBe(true)
  store.undo()
  expect(pinnedAgendaOccurrence(ready(store).agenda)).toBeUndefined()
  expect(store.starTarget).toMatchObject({ id: 'context', marked: true })
  store.redo()
  store.applyAgenda({ kind: 'select', key: `day:${today}` })
  expect(store.getAgendaRows().some((row) => row.key === key)).toBe(false)
  await store.flushPersistence()
})

// @requirement PRODUCT.md §23.7
it('moves an unmarked active item with another date to that date', async () => {
  const { store } = await agendaHarness({ currentParentId: 'context', selectedNodeId: 'match' })
  store.toggleMarkNode()
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:match` })

  store.toggleMarkNode()

  expect(activeAgendaOccurrence(ready(store).agenda)).toEqual({ nodeId: 'match', day: today + 1 })
  expect(ready(store).agenda?.selectedKey).toBe(`node:${today + 1}:match`)
  expect(store.getAgendaRows().some((row) => row.key === `node:${today}:match`)).toBe(false)
  await store.flushPersistence()
})

// @requirement PRODUCT.md §23.5
it.each(['close', 'enter'] as const)('remembers folded days after leaving Agenda with %s', async (exit) => {
  vi.useFakeTimers()
  const { store } = await agendaHarness()
  const document = ready(store).document
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })

  if (exit === 'close') store.closeAgenda()
  else {
    store.applyAgenda({ kind: 'select', key: `node:${today}:scope` })
    store.enter()
  }
  store.openAgenda()

  expect(ready(store).agenda!.collapsed.has(`day:${today + 1}`)).toBe(true)
  expect(store.getAgendaRows().some((row) => row.kind === 'node' && row.day === today + 1)).toBe(false)
  expect(ready(store).agenda!.selectedKey).toBe(`day:${today}`)
  expect(ready(store).document).toBe(document)
})

// @requirement PRODUCT.md §16
// @requirement PRODUCT.md §23.5
it.each(['agenda', 'tree'] as const)('restores folded days after saving from %s and restarting', async (view) => {
  vi.useFakeTimers()
  const { store, services, save } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  if (view === 'tree') store.closeAgenda()

  await store.flushPersistence()

  const saved = save.mock.lastCall?.[0]
  expect(saved).toBeDefined()
  const restarted = new EditorStore({ ...services, load: async () => saved }, () => 'unused')
  await restarted.initialize()

  expect(ready(restarted).agenda).toBeUndefined()
  expect(ready(restarted).location).toEqual({ currentParentId: null, selectedNodeId: 'scope' })
  expect(restarted.getRestoredSelectedRowTop()).toBe(42)
  restarted.openAgenda()
  expect(ready(restarted).agenda!.collapsed.has(`day:${today + 1}`)).toBe(true)
  expect(restarted.getAgendaRows().some((row) => row.kind === 'node' && row.day === today + 1)).toBe(false)
})

// @requirement PRODUCT.md §13.1
// @requirement PRODUCT.md §23.9
it.each(
  (['cut', 'text-read', 'image-read', 'image-write'] as const).flatMap((operation) =>
    (['day', 'path', 'separator'] as const).map((rowKind) => ({ operation, rowKind })),
  ),
)('ignores a pending $operation after selecting an Agenda $rowKind', async ({ operation, rowKind }) => {
  const { store, services, save } = await agendaHarness()
  let release!: () => void
  const pause = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  services.writeClipboard = async () => {
    started = true
    await pause
  }
  services.readClipboard = async () => {
    if (operation !== 'image-write') {
      started = true
      await pause
    }
    return operation === 'text-read' ? { kind: 'text', text: 'pasted' } : { kind: 'image', png: new Uint8Array([1]) }
  }
  services.writeAttachment = async () => {
    started = true
    await pause
  }
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:scope`, cursor: 11 })
  const document = ready(store).document
  const pending = operation === 'cut' ? store.cut('scope', 11, 16) : store.paste('scope', 11)
  await vi.waitFor(() => expect(started).toBe(true))

  const row = store.getAgendaRows().find((row) => row.kind === rowKind)!
  store.applyAgenda({ kind: 'select', key: row.key })
  const focus = ready(store).focus
  release()
  await pending

  expect(ready(store).document).toBe(document)
  expect(ready(store).agenda!.selectedKey).toBe(row.key)
  expect(ready(store).focus).toBe(focus)

  store.undo()
  await store.flushPersistence()

  expect(ready(store).document).toBe(document)
  expect(save).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §23.9
it.each(
  (['cut', 'paste'] as const).flatMap((operation) =>
    (['active', 'inactive', 'mirrored', 'pinned'] as const).map((selection) => ({ operation, selection })),
  ),
)('finishes a pending $operation on the selected $selection Agenda node', async ({ operation, selection }) => {
  const { store, services } = await agendaHarness(undefined, [
    { id: 'scope', text: '2026-10-08 Scope 2026-10-09', children: [] },
  ])
  let release!: () => void
  const pause = new Promise<void>((resolve) => {
    release = resolve
  })
  services.writeClipboard = () => pause
  services.readClipboard = async () => {
    await pause
    return { kind: 'text', text: 'pasted' }
  }
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:scope`, cursor: 11 })
  if (selection === 'pinned') store.editText('scope', '           Scope')
  const text = ready(store).document.roots[0]!.text
  const pending = operation === 'cut' ? store.cut('scope', 11, 16) : store.paste('scope', 11)

  if (selection === 'inactive') {
    store.applyAgenda({ kind: 'focus-day', key: `day:${today + 1}`, scrollTop: 0 })
    store.applyAgenda({ kind: 'return-timeline', key: `day:${today + 1}` })
    expect(activeAgendaOccurrence(ready(store).agenda)).toBeUndefined()
  }
  if (selection === 'mirrored') store.applyAgenda({ kind: 'select', key: `node:${today + 1}:scope` })
  release()
  await pending

  expect(ready(store).document.roots[0]!.text).toBe(
    operation === 'cut' ? text.slice(0, 11) + text.slice(16) : text.slice(0, 11) + 'pasted' + text.slice(11),
  )
})

// @requirement PRODUCT.md §23.4
// @requirement PRODUCT.md §23.7
// @requirement PRODUCT.md §6.1
// @requirement PRODUCT.md §22.1
it.each([
  { focused: false, pinned: false },
  { focused: true, pinned: false },
  { focused: false, pinned: true },
  { focused: true, pinned: true },
])('enters an Agenda ancestor atomically (focused: $focused, pinned: $pinned)', async ({ focused, pinned }) => {
  const { store, save } = await agendaHarness({ currentParentId: 'context', selectedNodeId: 'match' })
  store.openAgenda(7)
  if (focused) store.applyAgenda({ kind: 'focus-day', key: `day:${today}`, scrollTop: 60 })
  store.applyAgenda({ kind: 'select', key: `node:${today}:scope`, cursor: 7 })
  if (pinned) store.editText('scope', 'Scope')
  const before = ready(store)
  const seen: ReadySnapshot[] = []
  const unsubscribe = store.subscribe(() => seen.push(ready(store)))

  store.enter()
  unsubscribe()

  expect(seen).toHaveLength(1)
  expect(seen[0]!.agenda).toBeUndefined()
  expect(seen[0]!.location).toEqual({ currentParentId: 'scope', selectedNodeId: 'context' })
  expect(seen[0]!.focus).toMatchObject({ nodeId: 'context', cursor: 0 })
  expect(seen[0]!.focus.token).not.toBe(before.focus.token)
  expect(seen[0]!.document).toBe(before.document)

  await store.flushPersistence()
  await store.flushPersistence()

  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.calls[0]![0].location).toEqual({ currentParentId: 'scope', selectedNodeId: 'context' })

  store.openAgenda()

  expect(ready(store).agenda!.origin.location).toEqual({ currentParentId: 'scope', selectedNodeId: 'context' })
})

// @requirement PRODUCT.md §23.4
it('enters the selected inactive occurrence after returning to the timeline', async () => {
  const { store } = await agendaHarness({ currentParentId: 'context', selectedNodeId: 'match' })
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:scope` })
  store.applyAgenda({ kind: 'focus-day', key: `day:${today + 1}`, scrollTop: 60 })
  store.applyAgenda({ kind: 'select', key: `node:${today + 1}:match` })
  store.applyAgenda({ kind: 'return-timeline', key: `day:${today + 1}` })

  expect(ready(store).agenda!.selectedKey).toBe(`node:${today}:scope`)
  expect(activeAgendaOccurrence(ready(store).agenda)).toBeUndefined()

  store.enter()

  expect(ready(store).agenda).toBeUndefined()
  expect(ready(store).location).toEqual({ currentParentId: 'scope', selectedNodeId: 'context' })
  expect(ready(store).focus).toMatchObject({ nodeId: 'context', cursor: 0 })
})

// @requirement PRODUCT.md §23.4
it.each(['day', 'path', 'separator'])('does not enter Tree from a selected Agenda %s', async (kind) => {
  const { store, save } = await agendaHarness()
  store.openAgenda()
  const row = store.getAgendaRows().find((row) => row.kind === kind)!
  store.applyAgenda({ kind: 'select', key: row.key })
  const before = ready(store)

  store.enter()

  expect(ready(store)).toBe(before)

  await store.flushPersistence()

  expect(save).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §22.2
it('enters a distant match in a wide Agenda without projecting the document again', async () => {
  const { store, save } = await agendaHarness(
    { currentParentId: '0', selectedNodeId: '0' },
    Array.from({ length: 10000 }, (_, index) => ({ id: String(index), text: '2026-10-08 Item', children: [] })),
  )
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today}:9999` })
  const rows = store.getAgendaRows()
  const project = vi.spyOn(projection, 'projectAgenda')
  try {
    store.enter()

    expect(ready(store).location).toEqual({ currentParentId: '9999', selectedNodeId: '9999' })

    store.openAgenda()

    expect(store.getAgendaRows()).toBe(rows)
    expect(project).not.toHaveBeenCalled()
  } finally {
    project.mockRestore()
  }

  await store.flushPersistence()

  expect(save).toHaveBeenCalledOnce()
})

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
  expect(ready(store).location.currentParentId).toBeNull()
  expect(ready(store).agenda!.origin.location.currentParentId).toBe('scope')

  await store.flushPersistence()

  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0]).not.toHaveProperty('agenda')
})

// @requirement PRODUCT.md §23.8
it('history follows changes outside the Tree origin and preserves focus for folded changes', async () => {
  const { store } = await agendaHarness({ currentParentId: 'scope', selectedNodeId: 'context' })

  store.editText('outside', '2026-10-08 Changed outside')
  store.openAgenda()
  const key = `node:${today + 1}:match`

  store.applyAgenda({ kind: 'select', key, cursor: 7 })
  const before = ready(store)

  store.undo()

  expect(ready(store).agenda!.selectedKey).toBe(`node:${today}:outside`)
  expect(ready(store).agenda!.origin).toBe(before.agenda!.origin)
  expect(ready(store).location.selectedNodeId).toBe('outside')

  store.redo()

  expect(ready(store).agenda!.selectedKey).toBe(`node:${today}:outside`)
  expect(ready(store).focus.nodeId).toBe('outside')

  store.editText('match', '2026-10-09 Changed')
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  const folded = ready(store)

  store.undo()

  expect(ready(store).agenda!.collapsed).toBe(folded.agenda!.collapsed)
  expect(ready(store).agenda!.selectedKey).toBe(folded.agenda!.selectedKey)
  expect(ready(store).focus).toBe(folded.focus)
  expect(ready(store).location.currentParentId).toBeNull()
  expect(ready(store).agenda!.origin.location.currentParentId).toBe('scope')

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

it('keeps global Agenda open when its originating parent disappears and normalizes the return location', async () => {
  const { store } = await agendaHarness()
  store.createSiblingOrFirstChild(0)
  store.selectNode('unused', 0)

  store.enter()
  store.openAgenda()

  expect(ready(store).agenda!.scopeParentId).toBeNull()

  store.undo()

  expect(ready(store).agenda!.scopeParentId).toBeNull()
  expect(ready(store).agenda!.origin.location).toEqual({ currentParentId: null, selectedNodeId: 'scope' })

  store.closeAgenda()

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
  expect(ready(store).location).toEqual({ currentParentId: null, selectedNodeId: 'match' })

  store.closeAgenda()
  store.editText('context', 'Modified context')
  store.openAgenda()
  store.applyAgenda({ kind: 'select', key: `node:${today + 3}:other`, cursor: 5 })
  const before = ready(store).focus

  store.undo()

  expect(ready(store).agenda!.selectedKey).toBe(`node:${today + 3}:other`)
  expect(activeAgendaOccurrence(ready(store).agenda!)).toEqual({ nodeId: 'other', day: today + 3 })
  expect(ready(store).location).toEqual({ currentParentId: null, selectedNodeId: 'other' })
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

    expect(ready(store)).toMatchObject({ agenda: { scopeParentId: null, today, selectedKey: `day:${today}` } })

    const nodes = store
      .getAgendaRows()
      .filter((row) => row.kind === 'node')
      .map((row) => row.nodeId)

    expect(nodes).toEqual(['scope', 'outside', 'match', 'other'])

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

it('uses a verified Agenda row index for selection without scanning and ignores stale hints', async () => {
  const { store } = await agendaHarness()
  store.openAgenda()
  const rows = store.getAgendaRows()
  const key = `node:${today + 1}:match`
  const index = rows.findIndex((row) => row.key === key)
  const find = vi.spyOn(rows, 'find')

  try {
    store.applyAgenda({ kind: 'select', key, rowIndex: index, cursor: 4, revealLine: true })

    expect(ready(store).agenda?.selectedKey).toBe(key)
    expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 4, revealLine: true })
    expect(find.mock.calls.length).toBe(0)

    store.applyAgenda({ kind: 'select', key: `day:${today}`, rowIndex: index })

    expect(ready(store).agenda?.selectedKey).toBe(`day:${today}`)

    store.applyAgenda({ kind: 'select', key: 'missing', rowIndex: index })

    expect(ready(store).agenda?.selectedKey).toBe(`day:${today}`)
  } finally {
    find.mockRestore()
  }
})

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

it('coalesces fold saves without changing notes or Tree folds and returns hidden selection to its day', async () => {
  vi.useFakeTimers()
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

  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.lastCall![0].view).toEqual({ expandedIds: [], selectedRowTop: 42 })
  store.closeAgenda()
})

it('preserves saved Tree state while adding Agenda folds to an already pending save', async () => {
  const { store, save } = await agendaHarness()
  let measurement = 42

  store.registerSelectedRowTopReader(() => measurement)
  store.noteViewportChange()
  await store.flushPersistence()
  const before = save.mock.calls[0]![0]
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

  const expected = {
    ...before,
    view: { ...before.view, selectedRowTop: 80, agendaFolds: { days: [today + 1], overdueWeeks: [] } },
  }
  expect(save.mock.calls[0]![0]).toEqual(expected)
  expect(save).toHaveBeenCalledTimes(1)

  store.closeAgenda()
  measurement = 80

  store.noteViewportChange()
  await store.flushPersistence()

  expect(save.mock.calls[1]![0]).toEqual(expected)
})

// @requirement PRODUCT.md §23.5
it.each(['none', 'other-day', 'toggle', 'open', 'open-all'] as const)(
  'remembers explicit choices independently of search reveals: %s',
  async (action) => {
    vi.useFakeTimers()
    const { store, save } = await agendaHarness()
    store.openAgenda()
    store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
    await store.flushPersistence()
    save.mockClear()

    store.search.begin(store.searchOrigin(0))
    store.search.edit('Match')
    store.search.confirm()
    await vi.runAllTimersAsync()

    expect(ready(store).agenda!.collapsed.has(`day:${today + 1}`)).toBe(false)
    expect(save).not.toHaveBeenCalled()

    if (action === 'other-day') store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 3}` })
    else if (action !== 'none') store.applyAgenda({ kind: 'fold', key: `day:${today + 1}`, operation: action })
    store.hideSearch()
    store.closeAgenda()
    store.openAgenda()

    const remembered = action !== 'open' && action !== 'open-all'
    expect(ready(store).agenda!.collapsed.has(`day:${today + 1}`)).toBe(remembered)
    expect(ready(store).agenda!.collapsed.has(`day:${today + 3}`)).toBe(action === 'other-day')

    await store.flushPersistence()

    expect(save).toHaveBeenCalledTimes(action === 'none' || action === 'toggle' ? 0 : 1)
  },
)

// @requirement PRODUCT.md §23.15
it('keeps focused-day folds temporary without changing captured or remembered timeline folds', async () => {
  vi.useFakeTimers()
  const { store, save } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  await store.flushPersistence()
  save.mockClear()
  const timeline = ready(store).agenda!

  store.applyAgenda({ kind: 'focus-day', key: `day:${today + 1}`, scrollTop: 20 })
  store.applyAgenda({ kind: 'fold', key: `day:${today + 1}`, operation: 'open-all' })
  store.applyAgenda({ kind: 'return-timeline', key: `day:${today + 1}` })

  expect(ready(store).agenda!.collapsed).toBe(timeline.collapsed)

  store.applyAgenda({ kind: 'focus-day', key: `day:${today + 3}`, scrollTop: 0 })
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 3}` })
  store.closeAgenda()
  store.openAgenda()
  await store.flushPersistence()

  expect(ready(store).agenda!.collapsed).toEqual(new Set([`day:${today + 1}`]))
  expect(save).not.toHaveBeenCalled()
})

it('retains explicit folds when editing reveals a destination and Undo restores its former date', async () => {
  vi.useFakeTimers()
  const { store, save } = await agendaHarness()
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  store.applyAgenda({ kind: 'select', key: `node:${today + 3}:other` })
  store.editText('other', '2026-10-09 Other')
  store.endTextSession()

  expect(ready(store).agenda!.collapsed.has(`day:${today + 1}`)).toBe(false)

  store.undo()
  store.closeAgenda()
  store.openAgenda()
  await store.flushPersistence()

  expect(ready(store).agenda!.collapsed.has(`day:${today + 1}`)).toBe(true)
  expect(save.mock.lastCall![0].view!.agendaFolds).toEqual({ days: [today + 1], overdueWeeks: [] })
})

it('remembers Overdue separately for each week and retains dates without current occurrences', async () => {
  vi.useFakeTimers()
  const { store, save, services } = await agendaHarness(undefined, [
    ...roots,
    { id: 'overdue', text: '2026-10-01 Overdue', children: [] },
  ])
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  const week = ready(store).agenda!.weekStart
  store.applyAgenda({ kind: 'toggle-fold', key: `overdue:${week}` })
  store.closeAgenda()
  services.today = () => today + 7
  store.openAgenda()

  expect(ready(store).agenda!.collapsed.has(`overdue:${week + 7}`)).toBe(false)

  store.closeAgenda()
  store.editText('match', 'Match')
  store.endTextSession()
  await store.flushPersistence()

  expect(save.mock.lastCall![0].view!.agendaFolds).toEqual({ days: [today + 1], overdueWeeks: [week] })

  store.undo()
  services.today = () => today
  store.openAgenda()

  expect(store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'match')).toBe(false)

  await store.flushPersistence()
})

it('ignores empty days, node folds and invalid all-fold targets without scheduling a save', async () => {
  vi.useFakeTimers()
  const { store, save } = await agendaHarness()
  store.openAgenda()

  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 2}` })
  store.applyAgenda({ kind: 'toggle-fold', key: `node:${today}:scope` })
  store.applyAgenda({ kind: 'fold', key: 'missing', operation: 'close-all' })
  await vi.runAllTimersAsync()
  await store.flushPersistence()

  expect(ready(store).agenda!.collapsed.size).toBe(0)
  expect(save).not.toHaveBeenCalled()
})

it('drains fold changes made while an earlier view save is in flight', async () => {
  vi.useFakeTimers()
  const { store, save } = await agendaHarness()
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  save.mockImplementationOnce(() => pending)
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  const flushing = store.flushPersistence()
  await vi.advanceTimersByTimeAsync(0)

  expect(save).toHaveBeenCalledTimes(1)

  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 3}` })
  release()
  await flushing

  expect(save).toHaveBeenCalledTimes(2)
  expect(save.mock.calls[0]![0].view!.agendaFolds!.days).toEqual([today + 1])
  expect(save.mock.lastCall![0].view!.agendaFolds!.days).toEqual([today + 1, today + 3])
})

it('keeps locked fold changes pending until explicit final flush without restarting automatic saves', async () => {
  vi.useFakeTimers()
  const { store, save } = await agendaHarness()
  save.mockRejectedValue(new Error('disk full'))
  store.openAgenda()
  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 1}` })
  await vi.runAllTimersAsync()

  expect(ready(store).persistenceLocked).toBe(true)
  expect(save).toHaveBeenCalledTimes(3)

  store.applyAgenda({ kind: 'toggle-fold', key: `day:${today + 3}` })
  await vi.runAllTimersAsync()

  expect(save).toHaveBeenCalledTimes(3)

  save.mockResolvedValue(undefined)
  await store.flushPersistence()

  expect(save).toHaveBeenCalledTimes(4)
  expect(save.mock.lastCall![0].view!.agendaFolds!.days).toEqual([today + 1, today + 3])
})

// @requirement PRODUCT.md §22.1
it('reuses thousands of remembered folds during opening and selection without traversing or saving them', async () => {
  vi.useFakeTimers()
  const days = Array.from({ length: 20_000 }, (_, index) => today - index - 1)
  const { store, save } = await agendaHarness(undefined, undefined, {
    expandedIds: [],
    agendaFolds: { days, overdueWeeks: [] },
  })
  store.openAgenda()
  const collapsed = ready(store).agenda!.collapsed
  const iterate = vi.spyOn(collapsed, Symbol.iterator)

  for (let index = 0; index < 50; index += 1) {
    store.applyAgenda({ kind: 'select', key: `day:${today + 1}` })
    store.closeAgenda()
    store.openAgenda()

    expect(ready(store).agenda!.collapsed).toBe(collapsed)
  }
  await store.flushPersistence()

  expect(iterate).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  iterate.mockRestore()
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
