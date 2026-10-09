// @vitest-environment jsdom
import type { KeyboardEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimKeyboardDouble } from './test/vim-keyboard-double'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import type { VimMode } from './vim-editing'
import { dayNumberOf } from '../domain/calendar-date'

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllTimers()
  vi.useRealTimers()
})
async function fixture(mode?: VimMode) {
  vi.useFakeTimers()
  const f = await createRealStoreHarness({
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
    document: {
      roots: [
        {
          id: 'context',
          text: 'Context',
          children: [
            { id: 'first', text: '2026-10-14 Prepare', children: [] },
            { id: 'second', text: '2026-10-14 Review', children: [] },
          ],
        },
      ],
    },
  })
  f.store.openAgenda()
  const key = f.store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'first')!.key
  f.store.applyAgenda({ kind: 'select', key })
  const input = document.createElement('textarea')
  input.className = 'node-input'
  input.value = f.node().text
  document.body.append(input)
  input.focus()
  input.setSelectionRange(12, 12)
  const double = createVimKeyboardDouble('first', { mode: mode ?? 'insert' })
  const press = (key: string, options = {}) => {
    const event = {
      key,
      currentTarget: input,
      preventDefault: vi.fn(),
      ...options,
    } as unknown as KeyboardEvent<HTMLElement>
    createEditorKeyDownHandler({
      store: f.store,
      node: f.node('first'),
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment: vi.fn(),
      shiftFocusedNode: vi.fn(),
      vim: mode === undefined ? undefined : double.vim,
    })(event)
    return event
  }
  return { ...f, ...double, input, press, key }
}

