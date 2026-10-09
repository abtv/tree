import fc from 'fast-check'
import { expect, it, vi } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { projectAgenda } from '../domain/agenda-projection'
import { buildTimeline } from '../domain/agenda-timeline'
import { EditorStore } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { calendarDateOf, formatCanonicalDate } from '../domain/calendar-date'
import { findCanonicalDates } from '../domain/date-recognition'

// @requirement PRODUCT.md §23.7
// @requirement PRODUCT.md §23.8
it('generated Agenda text edits round-trip through history with valid selection and unchanged presentation', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.uniqueArray(fc.integer({ min: 90, max: 115 }), { maxLength: 5 }), { minLength: 1, maxLength: 15 }),
      async (edits) => {
        const store = new EditorStore(
          {
            today: () => 100,
            load: async () => ({
              version: 4,
              document: {
                roots: [
                  { id: 'scope', text: 'Scope', children: [{ id: 'a', text: '1970-04-11 A', children: [] }] },
                  { id: 'outside', text: '1970-04-11 Outside', children: [] },
                ],
              },
              location: { currentParentId: 'scope', selectedNodeId: 'a' },
              view: { expandedIds: [] },
            }),
            save: async () => undefined,
            readClipboard: async () => ({ kind: 'text', text: '' }),
            writeAttachment: async () => undefined,
            cleanupAttachments: async () => undefined,
          },
          () => 'unused',
        )
        await store.initialize()
        store.openAgenda()
        store.applyAgenda({ kind: 'select', key: 'node:100:a' })
        const assertState = () => {
          const state = store.getSnapshot() as ReadySnapshot
          expect(state.location.currentParentId).toBe('scope')
          expect(store.getAgendaRows().some((row) => row.key === state.agenda!.selectedKey)).toBe(true)
          return state
        }
        for (const dates of edits) {
          store.endTextSession()
          const before = assertState()
          const text = dates.map((day) => formatCanonicalDate(calendarDateOf(day))).join(' ') + ' A'
          store.editText('a', text)
          const after = assertState()
          if (after.document === before.document) continue
          store.undo()
          expect(assertState().document).toBe(before.document)
          expect(assertState().agenda!.collapsed).toBe(before.agenda!.collapsed)
          expect(assertState().agenda!.revealed).toBe(before.agenda!.revealed)
          expect(assertState().expansion).toBe(before.expansion)
          store.redo()
          expect(assertState().document).toBe(after.document)
          expect(assertState().agenda!.collapsed).toBe(after.agenda!.collapsed)
          expect(assertState().agenda!.revealed).toBe(after.agenda!.revealed)
        }
        await store.flushPersistence()
      },
    ),
    { numRuns: propertyRuns(100) },
  )
})

