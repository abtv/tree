// @vitest-environment jsdom
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { requireNode } from '../domain/document'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'
import type { AgendaElement } from './agenda-key-policy'

const day = (date: number) => dayNumberOf({ year: 2026, month: 10, day: date })
const elements: AgendaElement[] = ['day', 'gap', 'match', 'context']

async function fixture(element: AgendaElement, standard = false) {
  const f = await createRealStoreHarness({
    services: { today: () => day(8) },
    document: {
      roots: [
        {
          id: 'context',
          text: 'Context',
          children: [
            {
              id: 'match',
              text: '2026-10-15 Work',
              children: [{ id: 'child', text: '2026-10-15 Child', children: [] }],
            },
          ],
        },
        { id: 'source', text: '2026-10-30 Source', children: [] },
      ],
    },
  })
  f.store.openAgenda()
  const rows = f.store.getAgendaRows()
  const selected = rows.find((row) =>
    element === 'gap'
      ? row.kind === 'gap' && row.count > 7
      : element === 'day'
        ? row.kind === 'day' && row.day === day(15)
        : row.kind === 'node' && row.nodeId === element,
  )!
  f.store.applyAgenda({ kind: 'select', key: selected.key })
  const input = document.createElement('textarea')
  const selectedNode = element === 'match' ? f.node('match') : f.node('context')
  input.value = selectedNode.text
  input.setSelectionRange(Math.min(12, input.value.length), Math.min(12, input.value.length))
  const { vim, commandState } = createVimKeyboardDouble(selectedNode.id)
  const keyboard =
    element === 'match'
      ? createEditorKeyDownHandler({
          store: f.store,
          node: selectedNode,
          isComposing: () => false,
          setSelectAllNodeId: vi.fn(),
          onPreviewAttachment: vi.fn(),
          shiftFocusedNode: vi.fn(),
          vim: standard ? undefined : vim,
        })
      : createAgendaKeyDownHandler({ store: f.store, vim: standard ? undefined : vim })
  const press = (key: string, options: { metaKey?: boolean; shiftKey?: boolean } = {}) => {
    const event = {
      key,
      currentTarget: input,
      preventDefault: vi.fn(),
      ...options,
    } as unknown as KeyboardEvent<HTMLElement>
    keyboard(event)
    return event
  }
  return { ...f, selected, input, vim, commandState, press }
}

