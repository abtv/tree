// @vitest-environment jsdom
import type { KeyboardEvent } from 'react'
import { expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { createRealStoreHarness } from './test/real-store-harness'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { createVimCommandState } from './vim-command-state'
import type { VimTextCommandState } from './editor-input-handlers'
import type { VimCaretState } from './vim-caret-transition'
import { setCaret } from './editor-dom'
import { dayNumberOf } from '../domain/calendar-date'

// @requirement PRODUCT.md §23.4
it('carries the original column through a short contextual row during counted navigation', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 1, max: 35 }), async (cursor) => {
      const text = `2026-10-15 ${'x'.repeat(40)}`
      const f = await createRealStoreHarness({
        document: {
          roots: [
            { id: 'first', text, children: [] },
            { id: 'context', text: 'C', children: [{ id: 'second', text, children: [] }] },
          ],
        },
        services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
      })
      f.store.openAgenda()
      const first = f.store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'first')!
      f.store.applyAgenda({ kind: 'select', key: first.key, cursor })
      const input = document.createElement('textarea')
      input.className = 'node-input'
      input.value = text
      document.body.append(input)
      setCaret(input, cursor)
      const vim: VimTextCommandState = { mode: 'normal', commandState: createVimCommandState(), setMode: vi.fn() }
      const handler = createAgendaKeyDownHandler({ store: f.store, vim })
      try {
        handler({ key: '2', currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
        handler({ key: 'j', currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
        expect(f.snapshot().location.selectedNodeId).toBe('second')
        expect(f.snapshot().focus.cursor).toBe(cursor)
        expect(f.saves).toHaveLength(0)
      } finally {
        input.remove()
      }
    }),
    { numRuns: 35 },
  )
})

// @requirement PRODUCT.md §23.4
it('preserves every image entry position through repeated clamped motions and an exit', async () => {
  await fc.assert(
    fc.asyncProperty(fc.integer({ min: 0, max: 40 }), fc.integer({ min: 1, max: 8 }), async (extra, repeats) => {
      const text = `2026-10-15 ${'x'.repeat(extra)}`
      const cursor = extra % text.length
      const f = await createRealStoreHarness({
        document: { roots: [{ id: 'image', text, children: [], attachment: { id: 'image', mimeType: 'image/png' } }] },
        services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
      })
      f.store.openAgenda()
      const last = f.store.getAgendaRows().at(-1)!
      f.store.applyAgenda({ kind: 'select', key: last.key, cursor })
      let caret: VimCaretState = { cursor, imageActive: false }
      const input = document.createElement('textarea')
      input.className = 'node-input'
      input.value = text
      document.body.append(input)
      setCaret(input, cursor)
      const vim: VimTextCommandState = {
        mode: 'normal',
        commandState: createVimCommandState(),
        setMode: vi.fn(),
        getCaretState: (_nodeId, position) => ({ ...caret, cursor: position }),
        applyCaretState: (_nodeId, next) => {
          caret = next
          setCaret(input, next.cursor)
        },
      }
      const handler = createAgendaKeyDownHandler({ store: f.store, vim })
      const press = (key: string): void =>
        handler({ key, currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
      try {
        press('j')
        const focus = f.snapshot().focus
        for (let index = 0; index < repeats; index += 1) press('j')
        expect(caret).toEqual({ cursor: text.length, imageActive: true, imageTextReturnCursor: cursor })
        expect(f.snapshot().focus).toBe(focus)
        press('k')
        expect(caret).toEqual({ cursor, imageActive: false })
        expect(f.saves).toHaveLength(0)
        expect(f.snapshot().document.roots[0]!.text).toBe(text)
      } finally {
        input.remove()
      }
    }),
    { numRuns: 40 },
  )
})
