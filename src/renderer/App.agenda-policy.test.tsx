// @vitest-environment jsdom

import { act, fireEvent, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { createAppHarness, settleApp } from './test/app-harness'

const vimSequences = ['dj', 'dk', 'cj', 'ck', 'yj', 'yk', 'gJ', 'gp', 'gP', 'd2j', 'c2k', 'y2j']
type Role = 'day' | 'match'
type Command = { keys: string[]; modifiers?: KeyboardEventInit }

function commands(role: Role, vimEnabled: boolean): Command[] {
  const result: Command[] = [
    { keys: ['Tab'] },
    { keys: ['Tab'], modifiers: { shiftKey: true } },
    { keys: ['Backspace'], modifiers: { metaKey: true } },
  ]
  if (role !== 'match') {
    result.push({ keys: ['Enter'], modifiers: { metaKey: true } }, { keys: ['Backspace'] })
    result.push({ keys: ['Enter'] })
    if (vimEnabled) {
      result.push(...['i', 'a', 'R', 'dd', 'p', 'P'].map((sequence) => ({ keys: [...sequence] })))
      result.push({ keys: ['o'] }, { keys: ['O'] }, { keys: ['V'] })
    } else result.push({ keys: ['q'] })
  }
  if (vimEnabled) result.push(...['>', '<', ...vimSequences].map((sequence) => ({ keys: [...sequence] })))
  return result
}

describe.each([false, true])('App Agenda no-op policy (Vim %s)', (vimEnabled) => {
  // @requirement PRODUCT.md §23.4
  // @requirement PRODUCT.md §23.9
  // @requirement PRODUCT.md §23.10
  // @requirement PRODUCT.md §23.13
  it.each(['day', 'match'] as const)('preserves the live document, selection and focus on %s', async (role) => {
    const f = await createAppHarness({
      vimEnabled,
      document: {
        roots: [
          {
            id: 'context',
            text: 'Context',
            children: [
              { id: 'first', text: '2026-10-09 Prepare 2026-10-20', children: [] },
              {
                id: 'second',
                text: '2026-10-09 Review',
                children: [{ id: 'child', text: '2026-10-20 Child', children: [] }],
              },
            ],
          },
        ],
      },
    })
    const undoTarget = structuredClone(f.snapshot().document)
    act(() => {
      // A real earlier edit makes an accidental no-op Undo entry observable.
      f.store.editText('child', '2026-10-20 Child edited')
      f.store.openAgenda()
    })
    await settleApp()
    const day = dayNumberOf({ year: 2026, month: 10, day: 9 })
    const selector = role === 'day' ? `[data-agenda-key="day:${day}"]` : '.agenda-role-match'
    const row = f.container.querySelector<HTMLElement>(selector)!
    const rowKey = row.getAttribute('data-agenda-key')!
    fireEvent.click(row)
    await settleApp()
    const target = role === 'match' ? screen.getByRole('textbox', { name: 'Agenda node first' }) : row
    if (role === 'match') await f.focus(target, 12)
    await act(async () => f.store.flushPersistence())
    const before = f.snapshot()
    const original = structuredClone(before.document)
    const saveCount = f.saves.length

    for (const command of commands(role, vimEnabled)) {
      for (const key of command.keys) await f.press(target, key, command.modifiers)

      const state = f.snapshot()
      expect(state.document, command.keys.join('')).toBe(before.document)
      expect(state.document).toEqual(original)
      expect(state.location).toEqual(before.location)
      expect(state.agenda?.selectedKey).toBe(before.agenda?.selectedKey)
      expect(target).toHaveFocus()
      expect(f.container.querySelector(`[data-agenda-key="${rowKey}"]`)).toHaveAttribute('aria-selected', 'true')
      if (vimEnabled) expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
      if (role === 'match') expect(f.selection(target)).toEqual({ start: 12, end: 12 })
    }

    await act(async () => f.store.flushPersistence())

    expect(f.saves).toHaveLength(saveCount)

    act(() => f.store.undo())

    expect(f.snapshot().document).toEqual(undoTarget)
  })
})
