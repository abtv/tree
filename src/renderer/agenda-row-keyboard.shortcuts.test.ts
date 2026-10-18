// @vitest-environment jsdom
// @requirement PRODUCT.md §1.5

import type { KeyboardEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import type { Document } from '../domain/document'
import { requireNode } from '../domain/document'
import { agendaRowLabel } from './agenda-labels'
import { arrivalCaret, type RowCaret } from './agenda-row-caret'
import { createAgendaKeyDownHandler, type AgendaRowText } from './agenda-row-keyboard'
import type { VimTextCommandState } from './editor-input-handlers'
import * as viewport from './scroll-viewport'
import { shortcutProfile, type ShortcutPlatform } from './shortcut-profile'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimCommandState } from './vim-command-state'

const NESTED: Document = {
  roots: [{ id: 'work', text: 'Work', children: [{ id: 'item', text: '2026-10-15 Prepare', children: [] }] }],
}

type Press = { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean }

const primary = (platform: ShortcutPlatform): Press => (platform === 'apple' ? { meta: true } : { ctrl: true })

async function fixture(platform: ShortcutPlatform, vimMode: VimTextCommandState['mode'] | 'standard' = 'normal') {
  const harness = await createRealStoreHarness({
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
    document: NESTED,
  })
  harness.store.openAgenda(2)
  const vim: VimTextCommandState | undefined =
    vimMode === 'standard'
      ? undefined
      : {
          mode: vimMode,
          commandState: createVimCommandState(),
          register: { current: { kind: 'text', value: '' } },
          setMode: (next) => {
            vim!.mode = next
          },
        }
  let caret: RowCaret = arrivalCaret('')
  const copied: string[] = []
  const rowText: AgendaRowText = {
    textOf: (row) => {
      const state = harness.store.getSnapshot()
      if (state.status !== 'ready' || state.agenda === undefined) return ''
      return row.kind === 'node'
        ? requireNode(state.document, row.nodeId).node.text
        : agendaRowLabel(row, state.agenda.today)
    },
    hasEditor: () => false,
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
  const handler = createAgendaKeyDownHandler({
    store: harness.store,
    vim,
    rowText,
    shortcuts: shortcutProfile(platform),
  })
  const press = (key: string, modifiers: Press = {}) => {
    const event = {
      key,
      ctrlKey: modifiers.ctrl ?? false,
      metaKey: modifiers.meta ?? false,
      altKey: modifiers.alt ?? false,
      shiftKey: modifiers.shift ?? false,
      preventDefault: vi.fn(),
    } as unknown as KeyboardEvent<HTMLElement>
    handler(event)
    return event
  }
  const selectRow = (predicate: (row: ReturnType<typeof harness.store.getAgendaRows>[number]) => boolean): void => {
    harness.store.applyAgenda({ kind: 'select', key: harness.store.getAgendaRows().find(predicate)!.key })
  }
  const selectedText = (): string => {
    const state = harness.store.getSnapshot()
    return rowText.textOf(
      harness.store.getAgendaRows().find((row) => state.status === 'ready' && row.key === state.agenda?.selectedKey)!,
    )
  }
  return { ...harness, vim, press, copied, selectRow, selectedText, caret: () => rowText.caret() }
}

const platforms: ShortcutPlatform[] = ['apple', 'other']
const isMatch = (row: { kind: string; role?: string }): boolean => row.kind === 'node' && row.role === 'match'
const isDay = (row: { kind: string }): boolean => row.kind === 'day'

afterEach(() => vi.restoreAllMocks())

describe('Agenda keyboard primary commands on each profile', () => {
  it.each([
    ['p', {}],
    ['.', {}],
    [',', {}],
    ['z', {}],
    ['z', { shift: true }],
    ['e', {}],
  ] as const)('runs the same outcome for Cmd and Ctrl with %s %o', async (key, extra) => {
    const outcomes = []
    for (const platform of platforms) {
      const f = await fixture(platform)
      f.selectRow(isDay)
      f.press(key, { ...primary(platform), ...extra })
      const state = f.snapshot()
      outcomes.push({
        agenda: state.agenda !== undefined,
        focusedDay: state.agenda?.focusedDay,
        selectedKey: state.agenda?.selectedKey,
        parent: state.location.currentParentId,
      })
    }
    expect(outcomes[1]).toEqual(outcomes[0])
  })

  it('closes the Agenda with Ctrl+P and focuses a day with Ctrl+.', async () => {
    const closed = await fixture('other')
    closed.press('p', { ctrl: true })
    expect(closed.snapshot().agenda).toBeUndefined()
    const focused = await fixture('other')
    focused.selectRow(isDay)
    focused.press('.', { ctrl: true })
    expect(focused.snapshot().agenda?.focusedDay).toBeDefined()
  })

  it('gives Ctrl no command on the Apple profile and Meta none on the other profile', async () => {
    const apple = await fixture('apple')
    apple.press('p', { ctrl: true })
    expect(apple.snapshot().agenda).toBeDefined()
    const other = await fixture('other')
    other.press('p', { meta: true })
    expect(other.snapshot().agenda).toBeDefined()
  })
})

describe('Agenda keyboard Meta combinations on the other profile', () => {
  it.each(['standard', 'normal'] as const)('run no command in %s', async (mode) => {
    const f = await fixture('other', mode)
    f.selectRow(isDay)
    const before = f.snapshot()
    for (const key of ['Enter', 'ArrowDown', 'j', 'd']) {
      const event = f.press(key, { meta: true })
      expect(event.preventDefault).not.toHaveBeenCalled()
    }
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().agenda?.selectedKey).toBe(before.agenda?.selectedKey)
  })
})