// @requirement PRODUCT.md §23.10
describe('Agenda editing command boundaries', () => {
  it('keeps the selected occurrence and real selection consistent after multiline paste creates an undated focus target', async () => {
    const f = await fixture('insert')
    f.clipboard.current = { kind: 'text', text: 'one\ntwo' }
    await f.store.paste('first', 11)
    const selected = f.store.getAgendaRows().find((row) => row.key === f.snapshot().agenda?.selectedKey)
    expect(selected).toMatchObject({ kind: 'node', nodeId: f.snapshot().location.selectedNodeId })
  })
  it('deletes an empty root without dereferencing a missing parent and preserves the sole root', async () => {
    vi.useFakeTimers()
    const f = await createRealStoreHarness({
      services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
      document: {
        roots: [
          { id: 'root', text: '2026-10-14 Root', children: [] },
          { id: 'other', text: 'Other', children: [] },
        ],
      },
    })
    f.store.openAgenda()
    const row = f.store.getAgendaRows().find((candidate) => candidate.kind === 'node')!
    f.store.applyAgenda({ kind: 'select', key: row.key })
    f.store.editText('root', '')
    f.store.deleteEmptySelected()
    expect(f.snapshot().document.roots.map((node) => node.id)).toEqual(['other'])
    expect(f.snapshot().agenda?.selectedKey).toBe(`day:${dayNumberOf({ year: 2026, month: 10, day: 11 })}`)
    f.store.editText('other', '2026-10-08 Other')
    const other = f.store.getAgendaRows().find((candidate) => candidate.kind === 'node')!
    f.store.applyAgenda({ kind: 'select', key: other.key })
    f.store.editText('other', '')
    const empty = f.snapshot().document
    f.store.deleteEmptySelected()
    expect(f.snapshot().document).toBe(empty)
    expect(f.snapshot().document.roots).toHaveLength(1)
  })
  it('protects children and synthetic selections from empty-node deletion at the store boundary', async () => {
    const f = await fixture('insert')
    f.store.applyAgenda({ kind: 'select', key: f.key.replace(':first', ':context') })
    f.store.editText('context', '')
    const before = f.snapshot().document
    f.store.deleteEmptySelected()
    expect(f.snapshot().document).toBe(before)
    f.store.applyAgenda({ kind: 'select', key: f.key })
    f.store.editText('first', '')
    const empty = f.snapshot().document
    const day = f.store.getAgendaRows().find((row) => row.kind === 'day')!
    f.store.applyAgenda({ kind: 'select', key: day.key })
    f.store.deleteEmptySelected()
    expect(f.snapshot().document).toBe(empty)
  })

  it('selects a previous sibling on the deleted occurrence day rather than its later mirror', async () => {
    const f = await fixture('insert')
    f.store.editText('first', '2026-10-14 Prepare 2026-10-20')
    f.store.applyAgenda({ kind: 'select', key: f.key.replace(':first', ':second') })
    f.store.editText('second', '')
    f.store.deleteEmptySelected()
    expect(f.snapshot().agenda?.selectedKey).toBe(f.key)
  })
  it.each(['previous', 'parent', 'day'] as const)(
    'selects the %s row after childless empty deletion and keeps document history',
    async (destination) => {
      const f = await fixture('insert')
      if (destination === 'previous') {
        const key = f.store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'second')!.key
        f.store.applyAgenda({ kind: 'select', key })
        f.store.editText('second', '')
      } else if (destination === 'day') {
        f.store.editText('second', '')
        f.store.deleteEmptySelected()
        // Both contextual ancestors disappear once their last dated descendant is removed.
        f.store.editText('first', '')
      } else f.store.editText('first', '')
      f.store.deleteEmptySelected()
      const key = f.snapshot().agenda!.selectedKey
      expect(key).toBe(
        destination === 'previous'
          ? f.key
          : destination === 'parent'
            ? f.key.replace(':first', ':context')
            : f.store
                .getAgendaRows()
                .filter((row) => row.kind === 'day')
                .sort((left, right) => {
                  const day = Number(f.key.split(':')[1])
                  return Math.abs(left.day - day) - Math.abs(right.day - day) || left.day - right.day
                })[0]!.key,
      )
      expect(f.snapshot().location.currentParentId).toBe(null)
      f.store.undo()
      expect(f.snapshot().document.roots[0]!.children.length).toBe(2)
    },
  )
  it.each([undefined, 'normal', 'insert', 'replace', 'visual'] as const)(
    'retains document, caret and mode for structural shortcuts in %s',
    async (mode) => {
      const f = await fixture(mode)
      const before = f.snapshot()
      for (const [key, options] of [
        ['Tab', {}],
        ['Tab', { shiftKey: true }],
        ['Backspace', { metaKey: true }],
        [',', { metaKey: true }],
      ] as const) {
        expect(f.press(key, options).preventDefault).toHaveBeenCalled()
      }
      expect(f.snapshot().document).toBe(before.document)
      expect(f.snapshot().location).toBe(before.location)
      expect(f.input.selectionStart).toBe(12)
      expect(f.input.selectionEnd).toBe(12)
      expect(f.vim.mode).toBe(mode ?? 'insert')
    },
  )

  // @requirement PRODUCT.md §23.11
  it.each([undefined, 'insert'] as const)(
    'splits at the caret with the displayed date on Enter in %s',
    async (mode) => {
      const f = await fixture(mode)
      const before = f.snapshot().document
      expect(f.press('Enter').preventDefault).toHaveBeenCalled()
      expect(f.snapshot().document.roots[0]!.children.map((node) => node.text)).toEqual([
        '2026-10-14 P',
        '2026-10-14 repare',
        '2026-10-14 Review',
      ])
      expect(f.snapshot().focus).toMatchObject({ nodeId: 'generated-0', cursor: 11 })
      expect(f.snapshot().agenda?.activeOccurrence?.nodeId).toBe('generated-0')
      f.store.undo()
      expect(f.snapshot().document).toBe(before)
    },
  )

  // @requirement PRODUCT.md §23.11
  it.each(['normal', 'replace', 'visual'] as const)('keeps Enter inert in Vim %s', async (mode) => {
    const f = await fixture(mode)
    const before = f.snapshot()
    expect(f.press('Enter').preventDefault).toHaveBeenCalled()
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().location).toBe(before.location)
    expect(f.vim.mode).toBe(mode)
  })

  // @requirement PRODUCT.md §23.11
  it('opens a dated sibling with o, enters Insert, and leaves repeat memory and the register alone', async () => {
    const f = await fixture('normal')
    const last = f.commandState.lastChange
    const register = f.vim.register.current
    f.press('o')
    expect(f.snapshot().document.roots[0]!.children.map((node) => node.text)).toEqual([
      '2026-10-14 Prepare',
      '2026-10-14 ',
      '2026-10-14 Review',
    ])
    expect(f.vim.mode).toBe('insert')
    expect(f.vim.beginStructuralOpen).not.toHaveBeenCalled()
    expect(f.commandState.lastChange).toBe(last)
    expect(f.vim.register.current).toBe(register)
  })

  it('blocks structural Vim commands and Tree structural repeat without changing register or repeat memory', async () => {
    const f = await fixture('normal')
    const before = f.snapshot().document
    f.commandState.lastChange = { kind: 'structural-delete', span: 1 }
    const last = f.commandState.lastChange
    const register = f.vim.register.current
    for (const command of [
      'dd',
      'dj',
      'dk',
      'cj',
      'ck',
      'yj',
      'yk',
      'gp',
      'gP',
      'gJ',
      'gd',
      'V',
      'J',
      '>',
      '<',
      'p',
      'P',
      '.',
    ]) {
      for (const key of command) f.press(key)
      expect(f.commandState.pending).toBeUndefined()
      expect(f.snapshot().document).toBe(before)
    }
    expect(f.commandState.lastChange).toBe(last)
    expect(f.vim.register.current).toBe(register)
    expect(f.vim.repeatStructural).not.toHaveBeenCalled()
  })

  it('permits awaited command-shaped characters as text and keeps text commands available', async () => {
    const f = await fixture('normal')
    f.press('r')
    f.press('o')
    expect(f.node('first').text).toBe('2026-10-14 Poepare')
    // The awaited o is replacement text, rather than sibling creation.
    expect(f.snapshot().document.roots[0]!.children).toHaveLength(2)
  })

  // @requirement PRODUCT.md §23.5
  it('routes input arrows, counted Vim motions and folds through Agenda without Tree expansion changes', async () => {
    const f = await fixture('normal')
    const expansion = f.snapshot().expansion
    f.press('j')
    expect(f.snapshot().agenda?.selectedKey).toContain(':second')
    f.press('g')
    f.press('g')
    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows()[0]!.key)
    f.store.applyAgenda({ kind: 'select', key: f.key })
    f.press('z')
    f.press('M')
    expect(f.snapshot().agenda?.selectedKey.startsWith('day:')).toBe(true)
    expect(f.snapshot().expansion).toBe(expansion)
    const handler = createAgendaKeyDownHandler({ store: f.store, vim: f.vim })
    handler({ key: 'z', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
    handler({ key: 'R', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
    expect(f.snapshot().agenda?.collapsed.size).toBe(0)
    f.store.applyAgenda({ kind: 'select', key: f.key })
    f.press('ArrowDown')
    expect(f.snapshot().agenda?.selectedKey).toContain(':second')
    expect(f.snapshot().focus.cursor).toBe(12)
  })

  // @requirement PRODUCT.md §23.10
  it.each([
    ['zo', 'open'],
    ['zO', 'open-recursive'],
    ['zc', 'close'],
    ['zC', 'close-recursive'],
    ['za', 'toggle'],
  ] as const)('dispatches %s on a direct match as an Agenda fold', async (keys, operation) => {
    const f = await fixture('normal')
    const apply = vi.spyOn(f.store, 'applyAgenda')
    for (const key of keys) f.press(key)
    expect(apply).toHaveBeenCalledWith({ kind: 'fold', key: f.key, operation })
  })

  // @requirement PRODUCT.md §23.1
  it('closes and enters the selected node through Agenda-aware navigation', async () => {
    const f = await fixture('insert')
    f.press('.', { metaKey: true })
    expect(f.snapshot().agenda).toBeUndefined()
    expect(f.snapshot().location.currentParentId).toBe('first')
  })

  // @requirement PRODUCT.md §23.8
  it('supports history commands from noneditable rows', async () => {
    const f = await fixture('normal')
    const before = f.node('first').text
    f.store.editText('first', `${before}!`)
    const day = f.store.getAgendaRows().find((row) => row.kind === 'day' && row.content)!
    f.store.applyAgenda({ kind: 'select', key: day.key })
    const handler = createAgendaKeyDownHandler({ store: f.store, vim: f.vim })
    handler({ key: 'u', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
    expect(f.node('first').text).toBe(before)
    handler({ key: 'r', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
    expect(f.node('first').text).toBe(`${before}!`)
  })
})
