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
import { requireNode } from '../domain/document'
import { agendaRowLabel } from './agenda-labels'
import type { RowCaret } from './agenda-row-caret'

// @requirement PRODUCT.md §23.4
it('matches flattened Agenda character positions across contextual, synthetic and repeated image occurrences', async () => {
  await fc.assert(
    fc.asyncProperty(fc.nat(100), fc.nat(150), fc.constantFrom<'h' | 'l'>('h', 'l'), async (origin, count, key) => {
      const f = await createRealStoreHarness({
        document: {
          roots: [
            {
              id: 'context',
              text: 'abc',
              children: [
                {
                  id: 'shared',
                  text: '2026-10-14 2026-10-15 X',
                  children: [],
                  attachment: { id: 'image', mimeType: 'image/png' },
                },
              ],
            },
            { id: 'far', text: '2026-12-01 Z', children: [] },
          ],
        },
        services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
      })
      f.store.openAgenda()
      const rows = f.store.getAgendaRows()
      const textOf = (row: (typeof rows)[number]): string =>
        row.kind === 'node'
          ? requireNode(f.snapshot().document, row.nodeId).node.text
          : agendaRowLabel(row, f.snapshot().agenda!.today)
      const positions = rows.flatMap((row) => {
        const text = textOf(row)
        const image =
          row.kind === 'node' &&
          row.role === 'match' &&
          requireNode(f.snapshot().document, row.nodeId).node.attachment !== undefined
        return Array.from({ length: Math.max(1, text.length + Number(image)) }, (_, cursor) => ({
          row,
          cursor,
          image: image && cursor === text.length,
        }))
      })
      const start = origin % positions.length
      const source = positions[start]!
      const expected = positions[Math.max(0, Math.min(positions.length - 1, start + (key === 'l' ? count : -count)))]!
      f.store.applyAgenda({ kind: 'select', key: source.row.key, cursor: source.cursor })
      let rowCaret: RowCaret = { key: source.row.key, anchor: source.cursor, focus: source.cursor }
      let caret: VimCaretState = { cursor: source.cursor, imageActive: source.image }
      const vim: VimTextCommandState = {
        mode: 'normal',
        commandState: createVimCommandState(),
        setMode: vi.fn(),
        getCaretState: () => caret,
        applyCaretState: (_id, next) => {
          caret = next
        },
      }
      const handler = createAgendaKeyDownHandler({
        store: f.store,
        vim,
        rowText: {
          textOf,
          hasEditor: (row) => row.kind === 'node' && row.role === 'match',
          caret: () => rowCaret,
          setCaret: (next) => {
            rowCaret = next
          },
          copy: vi.fn(),
        },
      })
      const input = document.createElement('textarea')
      input.className = source.row.kind === 'node' && source.row.role === 'match' ? 'node-input' : ''
      input.value = textOf(source.row)
      input.setSelectionRange(source.cursor, source.cursor)
      const press = (key: string) =>
        handler({ key, currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
      if (count > 0) {
        for (const digit of String(count)) press(digit)
        press(key)
      }
      expect(f.snapshot().agenda!.selectedKey).toBe(expected.row.key)
      const actual = expected.row.kind === 'node' && expected.row.role === 'match' ? caret.cursor : rowCaret.focus
      expect(actual).toBe(expected.cursor)
      if (expected.row.kind === 'node' && expected.row.role === 'match') expect(caret.imageActive).toBe(expected.image)
      expect(f.saves).toHaveLength(0)
    }),
    { numRuns: 100 },
  )
})

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