describe('Agenda keyboard Ctrl commands in Vim Normal on a non-Apple profile', () => {
  it('keeps Ctrl+O returning to the timeline from a focused day', async () => {
    const f = await fixture('other')
    f.selectRow(isDay)
    f.press('.', { ctrl: true })
    expect(f.snapshot().agenda?.focusedDay).toBeDefined()
    f.press('o', { ctrl: true })
    expect(f.snapshot().agenda?.focusedDay).toBeUndefined()
  })

  it('keeps Ctrl+R redoing', async () => {
    const f = await fixture('other')
    const redo = vi.spyOn(f.store, 'redo')
    f.press('r', { ctrl: true })
    expect(redo).toHaveBeenCalledTimes(1)
  })

  it.each(['d', 'u'])('keeps Ctrl+%s a viewport motion', async (key) => {
    const f = await fixture('other')
    const bounds = vi.spyOn(viewport, 'viewportBounds').mockReturnValue({ top: 0, bottom: 100 })
    const event = f.press(key, { ctrl: true })
    expect(bounds).toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it.each(['normal', 'visual'] as const)('blocks an unmapped Ctrl key in %s but not a mapped one', async (mode) => {
    const f = await fixture('other', mode)
    expect(f.press('n', { ctrl: true }).preventDefault).toHaveBeenCalled()
    expect(f.press('q', { ctrl: true }).preventDefault).not.toHaveBeenCalled()
  })

  it('leaves an unmapped Ctrl key native without Vim and on the Apple profile', async () => {
    const standard = await fixture('other', 'standard')
    expect(standard.press('n', { ctrl: true }).preventDefault).not.toHaveBeenCalled()
    const apple = await fixture('apple')
    expect(apple.press('n', { meta: true }).preventDefault).not.toHaveBeenCalled()
  })
})

describe('Agenda row text keys on each profile', () => {
  it.each(platforms)('selects all and copies with the primary modifier on %s', async (platform) => {
    const f = await fixture(platform, 'standard')
    f.selectRow(isMatch)
    const text = f.selectedText()
    f.press('a', primary(platform))
    expect(f.caret()).toMatchObject({ anchor: 0, focus: text.length })
    f.press('c', primary(platform))
    expect(f.copied).toEqual([text])
  })

  it.each(platforms)('copies the Vim Normal caret character with the primary modifier on %s', async (platform) => {
    const f = await fixture(platform)
    f.selectRow(isMatch)
    f.press('c', primary(platform))
    expect(f.copied).toEqual([f.selectedText().slice(0, 1)])
  })

  it('moves to the line edges with Home and End and extends with Shift', async () => {
    const f = await fixture('other', 'standard')
    f.selectRow(isMatch)
    const length = f.selectedText().length
    f.press('End')
    expect(f.caret().focus).toBe(length)
    f.press('Home', { shift: true })
    expect(f.caret()).toMatchObject({ anchor: length, focus: 0 })
    f.press('End')
    f.press('Home')
    expect(f.caret()).toMatchObject({ anchor: 0, focus: 0 })
  })

  it('moves by word with Ctrl+Left/Right as Option does on Apple platforms', async () => {
    const apple = await fixture('apple', 'standard')
    apple.selectRow(isMatch)
    apple.press('ArrowRight', { alt: true })
    const word = apple.caret().focus
    const other = await fixture('other', 'standard')
    other.selectRow(isMatch)
    other.press('ArrowRight', { ctrl: true })
    expect(other.caret().focus).toBe(word)
    expect(word).toBeGreaterThan(0)
    expect(word).toBeLessThan(other.selectedText().length)
    other.press('ArrowLeft', { ctrl: true })
    expect(other.caret().focus).toBe(0)
  })

  it('extends the selection by word with Ctrl+Shift+Right and sends Cmd+Right to the line end only on Apple', async () => {
    const other = await fixture('other', 'standard')
    other.selectRow(isMatch)
    other.press('ArrowRight', { ctrl: true, shift: true })
    expect(other.caret().anchor).toBe(0)
    expect(other.caret().focus).toBeGreaterThan(0)
    expect(other.caret().focus).toBeLessThan(other.selectedText().length)
    const apple = await fixture('apple', 'standard')
    apple.selectRow(isMatch)
    apple.press('ArrowRight', { meta: true })
    expect(apple.caret().focus).toBe(apple.selectedText().length)
  })

  it('leaves Alt+Arrow inert and Meta+Arrow without a command on the other profile', async () => {
    const f = await fixture('other', 'standard')
    f.selectRow(isMatch)
    f.press('ArrowRight', { alt: true })
    expect(f.caret().focus).toBe(0)
    f.press('ArrowRight', { meta: true })
    expect(f.caret().focus).toBe(0)
  })

  it('keeps Ctrl+Arrow inert on the Apple profile', async () => {
    const f = await fixture('apple', 'standard')
    f.selectRow(isMatch)
    f.press('ArrowRight', { ctrl: true })
    expect(f.caret().focus).toBe(0)
  })
})