// @requirement PRODUCT.md §23.4
// @requirement PRODUCT.md §23.5
// @requirement PRODUCT.md §23.9
// @requirement PRODUCT.md §23.10
// @requirement PRODUCT.md §23.11
// @requirement PRODUCT.md §23.13
// @requirement PRODUCT.md §23.15
describe.each(elements)('Agenda Command Matrix: %s', (element) => {
  it.each(['ArrowDown', 'ArrowUp', 'j', 'k'])('%s selects the adjacent visible row', async (key) => {
    const f = await fixture(element)
    const rows = f.store.getAgendaRows()
    const index = rows.findIndex((row) => row.key === f.selected.key)
    f.press(key)
    expect(f.snapshot().agenda?.selectedKey).toBe(rows[index + (['ArrowDown', 'j'].includes(key) ? 1 : -1)]!.key)
  })

  it('Cmd+E toggles the occurrence fold or reveals at most seven gap days, then reverses it', async () => {
    const f = await fixture(element)
    const before = f.snapshot()
    f.press('e', { metaKey: true })
    if (element === 'gap') expect(f.snapshot().agenda?.revealed.size).toBe(7)
    else expect(f.snapshot().agenda?.collapsed.has(f.selected.key)).toBe(true)
    f.press('e', { metaKey: true })
    expect(f.snapshot().agenda?.collapsed.size).toBe(0)
    expect(f.snapshot().agenda?.revealed.size).toBe(0)
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().expansion).toBe(before.expansion)
  })

  it('standard Enter creates on a day, splits a match and is inert elsewhere', async () => {
    const f = await fixture(element, true)
    const before = f.snapshot().document
    f.press('Enter')
    if (element === 'day') expect(f.snapshot().document.roots.at(-1)!.text).toBe('2026-10-15 ')
    else if (element === 'match') {
      expect(f.node('match').text).toBe('2026-10-15 W')
      expect(f.node().text).toBe('2026-10-15 ork')
    } else expect(f.snapshot().document).toBe(before)
  })

  it('Normal Enter with no link or image leaves text, selection and mode unchanged', async () => {
    const f = await fixture(element)
    const before = f.snapshot()
    f.press('Enter')
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().agenda?.selectedKey).toBe(before.agenda?.selectedKey)
    expect(f.vim.mode).toBe('normal')
    expect(f.input.selectionStart).toBe(Math.min(12, f.input.value.length))
  })

  it.each(['o', 'O'])('%s creates only on days and matches and enters Insert', async (key) => {
    const f = await fixture(element)
    const before = f.snapshot().document
    f.press(key)
    if (element === 'day' || element === 'match') {
      expect(f.node().text).toBe(`2026-10-${element === 'day' && key === 'O' ? '14' : '15'} `)
      expect(f.vim.mode).toBe('insert')
      f.store.undo()
      expect(f.snapshot().document).toBe(before)
    } else {
      expect(f.snapshot().document).toBe(before)
      expect(f.vim.mode).toBe('normal')
    }
  })

  it.each([
    ['Tab', {}],
    ['Tab', { shiftKey: true }],
    ['>', {}],
    ['<', {}],
    ['Backspace', { metaKey: true }],
  ])('structural %s keeps document, occurrence, caret and mode', async (key, options) => {
    const f = await fixture(element)
    const before = f.snapshot()
    f.press(key as string, options as { metaKey?: boolean; shiftKey?: boolean })
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().agenda?.selectedKey).toBe(before.agenda?.selectedKey)
    expect(f.input.selectionStart).toBe(Math.min(12, f.input.value.length))
    expect(f.vim.mode).toBe('normal')
  })

  it('Cmd+Enter strikes through only a direct match', async () => {
    const f = await fixture(element)
    const before = f.snapshot().document
    f.press('Enter', { metaKey: true })
    if (element === 'match') expect(f.node('match').struckThrough).toBe(true)
    else expect(f.snapshot().document).toBe(before)
  })

  it.each(['J', 'gJ', 'dj', 'dk', 'cj', 'ck', 'yj', 'yk', 'gp', 'gP', 'd2j', 'c2k', 'y2j'])(
    '%s structural sequence leaves the occurrence and document unchanged',
    async (keys) => {
      const f = await fixture(element)
      const before = f.snapshot()
      for (const key of keys) f.press(key)
      expect(f.snapshot().document).toBe(before.document)
      expect(f.snapshot().agenda?.selectedKey).toBe(before.agenda?.selectedKey)
      expect(f.input.selectionStart).toBe(Math.min(12, f.input.value.length))
      expect(f.input.selectionEnd).toBe(f.input.selectionStart)
      expect(f.vim.mode).toBe('normal')
    },
  )

  it('dd marks only a direct match and never deletes or changes registers', async () => {
    const f = await fixture(element)
    const before = f.snapshot().document
    const register = f.vim.register.current
    f.press('d')
    f.press('d')
    expect(f.snapshot().agenda?.pendingMove).toEqual(
      element === 'match' ? [{ nodeId: 'match', day: day(15) }] : undefined,
    )
    expect(f.snapshot().document).toBe(before)
    expect(f.vim.register.current).toBe(register)
  })

  it.each(['p', 'P'])('%s puts pending items on any day row but leaves a gap pending', async (key) => {
    const f = await fixture(element)
    f.store.applyAgenda({ kind: 'select', key: `node:${day(30)}:source` })
    f.store.startAgendaMove(1)
    f.store.applyAgenda({ kind: 'select', key: f.selected.key })
    const before = f.snapshot().document
    const pending = f.snapshot().agenda?.pendingMove
    f.press(key)
    if (element === 'gap') {
      expect(f.snapshot().document).toBe(before)
      expect(f.snapshot().agenda?.pendingMove).toBe(pending)
    } else {
      expect(f.node('source').text).toBe('2026-10-15 Source')
      expect(f.snapshot().agenda?.pendingMove).toBeUndefined()
      f.store.undo()
      expect(f.snapshot().document).toBe(before)
    }
  })

  it.each(['p', 'P'])('%s with a node register and no pending move is inert', async (key) => {
    const f = await fixture(element)
    f.vim.register.current = { kind: 'node', value: f.node('source'), sourceIds: ['source'] }
    const before = f.snapshot().document
    f.press(key)
    expect(f.snapshot().document).toBe(before)
    expect(f.snapshot().agenda?.selectedKey).toBe(f.selected.key)
  })

  it.each(['p', 'P'])('%s with a text register edits only a direct match', async (key) => {
    const f = await fixture(element)
    f.vim.register.current = { kind: 'text', value: 'XYZ' }
    const before = f.snapshot().document
    f.press(key)
    if (element === 'match') expect(f.node('match').text).toContain('XYZ')
    else expect(f.snapshot().document).toBe(before)
  })

  it('Cmd+. focuses a day, opens Tree for real rows and leaves a gap unchanged', async () => {
    const f = await fixture(element)
    f.press('.', { metaKey: true })
    if (element === 'day') expect(f.snapshot().agenda?.focusedDay).toBe(day(15))
    else if (element === 'gap') expect(f.snapshot().agenda?.selectedKey).toBe(f.selected.key)
    else {
      expect(f.snapshot().agenda).toBeUndefined()
      expect(f.snapshot().location.currentParentId).toBe(element)
    }
  })

  it('Cmd+, restores the saved timeline from focused-day rows and is inert on a timeline gap', async () => {
    const f = await fixture(element)
    if (element !== 'gap') {
      f.store.applyAgenda({ kind: 'focus-day', key: `day:${day(15)}`, scrollTop: 123 })
      f.store.applyAgenda({ kind: 'select', key: f.selected.key })
    }
    f.press(',', { metaKey: true })
    expect(f.snapshot().agenda?.focusedDay).toBeUndefined()
    expect(f.snapshot().agenda?.selectedKey).toBe(f.selected.key)
  })

  it('Cmd+P closes Agenda at the origin', async () => {
    const f = await fixture(element)
    const origin = f.snapshot().agenda!.origin.location
    f.press('p', { metaKey: true })
    expect(f.snapshot().agenda).toBeUndefined()
    expect(f.snapshot().location).toEqual(origin)
  })

  if (element !== 'match') {
    it('standard printable input never edits a non-editable row', async () => {
      const f = await fixture(element, true)
      const before = f.snapshot()
      expect(f.press('q').preventDefault).toHaveBeenCalledOnce()
      expect(f.snapshot().document).toBe(before.document)
      expect(f.snapshot().agenda?.selectedKey).toBe(f.selected.key)
    })
    it.each(['i', 'a', 'R', 'x', 'Backspace'])(
      'synthetic/context row never edits with %s or enters Insert/Replace',
      async (key) => {
        const f = await fixture(element)
        const before = f.snapshot()
        f.press(key)
        expect(f.snapshot().document).toBe(before.document)
        expect(f.snapshot().agenda?.selectedKey).toBe(f.selected.key)
        expect(f.vim.mode).toBe('normal')
      },
    )
  }
})

// @requirement PRODUCT.md §23.10
it.each([false, true])('empty direct match deletion respects children=%s', async (children) => {
  const f = await fixture('match', true)
  f.store.replaceTextRange('match', 0, f.node('match').text.length, '')
  if (!children) {
    f.store.selectNode('child', 0)
    f.store.deleteSelected()
  }
  f.store.applyAgenda({ kind: 'select', key: `node:${day(15)}:match` })
  const input = document.createElement('textarea')
  const before = f.snapshot().document
  const keyboard = createEditorKeyDownHandler({
    store: f.store,
    node: f.node('match'),
    isComposing: () => false,
    setSelectAllNodeId: vi.fn(),
    onPreviewAttachment: vi.fn(),
    shiftFocusedNode: vi.fn(),
  })
  keyboard({ key: 'Backspace', currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
  if (children) expect(f.snapshot().document).toBe(before)
  else expect(() => requireNode(f.snapshot().document, 'match')).toThrow()
})
