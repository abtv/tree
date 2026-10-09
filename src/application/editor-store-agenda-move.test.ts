import fc from 'fast-check'
import { expect, it, vi } from 'vitest'
import { dayNumberOf, calendarDateOf, formatCanonicalDate } from '../domain/calendar-date'
import { findCanonicalDates } from '../domain/date-recognition'
import type { Document, Location } from '../domain/document'
import { EditorStore, type EditorServices } from './editor-store'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'

const day = (month: number, date: number): number => dayNumberOf({ year: 2026, month, day: date })
const today = day(10, 8)
const canonical = (value: number): string => formatCanonicalDate(calendarDateOf(value))

const base: Document = {
  roots: [
    {
      id: 'scope',
      text: 'Scope',
      children: [
        { id: 'match', text: '2026-10-14 Match 2026-10-20', children: [] },
        { id: 'other', text: '2026-10-14 Other', children: [] },
      ],
    },
    { id: 'dated', text: '2026-10-20 Dated', children: [] },
  ],
}

async function harness(
  document: Document = base,
  location: Location = { currentParentId: null, selectedNodeId: 'scope' },
) {
  const save = vi.fn<EditorServices['save']>(async () => undefined)
  const store = new EditorStore(
    {
      today: () => today,
      load: async () => ({ version: 4, document, location, view: { expandedIds: [] } }),
      save,
      readClipboard: async () => ({ kind: 'text', text: '' }),
      writeAttachment: async () => undefined,
      cleanupAttachments: async () => undefined,
    },
    () => 'created',
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

// @requirement PRODUCT.md §23.12
it('moves an occurrence as one undoable, persisted change that selects it on the target day', async () => {
  const { store, save } = await harness()
  const before = ready(store)
  expect(store.moveAgendaOccurrences([{ nodeId: 'match', day: day(10, 14) }], day(10, 15))).toBe(true)
  const moved = ready(store)
  expect(moved.document.roots[0]!.children.map((node) => [node.id, node.text])).toEqual([
    ['match', '2026-10-15 Match 2026-10-20'],
    ['other', '2026-10-14 Other'],
  ])
  expect(moved.document.roots[1]).toBe(before.document.roots[1])
  expect(moved.location).toEqual({ currentParentId: null, selectedNodeId: 'match' })
  expect(moved.agenda).toMatchObject({
    selectedKey: `node:${day(10, 15)}:match`,
    activeOccurrence: { nodeId: 'match', day: day(10, 15) },
  })
  expect(store.getAgendaRows().some((row) => row.key === `node:${day(10, 15)}:match`)).toBe(true)
  store.undo()
  expect(ready(store).document).toBe(before.document)
  store.redo()
  expect(ready(store).document).toBe(moved.document)
  await store.flushPersistence()
  expect(save).toHaveBeenCalledTimes(1)
  expect(save.mock.calls[0]![0].document.roots[0]!.children[0]!.text).toBe('2026-10-15 Match 2026-10-20')
})

// @requirement PRODUCT.md §23.12
it('moves onto a day already in the text without duplicating it', async () => {
  const { store } = await harness()
  expect(store.moveAgendaOccurrences([{ nodeId: 'match', day: day(10, 14) }], day(10, 20))).toBe(true)
  expect(ready(store).document.roots[0]!.children[0]!.text).toBe('2026-10-20 Match')
  expect(ready(store).agenda!.activeOccurrence).toEqual({ nodeId: 'match', day: day(10, 20) })
})

// @requirement PRODUCT.md §23.12
it('creates no history entry or save when nothing moves, outside Agenda, or while persistence is locked', async () => {
  const { store, save } = await harness()
  const before = ready(store)
  expect(store.moveAgendaOccurrences([{ nodeId: 'match', day: day(10, 14) }], day(10, 14))).toBe(false)
  expect(store.moveAgendaOccurrences([], day(10, 15))).toBe(false)
  expect(ready(store)).toBe(before)

  const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime
  runtime.replaceReady({ ...ready(store), persistenceLocked: true })
  const locked = ready(store)
  expect(store.moveAgendaOccurrences([{ nodeId: 'match', day: day(10, 14) }], day(10, 15))).toBe(false)
  expect(ready(store)).toBe(locked)
  runtime.replaceReady({ ...ready(store), persistenceLocked: false })

  store.closeAgenda()
  const closed = ready(store)
  expect(store.moveAgendaOccurrences([{ nodeId: 'match', day: day(10, 14) }], day(10, 15))).toBe(false)
  expect(ready(store)).toBe(closed)
  await store.flushPersistence()
  expect(save).not.toHaveBeenCalled()
  store.undo()
  expect(ready(store).document).toBe(before.document)
})

// @requirement PRODUCT.md §23.12
it('keeps the caret offset of the moved node when it owns the focus', async () => {
  const { store } = await harness()
  const runtime = (store as unknown as { runtime: EditorRuntimeState }).runtime
  runtime.replaceReady({ ...ready(store), focus: runtime.newFocus('match', 6) })
  store.moveAgendaOccurrences([{ nodeId: 'match', day: day(10, 14) }], day(10, 15))
  expect(ready(store).focus).toMatchObject({ nodeId: 'match', cursor: 6 })
})

// @requirement PRODUCT.md §23.12
it('property: a move changes only the moved dates and Undo restores the document', async () => {
  const dates = [day(10, 14), day(10, 15), day(10, 16), day(10, 20)]
  const part = fc.oneof(fc.constantFrom('Prepare', 'x', 'review'), fc.constantFrom(...dates).map(canonical))
  const text = fc.array(part, { minLength: 1, maxLength: 5 }).map((parts) => parts.join(' '))
  await fc.assert(
    fc.asyncProperty(
      fc.array(text, { minLength: 1, maxLength: 4 }),
      fc.nat(3),
      fc.constantFrom(...dates),
      async (texts, pick, target) => {
        const document: Document = {
          roots: texts.map((value, index) => ({ id: `n${index}`, text: value, children: [] })),
        }
        const { store } = await harness(document, { currentParentId: null, selectedNodeId: 'n0' })
        const candidates = texts.flatMap((value, index) =>
          findCanonicalDates(value, []).map((date) => ({ nodeId: `n${index}`, day: date.day })),
        )
        if (candidates.length === 0) return
        const move = candidates[pick % candidates.length]!
        const before = ready(store)
        const changed = store.moveAgendaOccurrences([move], target)
        const after = ready(store)
        if (!changed) {
          expect(move.day).toBe(target)
          expect(after.document).toBe(before.document)
          return
        }
        after.document.roots.forEach((root, index) => {
          if (root.id !== move.nodeId) {
            expect(root).toBe(before.document.roots[index])
            return
          }
          const previous = new Set(findCanonicalDates(texts[index]!, []).map((date) => date.day))
          previous.delete(move.day)
          previous.add(target)
          expect(new Set(findCanonicalDates(root.text, []).map((date) => date.day))).toEqual(previous)
          expect(
            root.text
              .replaceAll(/\d{4}-\d{2}-\d{2}/g, '')
              .replaceAll(/\s+/g, ' ')
              .trim(),
          ).toBe(
            texts[index]!.replaceAll(/\d{4}-\d{2}-\d{2}/g, '')
              .replaceAll(/\s+/g, ' ')
              .trim(),
          )
        })
        expect(after.agenda!.activeOccurrence).toEqual({ nodeId: move.nodeId, day: target })
        store.undo()
        expect(ready(store).document).toBe(before.document)
      },
    ),
    { numRuns: 60 },
  )
})
