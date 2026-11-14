// @vitest-environment jsdom
import { focusedAgendaDay } from '../application/agenda-state'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimCommandState } from './vim-command-state'
import type { VimTextCommandState } from './vim-session-finish'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { dayNumberOf } from '../domain/calendar-date'
import type { Document } from '../domain/document'
import * as viewport from './scroll-viewport'
import { getCaret, setCaret } from './editor-dom'
import type { VimCaretState } from './vim-caret-transition'

async function fixture(document: Document = { roots: [{ id: 'node', text: '2026-10-15 Prepare', children: [] }] }) {
  const harness = await createRealStoreHarness({
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 12 }) },
    document,
  })
  harness.store.openAgenda(2)
  const vim: VimTextCommandState = {
    mode: 'normal',
    commandState: createVimCommandState(),
    setMode: (mode) => {
      vim.mode = mode
    },
  }
  const handler = createAgendaKeyDownHandler({ store: harness.store, vim })
  const press = (key: string, options = {}) => {
    const event = { key, preventDefault: vi.fn(), ...options } as unknown as KeyboardEvent<HTMLElement>
    handler(event)
    return event
  }
  return { ...harness, vim, press }
}

describe('read-only Agenda keyboard', () => {
  it.each(['J', 'K'])('matches counted row navigation for %s on labels and editors', async (key) => {
    const document = {
      roots: Array.from({ length: 26 }, (_, i) => ({ id: `n${i}`, text: `2026-10-15 Row ${i}`, children: [] })),
    }
    for (const start of [0, 12, 26]) {
      for (const count of [1, 2]) {
        const fast = await fixture(document)
        const slow = await fixture(document)
        for (const f of [fast, slow]) {
          const rows = f.store.getAgendaRows()
          f.store.applyAgenda({ kind: 'select', key: rows[start]!.key, cursor: 4 })
        }

        fast.press(String(count))
        fast.press(key)
        for (const digit of String(count * 10)) slow.press(digit)

        slow.press(key.toLowerCase())

        expect(fast.snapshot().agenda).toEqual(slow.snapshot().agenda)
        expect(fast.snapshot().focus).toEqual(slow.snapshot().focus)
        expect(fast.snapshot().document).toEqual(slow.snapshot().document)
        expect(fast.vim.commandState.pending).toBeUndefined()
      }
    }
  })

  it.each([
    ['ArrowDown', {}],
    ['ArrowUp', {}],
    ['p', { metaKey: true }],
    ['.', { metaKey: true }],
    ['z', { metaKey: true }],
    ['z', { metaKey: true, shiftKey: true }],
  ])('ends click-preserved Replace before %s', async (key, options) => {
    const f = await fixture()
    const day = f.store.getAgendaRows().find((row) => row.kind === 'day')!

    f.store.applyAgenda({ kind: 'select', key: day.key })
    f.vim.mode = 'replace'

    f.press(key as string, options)

    expect(f.vim.mode).toBe('normal')
  })

  it('ends click-preserved Replace when returning from a focused day', async () => {
    const f = await fixture()
    const day = f.store.getAgendaRows().find((row) => row.kind === 'day')!

    f.store.applyAgenda({ kind: 'focus-day', key: day.key, scrollTop: 0 })
    f.vim.mode = 'replace'

    f.press(',', { metaKey: true })

    expect(f.vim.mode).toBe('normal')
  })

  it('lands viewport line motions at the first nonblank or image, including on the current row', async () => {
    const f = await fixture({
      roots: [
        { id: 'first', text: '  2026-10-15 First', children: [] },
        { id: 'image', text: '2026-10-15 Image', children: [], attachment: { id: 'image', mimeType: 'image/png' } },
        { id: 'last', text: '   2026-10-15 Last', children: [] },
      ],
    })
    const rows = f.store.getAgendaRows().filter((row) => row.kind === 'node')
    f.store.applyAgenda({ kind: 'select', key: rows[0]!.key, cursor: 5 })
    const bounds = vi.spyOn(viewport, 'viewportBounds').mockReturnValue({ top: 0, bottom: 100 })
    const edges = vi.spyOn(viewport, 'viewportScrollEdges').mockReturnValue({ atStart: true, atEnd: true })
    const elements = rows.map((row, index) => {
      const element = document.createElement('div')
      element.className = 'agenda-row'
      element.dataset.agendaKey = row.key
      element.getBoundingClientRect = () => ({ top: index * 25, bottom: (index + 1) * 25 }) as DOMRect
      document.body.append(element)
      return element
    })
    try {
      f.press('H')

      expect(f.snapshot().focus.cursor).toBe(2)

      f.press('M')

      expect(f.snapshot().focus).toMatchObject({ nodeId: 'image', cursor: 0 })

      f.press('L')

      expect(f.snapshot().focus).toMatchObject({ nodeId: 'last', cursor: 3 })

      f.press('g')
      f.press('g')

      expect(f.snapshot().agenda?.selectionCursor).toBe(0)

      f.press('G')

      expect(f.snapshot().focus).toMatchObject({ nodeId: 'last', cursor: 3 })

      f.press('u', { ctrlKey: true })

      expect(f.snapshot().focus).toMatchObject({ nodeId: 'image', cursor: 0 })
    } finally {
      elements.forEach((element) => element.remove())
      bounds.mockRestore()
      edges.mockRestore()
    }
  })

  it.each(['down', 'up'] as const)(
    'matches Tree when a counted motion passes an intermediate image moving %s',
    async (direction) => {
      const f = await fixture({
        roots: [
          { id: 'before', text: '2026-10-15 Before', children: [] },
          { id: 'image', text: '2026-10-15 Image', children: [], attachment: { id: 'image', mimeType: 'image/png' } },
          { id: 'after', text: '2026-10-15 After', children: [] },
        ],
      })
      const source = direction === 'down' ? 'before' : 'after'
      const destination = direction === 'down' ? 'after' : 'before'
      const row = f.store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === source)!
      f.store.applyAgenda({ kind: 'select', key: row.key, cursor: 4 })
      const input = document.createElement('textarea')
      input.className = 'node-input'
      input.value = `2026-10-15 ${source}`
      document.body.append(input)
      setCaret(input, 4)
      const handler = createAgendaKeyDownHandler({ store: f.store, vim: f.vim })
      try {
        handler({ key: '2', currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
        handler({
          key: direction === 'down' ? 'j' : 'k',
          currentTarget: input,
          preventDefault: vi.fn(),
        } as unknown as KeyboardEvent<HTMLElement>)

        expect(f.snapshot().location.selectedNodeId).toBe(destination)
        expect(f.snapshot().focus.cursor).toBe(4)
      } finally {
        input.remove()
      }
    },
  )

  it('keeps caret and focus token when vertical navigation clamps on an editor', async () => {
    const f = await fixture()
    const last = f.store.getAgendaRows().at(-1)!

    f.store.applyAgenda({ kind: 'select', key: last.key, cursor: 5 })
    const before = f.snapshot().focus

    f.press('j')
    f.press('j')

    expect(f.snapshot().focus).toBe(before)
  })

  it('counts image entry as a vertical step and restores a non-final text position', async () => {
    const f = await fixture({
      roots: [
        {
          id: 'image',
          text: '2026-10-15 Image',
          children: [],
          attachment: { id: 'attachment', mimeType: 'image/png' },
        },
        { id: 'after', text: '2026-10-15 After', children: [] },
      ],
    })
    const image = f.store.getAgendaRows().find((row) => row.kind === 'node' && row.nodeId === 'image')!
    f.store.applyAgenda({ kind: 'select', key: image.key, cursor: 4 })
    const input = document.createElement('textarea')
    input.className = 'node-input'
    input.value = '2026-10-15 Image'
    document.body.append(input)
    setCaret(input, 4)
    let caret: VimCaretState = { cursor: 4, imageActive: false }
    f.vim.getCaretState = (_id, cursor) => ({ ...caret, cursor })
    f.vim.applyCaretState = (_id, next) => {
      caret = next
      setCaret(input, next.cursor)
    }
    const handler = createAgendaKeyDownHandler({ store: f.store, vim: f.vim })
    const press = (key: string): void =>
      handler({ key, currentTarget: input, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
    try {
      press('j')

      expect(f.snapshot().agenda?.selectedKey).toBe(image.key)
      expect(caret).toEqual({ cursor: input.value.length, imageActive: true, imageTextReturnCursor: 4 })

      press('k')

      expect(caret).toEqual({ cursor: 4, imageActive: false })
      expect(getCaret(input)).toBe(4)

      press('2')
      press('j')

      expect(f.snapshot().location.selectedNodeId).toBe('after')
      expect(f.snapshot().focus.cursor).toBe(input.value.length - 1)

      press('k')

      expect(f.snapshot().location.selectedNodeId).toBe('image')
      expect(caret.imageActive).toBe(true)
      expect(caret.imageTextReturnCursor).toBe(input.value.length - 1)
    } finally {
      input.remove()
    }
  })

  it('clamps an oversized counted G before resolving its destination caret', async () => {
    const f = await fixture()

    f.press('9')
    f.press('9')
    f.press('9')
    f.press('G')

    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows().at(-1)!.key)
  })

  it('applies all-fold commands from empty Today and cancels unsupported fold keys', async () => {
    const f = await fixture()
    const today = f.store.getAgendaRows()[0]!
    const day = f.store.getAgendaRows().find((row) => row.kind === 'day' && row.content)!

    f.store.applyAgenda({ kind: 'select', key: today.key })
    f.press('z')
    f.press('M')

    expect(f.snapshot().agenda?.collapsed.has(day.key)).toBe(true)

    f.press('z')
    f.press('R')

    expect(f.snapshot().agenda?.collapsed.size).toBe(0)

    f.press('z')
    f.press('q')

    expect(f.vim.commandState.pending).toBeUndefined()

    f.press('a')

    expect(f.snapshot().agenda?.collapsed.size).toBe(0)
  })
  it('routes Cmd+E and Normal za to day folds while node folds do nothing', async () => {
    const f = await fixture()
    const before = f.snapshot()

    f.press('G')
    const day = f.store.getAgendaRows().find((row) => row.kind === 'day' && row.content)!

    f.store.applyAgenda({ kind: 'select', key: day.key })
    f.press('e', { metaKey: true })

    expect(f.snapshot().agenda?.collapsed.has(day.key)).toBe(true)

    f.press('z')
    f.press('a')

    expect(f.snapshot().agenda?.collapsed.has(day.key)).toBe(false)

    f.press('G')
    f.press('z')
    f.press('a')
    f.press('e', { metaKey: true })

    expect(f.snapshot().agenda?.collapsed.size).toBe(0)
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().expansion).toBe(before.expansion)
    expect(f.saves).toHaveLength(0)
  })
  it('uses flat rows and row counts for viewport motions, preserving line-motion scroll', async () => {
    const f = await fixture({
      roots: Array.from({ length: 4 }, (_, index) => ({ id: `n${index}`, text: '2026-10-15 Item', children: [] })),
    })
    const beforeSelect = vi.fn()
    const handler = createAgendaKeyDownHandler({ store: f.store, vim: f.vim, beforeSelect })
    const bounds = vi.spyOn(viewport, 'viewportBounds').mockReturnValue({ top: 0, bottom: 200 })
    const edges = vi.spyOn(viewport, 'viewportScrollEdges').mockReturnValue({ atStart: false, atEnd: false })
    const rows = f.store.getAgendaRows()
    // One row in each edge context; a wrapped middle row makes pixel-half differ from row-half.
    const boxes = [
      [0, 20],
      [25, 45],
      [50, 130],
      [135, 155],
      [160, 180],
      [180, 200],
    ]
    const elements = boxes.map(([top, bottom], index) => {
      const element = document.createElement('div')
      element.className = 'agenda-row'
      element.dataset.agendaKey = rows[index]!.key
      element.getBoundingClientRect = () => ({ top: top!, bottom: bottom! }) as DOMRect
      document.body.append(element)
      return element
    })
    try {
      handler({ key: 'H', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)

      expect(f.snapshot().agenda?.selectedKey).toBe(rows[1]!.key)

      handler({ key: 'M', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)

      expect(f.snapshot().agenda?.selectedKey).toBe(rows[2]!.key)

      handler({ key: 'L', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)

      expect(f.snapshot().agenda?.selectedKey).toBe(rows[3]!.key)
      expect(beforeSelect.mock.calls).toEqual([[true], [true], [true]])

      f.store.applyAgenda({ kind: 'select', key: rows[0]!.key })
      handler({ key: 'd', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)

      expect(f.snapshot().agenda?.selectedKey).toBe(rows[3]!.key)

      handler({ key: 'u', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)

      expect(f.snapshot().agenda?.selectedKey).toBe(rows[0]!.key)
    } finally {
      elements.forEach((element) => element.remove())
      bounds.mockRestore()
      edges.mockRestore()
    }
  })
  it('counts motions and boundaries, clamps, and retains repeat memory', async () => {
    const f = await fixture()
    f.vim.commandState.lastFind = { character: 'x', kind: 'f' }

    f.press('2')
    f.press('j')

    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows()[2]!.key)

    f.press('9')
    f.press('9')
    f.press('j')

    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows().at(-1)!.key)

    f.press('g')
    f.press('g')
    f.press('ArrowUp')

    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows()[0]!.key)

    f.press('3')
    f.press('G')

    expect(f.snapshot().agenda?.selectedKey).toBe(f.store.getAgendaRows()[2]!.key)
    expect(f.vim.commandState.lastFind?.character).toBe('x')
  })

  it('ignores text, structural commands, modifiers and composition; Escape clears pending', async () => {
    const f = await fixture()
    const before = f.snapshot()
    for (const key of ['i', 'a', 'R', 'd', 'p', 'Enter', 'Backspace', 'Tab', '>', '<']) f.press(key)

    f.press('j', { nativeEvent: { isComposing: true } })
    f.press('2')
    f.press('Meta')

    expect(f.vim.commandState.pending?.count).toBe('2')

    f.press('Escape')

    expect(f.vim.commandState.pending).toBeUndefined()
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().agenda?.selectedKey).toBe(before.agenda?.selectedKey)
    expect(f.saves).toHaveLength(0)
  })

  it('closes at origin and enters Tree only on real rows', async () => {
    const f = await fixture()

    f.press('.', { metaKey: true })

    expect(f.snapshot().agenda).toBeDefined()
    expect(focusedAgendaDay(f.snapshot().agenda)).toBeDefined()

    f.press(',', { metaKey: true })

    expect(focusedAgendaDay(f.snapshot().agenda)).toBeUndefined()

    f.store.applyAgenda({ kind: 'select', key: f.store.getAgendaRows().find((row) => row.kind === 'node')!.key })
    f.press('.', { metaKey: true })

    expect(f.snapshot().agenda).toBeUndefined()
    expect(f.snapshot().location.currentParentId).toBe('node')

    f.store.openAgenda()
    f.press('p', { metaKey: true })

    expect(f.snapshot().location.currentParentId).toBe('node')
    expect(f.snapshot().agenda).toBeUndefined()
  })
})