// @requirement PRODUCT.md §23.11
it('generated day creations append exactly one dated node each, with one history entry each', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 1, max: 28 }), { maxLength: 6 }),
      fc.array(fc.record({ target: fc.nat(100), preceding: fc.boolean() }), { minLength: 1, maxLength: 12 }),
      async (dates, commands) => {
        let next = 0
        const store = new EditorStore(
          {
            today: () => 100,
            load: async () => ({
              version: 4,
              document: {
                roots: [
                  { id: 'first', text: 'First', children: [] },
                  ...dates.map((date, index) => ({
                    id: `dated-${index}`,
                    text: `1970-04-${String(date).padStart(2, '0')} Dated`,
                    children: [],
                  })),
                ],
              },
              location: { currentParentId: null, selectedNodeId: 'first' },
              view: { expandedIds: [] },
            }),
            save: async () => undefined,
            readClipboard: async () => ({ kind: 'text', text: '' }),
            writeAttachment: async () => undefined,
            cleanupAttachments: async () => undefined,
          },
          () => `created-${next++}`,
        )
        await store.initialize()
        const original = store.getSnapshot() as ReadySnapshot
        store.openAgenda()
        let created = 0
        for (const command of commands) {
          const rows = store.getAgendaRows()
          const row = rows[command.target % rows.length]!
          store.applyAgenda({ kind: 'select', key: row.key })
          const before = store.getSnapshot() as ReadySnapshot
          const result = store.createAgendaDayNode(command.preceding ? 'preceding' : 'selected')
          const after = store.getSnapshot() as ReadySnapshot
          expect(result).toBe(row.kind === 'day')
          if (!result) {
            expect(after.document).toBe(before.document)
            continue
          }
          created += 1
          const day = (row as Extract<typeof row, { kind: 'day' }>).day - (command.preceding ? 1 : 0)
          expect(after.document.roots).toHaveLength(before.document.roots.length + 1)
          before.document.roots.forEach((node, index) => expect(after.document.roots[index]).toBe(node))
          const node = after.document.roots.at(-1)!
          expect(node).toEqual({
            id: `created-${created - 1}`,
            text: `${formatCanonicalDate(calendarDateOf(day))} `,
            children: [],
          })
          expect(after.agenda!.selectedKey).toBe(`node:${day}:${node.id}`)
          expect(after.agenda!.activeOccurrence).toEqual({ nodeId: node.id, day })
          expect(after.location).toEqual({ currentParentId: null, selectedNodeId: node.id })
          expect(store.getAgendaRows().some((candidate) => candidate.key === after.agenda!.selectedKey)).toBe(true)
        }
        for (let step = 0; step < created; step += 1) store.undo()
        expect((store.getSnapshot() as ReadySnapshot).document).toBe(original.document)
        const restored = store.getSnapshot() as ReadySnapshot
        expect(store.getAgendaRows().some((candidate) => candidate.key === restored.agenda!.selectedKey)).toBe(true)
        await store.flushPersistence()
      },
    ),
    { numRuns: propertyRuns(100) },
  )
})

// @requirement PRODUCT.md §23.11
it('generated splits and dated siblings add exactly one node each, dated for the displayed day, in one history entry', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 1, max: 28 }), { minLength: 1, maxLength: 6 }),
      fc.array(
        fc.record({ target: fc.nat(100), kind: fc.constantFrom('split', 'after', 'before'), cursor: fc.nat(40) }),
        { minLength: 1, maxLength: 10 },
      ),
      async (dates, commands) => {
        let next = 0
        const store = new EditorStore(
          {
            today: () => 100,
            load: async () => ({
              version: 4,
              document: {
                roots: dates.map((date, index) => ({
                  id: `dated-${index}`,
                  text: `1970-04-${String(date).padStart(2, '0')} Dated words`,
                  children: [],
                })),
              },
              location: { currentParentId: null, selectedNodeId: 'dated-0' },
              view: { expandedIds: [] },
            }),
            save: async () => undefined,
            readClipboard: async () => ({ kind: 'text', text: '' }),
            writeAttachment: async () => undefined,
            cleanupAttachments: async () => undefined,
          },
          () => `created-${next++}`,
        )
        await store.initialize()
        const original = store.getSnapshot() as ReadySnapshot
        store.openAgenda()
        let applied = 0
        for (const command of commands) {
          const rows = store.getAgendaRows()
          const row = rows[command.target % rows.length]!
          store.applyAgenda({ kind: 'select', key: row.key })
          const before = store.getSnapshot() as ReadySnapshot
          const result =
            command.kind === 'split' ? store.splitAgendaNode(command.cursor) : store.createAgendaSibling(command.kind)
          const after = store.getSnapshot() as ReadySnapshot
          const isMatch = row.kind === 'node' && row.role === 'match'
          expect(result).toBe(isMatch)
          if (!result) {
            expect(after.document).toBe(before.document)
            continue
          }
          applied += 1
          const day = (row as Extract<typeof row, { kind: 'node' }>).day
          expect(after.document.roots).toHaveLength(before.document.roots.length + 1)
          const created = after.document.roots.find((node) => node.id === `created-${applied - 1}`)!
          expect(findCanonicalDates(created.text).map((match) => match.day)).toContain(day)
          expect(after.agenda!.activeOccurrence).toEqual({ nodeId: created.id, day })
          expect(after.location.selectedNodeId).toBe(created.id)
          expect(after.agenda!.selectedKey).toBe(`node:${day}:${created.id}`)
          expect(store.getAgendaRows().some((candidate) => candidate.key === after.agenda!.selectedKey)).toBe(true)
          if (command.kind !== 'split') expect(created.text).toBe(`${formatCanonicalDate(calendarDateOf(day))} `)
        }
        for (let step = 0; step < applied; step += 1) store.undo()
        expect((store.getSnapshot() as ReadySnapshot).document).toBe(original.document)
        await store.flushPersistence()
      },
    ),
    { numRuns: propertyRuns(100) },
  )
})

