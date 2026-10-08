import fc from 'fast-check'
import { expect, it, vi } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { projectAgenda } from '../domain/agenda-projection'
import { buildTimeline } from '../domain/agenda-timeline'
import { EditorStore } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'

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
