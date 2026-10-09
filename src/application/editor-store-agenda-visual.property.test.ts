import fc from 'fast-check'
import { expect, it, vi } from 'vitest'
import { EditorStore } from './editor-store'
import { dayNumberOf } from '../domain/calendar-date'
import type { Document } from '../domain/document'

// @requirement PRODUCT.md §23.14
it('property: Visual moves change only selected source dates and one Undo restores every node', async () => {
  const source = dayNumberOf({ year: 2026, month: 10, day: 14 })
  const target = source + 2
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 2, max: 20 }), fc.nat(20), fc.nat(20), async (size, a, b) => {
      const document: Document = {
        roots: Array.from({ length: size }, (_, index) => ({
          id: `p${index}`,
          text: `Parent ${index}`,
          children: [
            {
              id: `n${index}`,
              text: `2026-10-14 Item ${index} 2026-10-20`,
              children: [{ id: `child${index}`, text: '2026-10-14 Child', children: [] }],
            },
          ],
        })),
      }
      const save = vi.fn(async () => undefined)
      const store = new EditorStore(
        {
          load: async () => ({
            version: 4,
            document,
            location: { currentParentId: null, selectedNodeId: 'p0' },
            view: { expandedIds: [] },
          }),
          save,
          readClipboard: async () => ({ kind: 'text', text: '' }),
          writeAttachment: async () => undefined,
          cleanupAttachments: async () => undefined,
          today: () => source,
        },
        () => 'created',
        { setTimeout: () => 0, clearTimeout: () => undefined },
      )
      await store.initialize()
      const initial = store.getSnapshot()
      if (initial.status !== 'ready') throw new Error('Expected ready editor')
      const before = initial.document
      store.openAgenda()
      const anchor = a % size
      const focus = b % size
      store.applyAgenda({ kind: 'select', key: `node:${source}:n${focus}` })
      expect(store.startAgendaMove(1, { anchorId: `n${anchor}`, focusId: `n${focus}` })).toBe(true)
      await store.flushPersistence()
      expect(save).not.toHaveBeenCalled()
      store.applyAgenda({ kind: 'select', key: `day:${target}` })
      expect(store.putAgendaMove()).toBe(true)
      const state = store.getSnapshot()
      if (state.status !== 'ready') throw new Error('Expected ready editor')
      state.document.roots.forEach((root, index) => {
        const selected = index >= Math.min(anchor, focus) && index <= Math.max(anchor, focus)
        expect(root.children[0]!.text).toBe(`${selected ? '2026-10-16' : '2026-10-14'} Item ${index} 2026-10-20`)
        expect(root.children[0]!.children).toBe(before.roots[index]!.children[0]!.children)
        expect(root.id).toBe(before.roots[index]!.id)
        if (!selected) expect(root).toBe(before.roots[index])
      })
      await store.flushPersistence()
      expect(save).toHaveBeenCalledTimes(1)
      store.undo()
      const undone = store.getSnapshot()
      if (undone.status !== 'ready') throw new Error('Expected ready editor')
      expect(undone.document).toBe(before)
    }),
    { numRuns: 40 },
  )
})
