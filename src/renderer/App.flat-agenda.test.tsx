// @vitest-environment jsdom
import { pinnedAgendaOccurrence, focusedAgendaDay } from '../application/agenda-state'
import { act, fireEvent, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { createAppHarness, settleApp } from './test/app-harness'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
const dayKey = `day:${today}`
const roots = [
  {
    id: 'work',
    text: 'Work',
    children: [
      {
        id: 'project',
        text: 'Project',
        children: [
          { id: 'a', text: '2026-10-08 First', children: [] },
          { id: 'b', text: '2026-10-08 Second', children: [] },
        ],
      },
      {
        id: 'other-project',
        text: 'Project',
        children: [{ id: 'c', text: '2026-10-08 Third', children: [] }],
      },
      { id: 'direct', text: '2026-10-08 Direct', children: [] },
    ],
  },
]

it.each([false, true])('stops on day separators without editing content (Vim %s)', async (vimEnabled) => {
  const f = await createAppHarness({
    vimEnabled,
    document: {
      roots: [
        { id: 'first', text: '2026-10-08 First', children: [] },
        { id: 'second', text: '2026-10-09 Second', children: [] },
      ],
    },
  })
  act(() => {
    f.store.openAgenda()
    f.store.applyAgenda({ kind: 'select', key: `node:${today}:first` })
  })
  await settleApp()
  const before = f.snapshot().document
  const down = vimEnabled ? 'j' : 'ArrowDown'
  const up = vimEnabled ? 'k' : 'ArrowUp'
  const separatorKey = `separator:${today + 1}`
  const separator = f.container.querySelector<HTMLElement>(`[data-agenda-key="${separatorKey}"]`)!

  await f.press(screen.getByRole('textbox', { name: 'Agenda node first' }), down)
  expect(f.snapshot().agenda?.selectedKey).toBe(separatorKey)
  expect(separator).toHaveFocus()
  expect(separator.querySelector('.agenda-caret')).not.toBeNull()
  await f.press(separator, 'Enter')
  await f.press(separator, '.', { metaKey: true })
  expect(f.snapshot().document).toBe(before)
  expect(f.snapshot().agenda?.selectedKey).toBe(separatorKey)

  await f.press(separator, down)
  expect(f.snapshot().agenda?.selectedKey).toBe(`day:${today + 1}`)
  await f.press(f.container.querySelector<HTMLElement>(`[data-agenda-key="day:${today + 1}"]`)!, up)
  expect(f.snapshot().agenda?.selectedKey).toBe(separatorKey)
  await f.press(separator, up)
  expect(f.snapshot().agenda?.selectedKey).toBe(`node:${today}:first`)

  fireEvent.click(separator)
  await settleApp()
  expect(f.snapshot().agenda?.selectedKey).toBe(separatorKey)
  expect(separator).toHaveFocus()
})

it.each([false, true])('blocks node operations and folds only days (Vim %s)', async (vimEnabled) => {
  const f = await createAppHarness({ vimEnabled, document: { roots } })
  act(() => f.store.openAgenda())
  await settleApp()
  const day = f.container.querySelector<HTMLElement>(`[data-agenda-key="${dayKey}"]`)!
  const before = f.snapshot().document
  await f.press(day, 'Enter')
  if (vimEnabled) {
    await f.press(day, 'o')
    await f.press(day, 'O')
  }
  act(() => f.store.applyAgenda({ kind: 'select', key: `node:${today}:a` }))
  await settleApp()
  const input = screen.getByRole('textbox', { name: 'Agenda node a' })
  await f.focus(input, 12)
  if (vimEnabled) {
    for (const key of ['V', 'o', 'O', 'd', 'd', 'p', 'P', 'z', 'a']) await f.press(input, key)
    expect(screen.getByLabelText('Vim mode')).toHaveTextContent('NORMAL')
  } else await f.press(input, 'e', { metaKey: true })
  expect(f.snapshot().document).toBe(before)
  expect('pendingMove' in f.snapshot().agenda!).toBe(false)
  expect(f.snapshot().agenda?.collapsed.size).toBe(0)
  expect(f.store.getAgendaRows().filter((row) => row.kind === 'node')).toHaveLength(4)

  act(() => f.store.applyAgenda({ kind: 'toggle-fold', key: dayKey }))
  await settleApp()
  expect(f.snapshot().agenda?.selectedKey).toBe(dayKey)
  expect(f.container.querySelectorAll('.agenda-path-label, .agenda-row-node')).toHaveLength(0)

  act(() => f.store.applyAgenda({ kind: 'toggle-fold', key: dayKey }))
  await settleApp()
  expect(f.container.querySelectorAll('.agenda-row-node')).toHaveLength(4)
})

it.each([false, true])(
  'keeps Enter and multiline paste in one node and retains an emptied node (Vim %s)',
  async (vimEnabled) => {
    const f = await createAppHarness({ vimEnabled, document: { roots } })
    act(() => {
      f.store.openAgenda()
      f.store.applyAgenda({ kind: 'select', key: `node:${today}:a` })
    })
    await settleApp()
    let input = screen.getByRole('textbox', { name: 'Agenda node a' })
    await f.focus(input, 12)
    if (vimEnabled) await f.press(input, 'i')
    await f.press(input, 'Enter')
    expect(f.node('a').text).toBe('2026-10-08 F\nirst')
    expect(f.selection(screen.getByRole('textbox', { name: 'Agenda node a' }))).toEqual({ start: 13, end: 13 })

    f.clipboard.current = { kind: 'text', text: 'one\ntwo' }
    await act(async () => f.store.paste('a', 13))
    await settleApp()
    expect(f.node('a').text).toBe('2026-10-08 F\none\ntwoirst')
    expect(f.node('project').children.map((node) => node.id)).toEqual(['a', 'b'])

    act(() => f.store.undo())
    await settleApp()
    expect(f.node('a').text).toBe('2026-10-08 F\nirst')
    act(() => f.store.undo())
    await settleApp()
    expect(f.node('a').text).toBe('2026-10-08 First')

    input = screen.getByRole('textbox', { name: 'Agenda node a' })
    await f.input(input, '')
    await f.press(input, 'Backspace')
    expect(f.node('a').text).toBe('')
    expect(pinnedAgendaOccurrence(f.snapshot().agenda)?.nodeId).toBe('a')
    expect(f.store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(true)

    act(() => f.store.applyAgenda({ kind: 'select', key: dayKey }))
    await settleApp()
    expect(f.node('a').text).toBe('')
    expect(f.store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(false)
  },
)

it.each([false, true].flatMap((vimEnabled) => [false, true].map((returned) => ({ vimEnabled, returned }))))(
  'repeats Find from the native Agenda caret while the prompt retains focus (Vim $vimEnabled, returned $returned)',
  async ({ vimEnabled, returned }) => {
    const f = await createAppHarness({
      vimEnabled,
      document: { roots: [{ id: 'dated', text: 'apple apple apple 2026-10-08', children: [] }] },
    })
    act(() => {
      f.store.openAgenda()
      f.store.applyAgenda({ kind: 'select', key: `node:${today}:dated` })
      if (returned) {
        f.store.applyAgenda({ kind: 'focus-day', key: dayKey, scrollTop: 0 })
        f.store.applyAgenda({ kind: 'return-timeline', key: dayKey })
      }
    })
    await settleApp()
    const editor = screen.getByRole('textbox', { name: 'Agenda node dated' })
    await f.focus(editor, 0)
    expect(f.snapshot().agenda?.activity.kind).toBe(returned ? 'inactive' : 'dated')
    await f.press(editor, 'f', { metaKey: true })
    const prompt = screen.getByRole('textbox', { name: 'Search' })
    fireEvent.change(prompt, { target: { value: 'apple' } })
    await settleApp()

    for (const expected of ['2 / 3', '3 / 3']) {
      await f.press(prompt, 'Enter')

      expect(screen.getByText(expected)).toBeInTheDocument()
      expect(prompt).toHaveFocus()
      expect(f.snapshot().agenda?.activity.kind).toBe(returned ? 'inactive' : 'dated')
    }
  },
)

it('searches node text across folded days, excludes parents and preserves focused days', async () => {
  const f = await createAppHarness({ vimEnabled: false, document: { roots } })
  Object.defineProperty(f.container.querySelector('.scroll-viewport'), 'scrollTo', { value: vi.fn() })
  act(() => {
    f.store.openAgenda()
    f.store.applyAgenda({ kind: 'toggle-fold', key: dayKey })
    f.store.search.begin({ beforeDay: today, offset: 0 })
    f.store.search.edit('Project')
  })
  await settleApp()
  expect(f.store.search.session.getSnapshot().count?.total).toBe(0)

  act(() => {
    f.store.search.edit('Second')
    f.store.search.confirm()
  })
  await settleApp()
  expect(f.snapshot().agenda?.selectedKey).toBe(`node:${today}:b`)
  expect(f.snapshot().agenda?.collapsed.has(dayKey)).toBe(false)

  act(() => {
    f.store.hideSearch()
    f.store.applyAgenda({ kind: 'focus-day', key: dayKey, scrollTop: 0 })
  })
  await settleApp()
  expect(focusedAgendaDay(f.snapshot().agenda)).toBe(today)
  expect(f.container.querySelectorAll('.agenda-path-label')).toHaveLength(0)
  expect(f.container.querySelectorAll('.agenda-row-node')).toHaveLength(4)
  expect(f.container.querySelectorAll('.agenda-focused-heading')).toHaveLength(1)
})

it('shows all seven dated headings and keeps empty days nonfoldable', async () => {
  const f = await createAppHarness({
    vimEnabled: false,
    document: {
      roots: [
        { id: 'past', text: '2026-09-01 Earlier', children: [] },
        { id: 'future', text: '2026-12-20 Later', children: [] },
      ],
    },
  })
  act(() => f.store.openAgenda())
  await settleApp()

  expect(
    f.store
      .getAgendaRows()
      .filter((row) => row.kind === 'day')
      .map((row) => row.day),
  ).toEqual(Array.from({ length: 7 }, (_, index) => today - 3 + index))
  expect(f.container.querySelectorAll('.agenda-row-gap')).toHaveLength(0)
  expect(screen.getByText('Thu Oct 8')).toBeVisible()
  const message = f.container.querySelector<HTMLElement>(`[data-agenda-key="${dayKey}"]`)!
  expect(message.querySelector('button')).toBeNull()
  await f.press(message, 'e', { metaKey: true })
  expect(f.snapshot().agenda?.collapsed.size).toBe(0)
})

it('retains the last dated day while editing and shows an empty state after leaving the pinned node', async () => {
  const date = today + 1
  const f = await createAppHarness({
    vimEnabled: false,
    document: { roots: [{ id: 'only', text: '2026-10-09 Only entry', children: [] }] },
  })
  act(() => {
    f.store.openAgenda()
    f.store.applyAgenda({ kind: 'select', key: `node:${date}:only` })
    f.store.editText('only', 'Undated')
  })
  await settleApp()

  expect(pinnedAgendaOccurrence(f.snapshot().agenda)).toEqual({ nodeId: 'only', day: date })
  expect(f.container.querySelector(`[data-agenda-key="day:${date}"]`)).not.toBeNull()

  act(() => f.store.applyAgenda({ kind: 'select', key: dayKey }))
  await settleApp()

  expect(f.store.getAgendaRows().filter((row) => row.kind === 'day')).toHaveLength(7)
  expect(f.store.getAgendaRows().filter((row) => row.kind === 'node')).toHaveLength(0)
  expect(screen.getByText('Thu Oct 8')).toBeVisible()
  expect(f.node('only').text).toBe('Undated')

  act(() => f.store.undo())
  await settleApp()

  expect(f.store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'only')).toBe(true)
})
