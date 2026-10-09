import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import type { Document } from '../domain/document'
import { EditorStore, type EditorServices } from './editor-store'
import type { EditorRuntimeState, ReadySnapshot } from './editor-runtime-state'

const day = (month: number, date: number): number => dayNumberOf({ year: 2026, month, day: date })
const today = day(10, 8)

const base: Document = {
  roots: [
    {
      id: 'scope',
      text: 'Scope',
      children: [
        { id: 'one', text: '2026-10-14 One', children: [] },
        { id: 'two', text: '2026-10-14 Two', children: [] },
        { id: 'three', text: '2026-10-16 Three', children: [] },
      ],
    },
    // Far enough away that the days between it and Oct 16 collapse into a gap.
    { id: 'far', text: '2026-12-01 Far', children: [] },
  ],
}

async function harness() {
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  const readClipboard = vi.fn<EditorServices['readClipboard']>(async () => ({ kind: 'text', text: '' }))
  const store = new EditorStore(
    {
      today: () => today,
      load: async () => ({
        version: 4,
        document: base,
        location: { currentParentId: null, selectedNodeId: 'scope' },
        view: { expandedIds: [] },
      }),
      save,
      readClipboard,
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'created',
  )
  await store.initialize()
  store.openAgenda()
  return { store, save, readClipboard }
}

function ready(store: EditorStore): ReadySnapshot {
  const snapshot = store.getSnapshot()
  if (snapshot.status !== 'ready') throw new Error('Expected ready editor')
  return snapshot
}

const select = (store: EditorStore, key: string): void => store.applyAgenda({ kind: 'select', key })
const text = (store: EditorStore, id: string): string | undefined =>
  ready(store).document.roots[0]!.children.find((node) => node.id === id)?.text
const oneKey = `node:${day(10, 14)}:one`
const twoKey = `node:${day(10, 14)}:two`

// @requirement PRODUCT.md §23.13
describe('starting a pending move', () => {
  it('marks the selected direct match without touching the document, the clipboard, or the disk', async () => {
    const { store, save, readClipboard } = await harness()
    select(store, oneKey)
    const before = ready(store)
    expect(store.startAgendaMove()).toBe(true)
    expect(ready(store).agenda!.pendingMove).toEqual([{ nodeId: 'one', day: day(10, 14) }])
    expect(ready(store).document).toBe(before.document)
    await store.flushPersistence()
    expect(save).not.toHaveBeenCalled()
    expect(readClipboard).not.toHaveBeenCalled()
  })

  it('marks the following direct matches of the day for a count', async () => {
    const { store } = await harness()
    select(store, oneKey)
    store.startAgendaMove(2)
    expect(ready(store).agenda!.pendingMove!.map((source) => source.nodeId)).toEqual(['one', 'two'])
  })

  it('does nothing on a day, a contextual ancestor, or a gap', async () => {
    const { store } = await harness()
    const rows = store.getAgendaRows()
    const keys = [
      rows.find((row) => row.kind === 'day')!.key,
      `node:${day(10, 14)}:scope`,
      rows.find((row) => row.kind === 'gap')!.key,
    ]
    for (const key of keys) {
      select(store, key)
      const before = ready(store)
      expect(store.startAgendaMove()).toBe(false)
      expect(ready(store)).toBe(before)
    }
  })

  it('is unavailable while persistence is locked and outside Agenda', async () => {
    const { store } = await harness()
    select(store, oneKey)
    const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime
    runtime.replaceReady({ ...ready(store), persistenceLocked: true })
    expect(store.startAgendaMove()).toBe(false)
    expect(ready(store).agenda!.pendingMove).toBeUndefined()
    runtime.replaceReady({ ...ready(store), persistenceLocked: false })
    store.closeAgenda()
    expect(store.startAgendaMove()).toBe(false)
  })
})

// @requirement PRODUCT.md §23.13
describe('pending move lifecycle (D4)', () => {
  const marked = async () => {
    const harnessed = await harness()
    select(harnessed.store, oneKey)
    harnessed.store.startAgendaMove()
    return harnessed
  }

  const kept: [string, (store: EditorStore) => void][] = [
    ['selecting another occurrence', (store) => select(store, twoKey)],
    ['selecting a day container', (store) => select(store, `day:${day(10, 16)}`)],
    ['toggling a day fold', (store) => store.applyAgenda({ kind: 'toggle-fold', key: `day:${day(10, 14)}` })],
    ['closing every fold', (store) => store.applyAgenda({ kind: 'fold', key: oneKey, operation: 'close-all' })],
    ['opening every fold', (store) => store.applyAgenda({ kind: 'fold', key: oneKey, operation: 'open-all' })],
    [
      'expanding a gap',
      (store) => {
        const gap = store.getAgendaRows().find((row) => row.kind === 'gap')
        if (gap === undefined) throw new Error('Expected the fixture to contain a gap')
        store.applyAgenda({ kind: 'toggle-gap', key: gap.key })
      },
    ],
  ]
  for (const [name, act] of kept)
    it(`keeps the move through ${name}`, async () => {
      const { store } = await marked()
      const pending = ready(store).agenda!.pendingMove
      act(store)
      expect(ready(store).agenda!.pendingMove).toBe(pending)
    })

  const cancelled: [string, (store: EditorStore) => void][] = [
    ['cancelling explicitly (Esc)', (store) => store.cancelAgendaMove()],
    ['a text edit', (store) => store.editContent('one', '2026-10-14 One!', [], false)],
    ['a text edit of another node', (store) => store.editContent('three', '2026-10-16 Three!', [], false)],
    ['another move', (store) => store.moveAgendaOccurrences([{ nodeId: 'three', day: day(10, 16) }], day(10, 17))],
  ]
  for (const [name, act] of cancelled)
    it(`cancels the move through ${name}`, async () => {
      const { store } = await marked()
      act(store)
      expect(ready(store).agenda!.pendingMove).toBeUndefined()
    })

  it('cancels the move through Undo and Redo without adding a history entry', async () => {
    const { store } = await harness()
    store.editContent('three', '2026-10-16 Three!', [], false)
    store.endTextSession()
    select(store, oneKey)
    const edited = ready(store).document
    store.startAgendaMove()
    store.undo()
    expect(ready(store).agenda!.pendingMove).toBeUndefined()
    const undone = ready(store).document
    expect(undone).not.toBe(edited)
    select(store, oneKey)
    store.startAgendaMove()
    store.redo()
    expect(ready(store).agenda!.pendingMove).toBeUndefined()
    expect(ready(store).document).toBe(edited)
  })

  it('cancels the move through Undo and Redo even when they have nothing to apply', async () => {
    for (const command of ['undo', 'redo'] as const) {
      const { store } = await marked()
      const document = ready(store).document
      store[command]()
      expect(ready(store).agenda!.pendingMove).toBeUndefined()
      expect(ready(store).document).toBe(document)
    }
  })

  it('cannot mark a temporarily invalid item', async () => {
    const { store } = await harness()
    select(store, oneKey)
    store.editContent('one', 'One', [], false)
    expect(ready(store).agenda!.pinnedOccurrence).toBeDefined()
    expect(store.startAgendaMove()).toBe(false)
    expect(ready(store).agenda!.pendingMove).toBeUndefined()
  })

  it('leaves no pending move after Agenda closes and opens again', async () => {
    const { store } = await marked()
    store.closeAgenda()
    store.openAgenda()
    expect(ready(store).agenda!.pendingMove).toBeUndefined()
  })

  it('cancelling without a pending move changes nothing', async () => {
    const { store } = await harness()
    const before = ready(store)
    store.cancelAgendaMove()
    expect(ready(store)).toBe(before)
  })
})

// @requirement PRODUCT.md §23.13
describe('putting a pending move', () => {
  it('moves the marked occurrences to the day of a day container as one undoable, persisted change', async () => {
    const { store, save } = await harness()
    select(store, oneKey)
    store.startAgendaMove(2)
    const before = ready(store).document
    select(store, `day:${day(10, 16)}`)
    expect(store.putAgendaMove()).toBe(true)
    expect(text(store, 'one')).toBe('2026-10-16 One')
    expect(text(store, 'two')).toBe('2026-10-16 Two')
    expect(text(store, 'three')).toBe('2026-10-16 Three')
    expect(ready(store).agenda!.pendingMove).toBeUndefined()
    expect(ready(store).agenda).toMatchObject({
      selectedKey: `node:${day(10, 16)}:one`,
      activeOccurrence: { nodeId: 'one', day: day(10, 16) },
    })
    store.undo()
    expect(ready(store).document).toBe(before)
    store.redo()
    expect(text(store, 'two')).toBe('2026-10-16 Two')
    await store.flushPersistence()
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('puts on a direct match and on a contextual ancestor of the target day', async () => {
    for (const key of [`node:${day(10, 16)}:three`, `node:${day(10, 16)}:scope`]) {
      const { store } = await harness()
      select(store, oneKey)
      store.startAgendaMove()
      select(store, key)
      expect(store.putAgendaMove()).toBe(true)
      expect(text(store, 'one')).toBe('2026-10-16 One')
    }
  })

  it('uses the lower-case and upper-case put identically through the same store operation', async () => {
    const { store } = await harness()
    select(store, twoKey)
    store.startAgendaMove()
    select(store, `day:${day(10, 15)}`)
    store.putAgendaMove()
    expect(text(store, 'two')).toBe('2026-10-15 Two')
    expect(text(store, 'one')).toBe('2026-10-14 One')
  })

  it('leaves the move pending on a gap', async () => {
    const { store } = await harness()
    select(store, oneKey)
    store.startAgendaMove()
    const gap = store.getAgendaRows().find((row) => row.kind === 'gap')!
    select(store, gap.key)
    const before = ready(store)
    expect(store.putAgendaMove()).toBe(false)
    expect(ready(store)).toBe(before)
    expect(ready(store).agenda!.pendingMove).toBeDefined()
  })

  it('only ends the pending state when the target is the marked occurrence’s own day', async () => {
    const { store, save } = await harness()
    select(store, oneKey)
    store.startAgendaMove()
    const document = ready(store).document
    select(store, twoKey)
    expect(store.putAgendaMove()).toBe(true)
    expect(ready(store).document).toBe(document)
    expect(ready(store).agenda!.pendingMove).toBeUndefined()
    store.undo()
    expect(ready(store).document).toBe(document)
    await store.flushPersistence()
    expect(save).not.toHaveBeenCalled()
  })

  it('does nothing without a pending move or while persistence is locked', async () => {
    const { store } = await harness()
    select(store, `day:${day(10, 16)}`)
    const before = ready(store)
    expect(store.putAgendaMove()).toBe(false)
    expect(ready(store)).toBe(before)

    select(store, oneKey)
    store.startAgendaMove()
    select(store, `day:${day(10, 16)}`)
    const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime
    runtime.replaceReady({ ...ready(store), persistenceLocked: true })
    const locked = ready(store)
    expect(store.putAgendaMove()).toBe(false)
    expect(ready(store)).toBe(locked)
  })
})
