// @vitest-environment jsdom
import { focusedAgendaDay } from '../application/agenda-state'
import type { KeyboardEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'
import type { AgendaElement } from './agenda-key-policy'
import { shortcutProfile, type ShortcutPlatform } from './shortcut-profile'

const day = (date: number) => dayNumberOf({ year: 2026, month: 10, day: date })
const elements: AgendaElement[] = ['day', 'separator', 'match']
const platforms: ShortcutPlatform[] = ['apple', 'other']
/** The profile under test; the matrix sends Cmd on Apple and Ctrl on the other profile (PRODUCT §1.5). */
let platform: ShortcutPlatform = 'apple'

async function fixture(element: AgendaElement, standard = false, children = true) {
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
              children: children ? [{ id: 'child', text: '2026-10-15 Child', children: [] }] : [],
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
    element === 'match' ? row.kind === 'node' && row.nodeId === 'match' : row.kind === element && row.day === day(15),
  )!
  f.store.applyAgenda({ kind: 'select', key: selected.key })
  const shortcuts = shortcutProfile(platform)
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
          shortcuts,
        })
      : createAgendaKeyDownHandler({ store: f.store, vim: standard ? undefined : vim, shortcuts })
  const press = (key: string, options: { metaKey?: boolean; shiftKey?: boolean } = {}) => {
    const { metaKey, ...rest } = options
    const event = {
      key,
      currentTarget: input,
      preventDefault: vi.fn(),
      ...rest,
      ...(platform === 'other' ? { ctrlKey: metaKey } : { metaKey }),
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
// @requirement PRODUCT.md §1.5
describe.each(platforms.flatMap((profile) => elements.map((element) => [profile, element] as const)))(
  'Agenda Command Matrix on the %s profile: %s',
  (profile, element) => {
    beforeEach(() => {
      platform = profile
    })
    afterEach(() => {
      platform = 'apple'
    })

    it.each(['ArrowDown', 'ArrowUp', 'j', 'k'])('%s selects the adjacent visible row', async (key) => {
      const f = await fixture(element)

      const rows = f.store.getAgendaRows()
      const index = rows.findIndex((row) => row.key === f.selected.key)
      f.press(key)

      expect(f.snapshot().agenda?.selectedKey).toBe(rows[index + (['ArrowDown', 'j'].includes(key) ? 1 : -1)]!.key)
    })

    it('Cmd+E folds only a day and then reverses it', async () => {
      const f = await fixture(element)
      const before = f.snapshot()

      f.press('e', { metaKey: true })

      expect(f.snapshot().agenda?.collapsed.has(f.selected.key)).toBe(element === 'day')

      f.press('e', { metaKey: true })

      expect(f.snapshot().agenda?.collapsed.size).toBe(0)
      expect(f.snapshot().document).toBe(before.document)
      expect(f.snapshot().expansion).toBe(before.expansion)
    })

    it('standard Enter inserts a newline in a match and leaves a day unchanged', async () => {
      const f = await fixture(element, true)
      const before = f.snapshot().document

      f.press('Enter')

      if (element === 'match') {
        expect(f.node('match').text).toBe('2026-10-15 W\nork')
        expect(f.snapshot().document.roots).toHaveLength(before.roots.length)
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

    it.each(['o', 'O', 'V'])('%s preserves the node, caret and Normal mode', async (key) => {
      const f = await fixture(element)
      const before = f.snapshot().document

      f.press(key)

      expect(f.snapshot().document).toBe(before)
      expect(f.vim.mode).toBe('normal')
      expect(f.input.selectionStart).toBe(Math.min(12, f.input.value.length))
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

    it.each(['gJ', 'dj', 'dk', 'cj', 'ck', 'yj', 'yk', 'gp', 'gP', 'd2j', 'c2k', 'y2j'])(
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

    it('dd never deletes, starts a move or changes registers', async () => {
      const f = await fixture(element)
      const before = f.snapshot().document
      const register = f.vim.register.current

      f.press('d')
      f.press('d')

      expect(f.snapshot().document).toBe(before)
      expect(f.vim.register.current).toBe(register)
    })

    it.each(['p', 'P'])('%s with a node register is inert', async (key) => {
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

    it('Cmd+. focuses a day and opens Tree for a match', async () => {
      const f = await fixture(element)

      f.press('.', { metaKey: true })

      if (element === 'day') expect(focusedAgendaDay(f.snapshot().agenda)).toBe(day(15))
      else if (element === 'separator') expect(f.snapshot().agenda?.selectedKey).toBe(f.selected.key)
      else {
        expect(f.snapshot().agenda).toBeUndefined()
        expect(f.snapshot().location.currentParentId).toBe(element)
      }
    })

    it('Cmd+, restores the saved timeline from focused-day rows', async () => {
      const f = await fixture(element)
      f.store.applyAgenda({ kind: 'focus-day', key: `day:${day(15)}`, scrollTop: 123 })
      f.store.applyAgenda({ kind: 'select', key: f.selected.key })

      f.press(',', { metaKey: true })

      expect(focusedAgendaDay(f.snapshot().agenda)).toBeUndefined()
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
        'day row never edits with %s or enters Insert/Replace',
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
  },
)

// @requirement PRODUCT.md §23.10
it.each([false, true])('empty direct match is retained with children=%s', async (children) => {
  const f = await fixture('match', true, children)

  f.store.replaceTextRange('match', 0, f.node('match').text.length, '')

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

  expect(f.snapshot().document).toBe(before)
})
