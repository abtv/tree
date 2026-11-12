// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import type { KeyboardEvent } from 'react'
import { createRealStoreHarness } from './test/real-store-harness'
import { createAgendaKeyDownHandler, type AgendaRowText } from './agenda-row-keyboard'
import { createVimCommandState } from './vim-command-state'
import type { VimTextCommandState } from './vim-session-finish'
import { getCaret, setCaret } from './editor-dom'
import type { VimCaretState } from './vim-caret-transition'

async function fixture(withImage = false) {
  const texts = ['2026-10-15 ' + 'x'.repeat(29), '2026-10-15', '2026-10-15 ' + 'z'.repeat(29)]
  const f = await createRealStoreHarness({
    document: {
      roots: texts.map((text, index) => ({
        id: String(index),
        text,
        children: [],
        ...(withImage && index === 0 ? { attachment: { id: 'image', mimeType: 'image/png' as const } } : {}),
      })),
    },
  })
  f.store.openAgenda(0)
  const rows = f.store.getAgendaRows().filter((row) => row.kind === 'node')
  f.store.applyAgenda({ kind: 'select', key: rows[0]!.key, cursor: 5 })
  const input = document.createElement('textarea')
  input.className = 'node-input'
  input.value = texts[0]!
  setCaret(input, 5)
  const reveal = vi.fn()
  const dispose = vi.fn()
  let liveGeometry = 0
  let peakGeometry = 0
  const vim: VimTextCommandState = {
    mode: 'normal',
    commandState: createVimCommandState(),
    setMode: vi.fn(),
    revealVerticalCaret: reveal,
    getCaretState: (_, cursor, imageActive) => ({ cursor, imageActive }),
    applyCaretState: (id, caret) => {
      input.value = texts[Number(id)]!
      setCaret(input, caret.cursor)
    },
  }
  const handler = createAgendaKeyDownHandler({
    store: f.store,
    vim,
    measureRow: (row) => {
      liveGeometry++
      peakGeometry = Math.max(peakGeometry, liveGeometry)
      return {
        position: (offset) => ({
          top: Math.floor(offset / 10) * 20,
          left: (offset % 10) * (row.kind === 'node' && row.nodeId === '1' ? 4 : 8),
        }),
        dispose: () => {
          liveGeometry--
          dispose()
        },
      }
    },
  })
  const press = (key: string) =>
    handler({ key, currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
  return { ...f, vim, input, rows, press, reveal, dispose, geometryUsage: () => ({ liveGeometry, peakGeometry }) }
}

it('counts visual-line steps, preserves the desired column through a short node, and enters from below', async () => {
  const f = await fixture()

  f.press('j')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[0]!.key)
  expect(getCaret(f.input)).toBe(15)

  f.press('k')

  expect(getCaret(f.input)).toBe(5)

  f.press('3')
  f.press('j')

  expect(getCaret(f.input)).toBe(35)
  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[0]!.key)

  f.press('j')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[1]!.key)
  expect(getCaret(f.input)).toBe(9)

  f.press('j')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[2]!.key)
  expect(getCaret(f.input)).toBe(5)
  expect(f.snapshot().focus.revealLine).toBe(true)

  f.press('k')
  f.press('k')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[0]!.key)
  expect(getCaret(f.input)).toBe(35)
  expect(f.vim.commandState.verticalGoal?.left).toBe(40)
  expect(f.reveal).toHaveBeenCalled()
  expect(f.dispose).toHaveBeenCalled()
  expect(f.geometryUsage()).toEqual({ liveGeometry: 0, peakGeometry: 1 })
})

it('resets the desired column after a horizontal command', async () => {
  const f = await fixture()

  f.press('3')
  f.press('j')
  f.press('j')

  expect(getCaret(f.input)).toBe(9)
  expect(f.vim.commandState.verticalGoal?.left).toBe(40)

  f.press('h')
  f.press('j')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[2]!.key)
  expect(getCaret(f.input)).toBe(4)
  expect(f.vim.commandState.verticalGoal?.left).toBe(32)
})

it('reseeds the desired column from the carried offset after crossing an image during a count', async () => {
  const f = await fixture(true)
  let caret: VimCaretState = { cursor: 5, imageActive: false }
  const apply = f.vim.applyCaretState!
  f.vim.getCaretState = (_id, cursor) => ({ ...caret, cursor })
  f.vim.applyCaretState = (id, next, fromFocus) => {
    caret = next
    apply(id, next, fromFocus)
  }

  f.press('4')
  f.press('j')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[0]!.key)
  expect(caret).toEqual({ cursor: 40, imageActive: true, imageTextReturnCursor: 35 })

  f.press('k')
  f.press('2')
  f.press('j')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[1]!.key)
  expect(caret).toEqual({ cursor: 9, imageActive: false })
  expect(f.vim.commandState.verticalGoal?.left).toBe(36)

  f.press('k')
  f.press('k')

  expect(f.snapshot().agenda?.selectedKey).toBe(f.rows[0]!.key)
  expect(caret).toEqual({ cursor: 34, imageActive: false })
})

it('uses local caret state and line reveal for a wrapped row without an editor', async () => {
  const f = await fixture()
  const selected = f.rows[0]!
  let caret = { key: selected.key, anchor: 5, focus: 5 }
  const set = vi.fn((next: typeof caret) => {
    caret = next
  })
  const rowText: AgendaRowText = {
    textOf: () => f.input.value,
    hasEditor: () => false,
    caret: () => caret,
    setCaret: set,
    copy: vi.fn(),
  }
  const handler = createAgendaKeyDownHandler({
    store: f.store,
    vim: f.vim,
    rowText,
    measureRow: () => ({
      position: (offset) => ({ top: Math.floor(offset / 10) * 20, left: (offset % 10) * 8 }),
      dispose: vi.fn(),
    }),
  })
  const before = f.snapshot()

  handler({ key: 'j', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)

  expect(set).toHaveBeenCalledWith({ key: selected.key, anchor: 15, focus: 15 }, true)
  expect(f.snapshot()).toBe(before)
})
