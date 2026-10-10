// @vitest-environment jsdom
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimCommandState } from './vim-command-state'
import type { VimTextCommandState } from './editor-input-handlers'
import { createAgendaKeyDownHandler, type AgendaRowText } from './agenda-row-keyboard'
import { agendaRowLabel } from './agenda-labels'
import { arrivalCaret, clampCaret, type RowCaret } from './agenda-row-caret'
import { adjacentBoundary } from './agenda-row-text-keys'
import { dayNumberOf } from '../domain/calendar-date'
import type { Document } from '../domain/document'
import { requireNode } from '../domain/document'

const NESTED: Document = {
  roots: [{ id: 'work', text: 'Work', children: [{ id: 'item', text: '2026-10-15 Prepare', children: [] }] }],
}

async function fixture(vimEnabled: boolean, mode: VimTextCommandState['mode'] = 'normal') {
  const harness = await createRealStoreHarness({
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
    document: NESTED,
  })
  harness.store.openAgenda(2)
  const vim: VimTextCommandState = {
    mode,
    commandState: createVimCommandState(),
    register: { current: { kind: 'text', value: '' } },
    setMode: (next) => {
      vim.mode = next
    },
  }
  let caret: RowCaret = arrivalCaret('')
  const copied: string[] = []
  const editor = { value: false }
  const rowText: AgendaRowText = {
    textOf: (row) => {
      const state = harness.store.getSnapshot()
      if (state.status !== 'ready' || state.agenda === undefined) return ''
      return row.kind === 'node'
        ? requireNode(state.document, row.nodeId).node.text
        : agendaRowLabel(row, state.agenda.today)
    },
    hasEditor: () => editor.value,
    caret: () => {
      const state = harness.store.getSnapshot()
      const key = state.status === 'ready' ? (state.agenda?.selectedKey ?? '') : ''
      return caret.key === key ? caret : arrivalCaret(key)
    },
    setCaret: (next) => {
      caret = next
    },
    copy: (text) => {
      copied.push(text)
    },
  }
  const handler = createAgendaKeyDownHandler({ store: harness.store, vim: vimEnabled ? vim : undefined, rowText })
  const press = (key: string, options: Record<string, boolean> = {}) => {
    const event = { key, preventDefault: vi.fn(), ...options } as unknown as KeyboardEvent<HTMLElement>
    handler(event)
    return event
  }
  const selectKind = (kind: 'day' | 'gap' | 'context'): void => {
    const row = harness.store
      .getAgendaRows()
      .find((candidate) =>
        kind === 'context' ? candidate.kind === 'node' && candidate.role === 'context' : candidate.kind === kind,
      )!
    harness.store.applyAgenda({ kind: 'select', key: row.key })
  }
  const selectedText = (): string => {
    const key = harness.store.getSnapshot()
    const selected = harness.store
      .getAgendaRows()
      .find((row) => key.status === 'ready' && row.key === key.agenda?.selectedKey)!
    return rowText.textOf(selected)
  }
  return { ...harness, vim, press, copied, selectKind, selectedText, editor, caret: () => rowText.caret() }
}