it('generated Agenda commands preserve document, Tree folds, save count, and a visible selection', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.integer({ min: 1, max: 28 }), { minLength: 1, maxLength: 12 }),
      fc.array(
        fc.record({
          kind: fc.constantFrom('select', 'toggle-fold', 'toggle-gap', 'close', 'open'),
          target: fc.nat(100),
        }),
        { maxLength: 50 },
      ),
      async (dates, commands) => {
        const save = vi.fn(async () => undefined)
        const store = new EditorStore(
          {
            today: () => 100,
            load: async () => ({
              version: 4,
              document: {
                roots: dates.map((date, index) => ({
                  id: String(index),
                  text: `1970-04-${String(date).padStart(2, '0')}`,
                  children: [],
                })),
              },
              location: { currentParentId: null, selectedNodeId: '0' },
              view: { expandedIds: [] },
            }),
            save,
            readClipboard: async () => ({ kind: 'text', text: '' }),
            writeAttachment: async () => undefined,
            cleanupAttachments: async () => undefined,
          },
          () => 'unused',
        )
        await store.initialize()
        const original = store.getSnapshot() as ReadySnapshot
        store.openAgenda()
        for (const command of commands) {
          if (command.kind === 'open') store.openAgenda()
          else if (command.kind === 'close') store.closeAgenda()
          else {
            const rows = store.getAgendaRows()
            const row = rows[command.target % Math.max(rows.length, 1)]
            store.applyAgenda({ kind: command.kind, key: row?.key ?? 'missing' })
          }
          const state = store.getSnapshot() as ReadySnapshot
          expect(state.document).toBe(original.document)
          expect(state.expansion).toBe(original.expansion)
          expect(state.location.currentParentId).toBe(original.location.currentParentId)
          if (state.agenda !== undefined) {
            const rows = store.getAgendaRows()
            expect(rows.some((row) => row.key === state.agenda!.selectedKey)).toBe(true)
            const projection = projectAgenda(state.document, state.agenda.scopeParentId)
            const timeline = buildTimeline({
              contentDays: new Set(projection.map((day) => day.day)),
              today: state.agenda.today,
              revealed: state.agenda.revealed,
            })
            expect(rows.filter((row) => row.kind !== 'node')).toMatchObject(timeline)
            for (const day of projection) {
              const expected = state.agenda.collapsed.has(`day:${day.day}`) ? [] : day.rows
              expect(
                rows
                  .filter((row) => row.kind === 'node')
                  .filter((row) => row.day === day.day)
                  .map(({ nodeId, depth, role }) => ({ nodeId, depth, role })),
              ).toEqual(expected)
            }
          }
        }
        store.closeAgenda()
        expect((store.getSnapshot() as ReadySnapshot).location).toEqual(original.location)
        await store.flushPersistence()
        expect(save).not.toHaveBeenCalled()
      },
    ),
    { numRuns: propertyRuns(100) },
  )
})
