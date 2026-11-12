// @vitest-environment jsdom
import { act, screen } from '@testing-library/react'
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

it('groups by parent identity, keeps scope-relative labels passive and navigates only flat matches', async () => {
  const f = await createAppHarness({
    vimEnabled: true,
    document: { roots },
    location: { currentParentId: 'work', selectedNodeId: 'project' },
  })
  act(() => f.store.openAgenda())
  await settleApp()

  expect([...f.container.querySelectorAll('.agenda-path-label')].map((element) => element.textContent)).toEqual([
    'Project',
    'Project',
  ])
  const rows = f.store.getAgendaRows().filter((row) => row.kind === 'node')
  expect(rows.map((row) => row.nodeId)).toEqual(['a', 'b', 'c', 'direct'])
  expect(rows.every((row) => row.depth === 0 && row.role === 'match')).toBe(true)
  expect(f.container.querySelectorAll('.agenda-row-node .node-disclosure-triangle')).toHaveLength(0)

  const day = f.container.querySelector<HTMLElement>(`[data-agenda-key="${dayKey}"]`)!
  await f.press(day, 'j')
  expect(f.snapshot().agenda?.selectedKey).toBe(`node:${today}:a`)
  await f.press(screen.getByRole('textbox', { name: 'Agenda node a' }), 'j')
  expect(f.snapshot().agenda?.selectedKey).toBe(`node:${today}:b`)
  await f.press(screen.getByRole('textbox', { name: 'Agenda node b' }), 'j')
  expect(f.snapshot().agenda?.selectedKey).toBe(`node:${today}:c`)
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
    expect(f.snapshot().agenda?.pinnedOccurrence?.nodeId).toBe('a')
    expect(f.store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(true)

    act(() => f.store.applyAgenda({ kind: 'select', key: dayKey }))
    await settleApp()
    expect(f.node('a').text).toBe('')
    expect(f.store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'a')).toBe(false)
  },
)

it('searches node text across folded days, excludes path labels and preserves focused days', async () => {
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
  expect(f.snapshot().agenda?.focusedDay).toBe(today)
  expect(f.container.querySelectorAll('.agenda-path-label')).toHaveLength(3)
  expect(f.container.querySelectorAll('.agenda-focused-heading')).toHaveLength(1)
})

it('omits empty calendar days and gaps while retaining a nonfoldable Today message', async () => {
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
  ).toEqual([dayNumberOf({ year: 2026, month: 9, day: 1 }), today, dayNumberOf({ year: 2026, month: 12, day: 20 })])
  expect(f.container.querySelectorAll('.agenda-row-gap')).toHaveLength(0)
  expect(screen.getByText('No entries for today')).toBeVisible()
  const message = f.container.querySelector<HTMLElement>(`[data-agenda-key="${dayKey}"]`)!
  expect(message.querySelector('button')).toBeNull()
  await f.press(message, 'e', { metaKey: true })
  expect(f.snapshot().agenda?.collapsed.size).toBe(0)
})

it('retains the last dated day while editing and shows an empty state after leaving the pinned node', async () => {
  const date = dayNumberOf({ year: 2026, month: 12, day: 20 })
  const f = await createAppHarness({
    vimEnabled: false,
    document: { roots: [{ id: 'only', text: '2026-12-20 Only entry', children: [] }] },
  })
  act(() => {
    f.store.openAgenda()
    f.store.applyAgenda({ kind: 'select', key: `node:${date}:only` })
    f.store.editText('only', 'Undated')
  })
  await settleApp()

  expect(f.snapshot().agenda?.pinnedOccurrence).toEqual({ nodeId: 'only', day: date })
  expect(f.container.querySelector(`[data-agenda-key="day:${date}"]`)).not.toBeNull()

  act(() => f.store.applyAgenda({ kind: 'select', key: dayKey }))
  await settleApp()

  expect(f.store.getAgendaRows().map((row) => row.key)).toEqual([dayKey])
  expect(screen.getByText('No entries for today')).toBeVisible()
  expect(f.node('only').text).toBe('Undated')

  act(() => f.store.undo())
  await settleApp()

  expect(f.store.getAgendaRows().some((row) => row.kind === 'node' && row.nodeId === 'only')).toBe(true)
})