describe('Agenda row text keys', () => {
  // @requirement PRODUCT.md §23.4
  it('moves the Normal caret over a day label with counts, word and find motions, clamping at both ends', async () => {
    const f = await fixture(true)
    f.selectKind('day')
    const label = f.selectedText()
    expect(f.caret().focus).toBe(0)
    f.press('l')
    expect(f.caret().focus).toBe(1)
    f.press('3')
    f.press('l')
    expect(f.caret().focus).toBe(4)
    f.press('0')
    expect(f.caret().focus).toBe(0)
    f.press('$')
    expect(f.caret().focus).toBe(label.length - 1)
    f.press('l')
    expect(f.caret().focus).toBe(label.length - 1)
    f.press('h')
    expect(f.caret().focus).toBe(label.length - 2)
    f.press('0')
    f.press('w')
    expect(f.caret().focus).toBeGreaterThan(0)
    f.press('b')
    expect(f.caret().focus).toBe(0)
    f.press('f')
    f.press(label[label.length - 1]!)
    expect(f.caret().focus).toBe(label.length - 1)
    f.press('0')
    f.press(';')
    expect(f.caret().focus).toBe(label.length - 1)
    expect(f.vim.commandState.pending).toBeUndefined()
    expect(f.saves).toHaveLength(0)
  })

  // @requirement PRODUCT.md §23.4
  it('selects both Visual endpoints, yanks at the start, and exits at the active endpoint', async () => {
    const f = await fixture(true)
    f.selectKind('context')
    f.press('l')
    f.press('v')
    expect(f.vim.mode).toBe('visual')
    f.press('l')
    f.press('l')
    expect(f.caret()).toMatchObject({ anchor: 1, focus: 3 })
    f.press('o')
    expect(f.caret()).toMatchObject({ anchor: 3, focus: 1 })
    f.press('y')
    expect(f.copied).toEqual(['ork'])
    expect(f.vim.register?.current).toEqual({ kind: 'text', value: 'ork' })
    expect(f.vim.mode).toBe('normal')
    expect(f.caret()).toMatchObject({ anchor: 1, focus: 1 })
    f.press('v')
    f.press('$')
    const activeEnd = f.caret().focus
    f.press('Escape')
    expect(f.vim.mode).toBe('normal')
    expect(f.caret()).toMatchObject({ anchor: activeEnd, focus: activeEnd })
    f.press('v')
    f.press('v')
    expect(f.vim.mode).toBe('normal')
    expect(f.saves).toHaveLength(0)
  })

  // @requirement PRODUCT.md §23.4
  it.each(['Escape', 'v'])('leaves character Visual at its active endpoint with %s', async (exitKey) => {
    const f = await fixture(true)
    f.selectKind('context')
    for (const motions of [
      ['l', 'l'],
      ['l', 'l', 'o'],
      ['l', 'l', 'o', 'h'],
    ]) {
      f.press('0')
      f.press('l')
      f.press('v')
      for (const key of motions) f.press(key)
      const activeEnd = f.caret().focus
      f.press(exitKey)
      expect(f.vim.mode).toBe('normal')
      expect(f.caret()).toMatchObject({ anchor: activeEnd, focus: activeEnd })
    }
    expect(f.saves).toHaveLength(0)
  })

  // @requirement PRODUCT.md §23.4
  it('moves, extends and collapses the standard-editing caret, and copies and selects all', async () => {
    const f = await fixture(false)
    f.selectKind('context')
    f.press('ArrowRight')
    f.press('ArrowRight')
    expect(f.caret()).toMatchObject({ anchor: 2, focus: 2 })
    f.press('ArrowRight', { shiftKey: true })
    expect(f.caret()).toMatchObject({ anchor: 2, focus: 3 })
    f.press('c', { metaKey: true })
    expect(f.copied).toEqual(['r'])
    f.press('ArrowLeft')
    expect(f.caret()).toMatchObject({ anchor: 2, focus: 2 })
    f.press('ArrowRight', { metaKey: true })
    expect(f.caret().focus).toBe(4)
    f.press('ArrowLeft', { metaKey: true, shiftKey: true })
    expect(f.caret()).toMatchObject({ anchor: 4, focus: 0 })
    f.press('End')
    expect(f.caret().focus).toBe(4)
    f.press('Home')
    expect(f.caret().focus).toBe(0)
    f.press('ArrowRight', { altKey: true })
    expect(f.caret().focus).toBe(4)
    f.press('ArrowLeft', { altKey: true })
    expect(f.caret().focus).toBe(0)
    f.press('a', { metaKey: true })
    expect(f.caret()).toMatchObject({ anchor: 0, focus: 4 })
    f.press('c', { metaKey: true })
    expect(f.copied.at(-1)).toBe('Work')
    expect(f.saves).toHaveLength(0)
  })

  // @requirement PRODUCT.md §23.4
  it('copies the block character with Cmd+C in Normal and selects everything with Cmd+A', async () => {
    const f = await fixture(true)
    f.selectKind('context')
    f.press('l')
    f.press('c', { metaKey: true })
    expect(f.copied).toEqual(['o'])
    f.press('a', { metaKey: true })
    expect(f.vim.mode).toBe('visual')
    f.press('c', { metaKey: true })
    expect(f.copied.at(-1)).toBe('Work')
  })

  // @requirement PRODUCT.md §23.4
  it('leaves arrows and Cmd+arrows inert in Vim Normal and Visual', async () => {
    const f = await fixture(true)
    f.selectKind('context')
    for (const key of ['ArrowRight', 'End']) f.press(key)
    f.press('ArrowRight', { metaKey: true })
    expect(f.caret().focus).toBe(0)
    f.press('v')
    f.press('ArrowRight')
    expect(f.caret().focus).toBe(0)
  })

  // @requirement PRODUCT.md §23.4
  it('never edits the document or saves through arbitrary keys on days, gaps and contextual ancestors', async () => {
    const keys = [
      'i',
      'a',
      'I',
      'A',
      'R',
      'x',
      'X',
      's',
      'S',
      'D',
      'C',
      'J',
      '~',
      '>',
      '<',
      'p',
      'P',
      'c',
      'r',
      'y',
      'v',
      'l',
      'h',
      'w',
      'b',
      'e',
      '0',
      '$',
      'f',
      'q',
      'Backspace',
      'Delete',
      'Tab',
      'Escape',
      '3',
      'g',
    ]
    for (const vimEnabled of [true, false]) {
      for (const kind of ['day', 'gap', 'context'] as const) {
        const f = await fixture(vimEnabled)
        f.selectKind(kind)
        const before = f.snapshot().document
        fc.assert(
          fc.property(fc.array(fc.constantFrom(...keys), { maxLength: 12 }), (sequence) => {
            for (const key of sequence) f.press(key)
            expect(f.snapshot().document).toBe(before)
            expect(f.saves).toHaveLength(0)
          }),
          { numRuns: propertyRuns(100) },
        )
      }
    }
  })

  // @requirement PRODUCT.md §23.4
  it('leaves a row that owns an editor to that editor, even when its padding has the focus', async () => {
    const f = await fixture(true)
    f.selectKind('context')
    f.editor.value = true
    for (const key of ['l', 'v', 'y', '$']) f.press(key)
    f.press('c', { metaKey: true })
    f.press('a', { metaKey: true })
    expect(f.vim.mode).toBe('normal')
    expect(f.caret().focus).toBe(0)
    expect(f.copied).toEqual([])
  })

  // @requirement PRODUCT.md §23.4
  it('walks backward and by find motions: ge, F, t, T and the reversed repeat', async () => {
    const f = await fixture(true)
    f.selectKind('context')
    f.press('$')
    expect(f.caret().focus).toBe(3)
    f.press('g')
    f.press('e')
    expect(f.caret().focus).toBe(0)
    f.press('$')
    f.press('F')
    f.press('W')
    expect(f.caret().focus).toBe(0)
    f.press('t')
    f.press('k')
    expect(f.caret().focus).toBe(2)
    f.press('T')
    f.press('W')
    expect(f.caret().focus).toBe(1)
    f.press('0')
    f.press('f')
    f.press('r')
    expect(f.caret().focus).toBe(2)
    f.press(',')
    expect(f.caret().focus).toBe(2)
    f.press('0')
    f.press('f')
    f.press('k')
    f.press('0')
    f.press(';')
    expect(f.caret().focus).toBe(3)
    f.press('0')
    f.press('v')
    f.press('2')
    f.press('$')
    expect(f.caret()).toMatchObject({ anchor: 0, focus: 3 })
  })

  // @requirement PRODUCT.md §23.4
  it('steps over an emoji and a combined letter as one character in standard editing', () => {
    const text = 'a😀éb'
    expect(adjacentBoundary(text, 0, 1)).toBe(1)
    expect(adjacentBoundary(text, 1, 1)).toBe(3)
    expect(adjacentBoundary(text, 3, 1)).toBe(5)
    expect(adjacentBoundary(text, 5, 1)).toBe(6)
    expect(adjacentBoundary(text, 6, 1)).toBe(6)
    expect(adjacentBoundary(text, 6, -1)).toBe(5)
    expect(adjacentBoundary(text, 5, -1)).toBe(3)
    expect(adjacentBoundary(text, 3, -1)).toBe(1)
    expect(adjacentBoundary(text, 0, -1)).toBe(0)
  })

  // @requirement PRODUCT.md §23.4
  it('collapses a range that outlives Visual when Normal draws the caret again', async () => {
    const f = await fixture(false)
    f.selectKind('context')
    f.press('ArrowRight', { shiftKey: true })
    f.press('ArrowRight', { shiftKey: true })
    expect(f.caret()).toMatchObject({ anchor: 0, focus: 2 })
    expect(clampCaret(f.caret(), 4, 'normal')).toMatchObject({ anchor: 2, focus: 2 })
  })

  // @requirement PRODUCT.md §23.4
  it('keeps navigation and fold commands working with the row text keys installed', async () => {
    const f = await fixture(true)
    f.selectKind('day')
    f.press('G')
    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows().at(-1)!.key)
    f.press('g')
    f.press('g')
    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows()[0]!.key)
    f.press('2')
    f.press('j')
    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows()[2]!.key)
    f.press('z')
    f.press('M')
    f.press('z')
    f.press('R')
    expect(f.snapshot().agenda?.collapsed.size).toBe(0)
    expect(f.vim.commandState.pending).toBeUndefined()
  })

  // @requirement PRODUCT.md §23.4
  it('puts the caret back at offset zero when a day opens as the focused heading', async () => {
    const f = await fixture(true)
    f.selectKind('day')
    f.press('3')
    f.press('l')
    expect(f.caret().focus).toBe(3)
    f.press('g')
    f.press('d')
    expect(f.caret().focus).toBe(0)
  })
})
