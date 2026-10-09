// @vitest-environment jsdom
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { createRealStoreHarness } from './test/real-store-harness'
import { createVimCommandState } from './vim-command-state'
import type { VimTextCommandState } from './editor-input-handlers'
import { createAgendaKeyDownHandler } from './agenda-row-keyboard'
import { dayNumberOf } from '../domain/calendar-date'
import * as viewport from './scroll-viewport'

async function fixture() {
  const harness = await createRealStoreHarness({
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
    document: { roots: [{ id: 'node', text: '2026-10-15 Prepare', children: [] }] },
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
  it('applies all-fold commands from a gap and cancels unsupported fold keys', async () => {
    const f = await fixture()
    const gap = f.store.getAgendaRows().find((row) => row.kind === 'gap')!
    const day = f.store.getAgendaRows().find((row) => row.kind === 'day' && row.content)!
    f.store.applyAgenda({ kind: 'select', key: gap.key })
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
    expect(f.snapshot().agenda?.revealed.size).toBe(0)
  })
  it('routes Cmd+E and Normal za to occurrence folds and gap reveal with no Tree changes', async () => {
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
    const gap = f.store.getAgendaRows().find((row) => row.kind === 'gap')!
    f.store.applyAgenda({ kind: 'select', key: gap.key })
    f.press('z')
    f.press('a')
    expect(f.snapshot().agenda?.revealed.size).toBe(3)
    f.press('e', { metaKey: true })
    expect(f.snapshot().agenda?.revealed.size).toBe(0)
    expect(f.snapshot().document).toBe(before.document)
    expect(f.snapshot().expansion).toBe(before.expansion)
    expect(f.saves).toHaveLength(0)
  })
  it('uses Tree context rows and row counts for viewport motions, preserving line-motion scroll', async () => {
    const f = await fixture()
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
    expect(f.snapshot().agenda?.selectedKey).toBe(`day:${dayNumberOf({ year: 2026, month: 10, day: 10 })}`)
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

  // @requirement PRODUCT.md §23.11
  describe('creating dated nodes from a day', () => {
    const october = (day: number): number => dayNumberOf({ year: 2026, month: 10, day })

    it('creates a node for the selected day with Normal o and enters Insert', async () => {
      const f = await fixture()
      const before = f.snapshot()
      f.press('o')
      const state = f.snapshot()
      const created = state.document.roots.at(-1)!
      expect(state.document.roots.slice(0, -1)).toEqual(before.document.roots)
      expect(created.text).toBe('2026-10-08 ')
      expect(state.agenda?.selectedKey).toBe(`node:${october(8)}:${created.id}`)
      expect(state.agenda?.activeOccurrence).toEqual({ nodeId: created.id, day: october(8) })
      expect(state.location).toEqual({ currentParentId: null, selectedNodeId: created.id })
      expect(state.focus).toMatchObject({ nodeId: created.id, cursor: 11 })
      expect(f.vim.mode).toBe('insert')
      f.store.undo()
      expect(f.snapshot().document).toBe(before.document)
    })
    it('creates a node for the preceding day with O and reveals it from a gap', async () => {
      const f = await fixture()
      f.press('O')
      expect(f.snapshot().document.roots.at(-1)!.text).toBe('2026-10-07 ')
      expect(f.vim.mode).toBe('insert')
      f.vim.mode = 'normal'
      f.store.undo()
      const fifteenth = f.store.getAgendaRows().find((row) => row.key === `day:${october(15)}`)!
      f.store.applyAgenda({ kind: 'select', key: fifteenth.key })
      expect(f.store.getAgendaRows().some((row) => row.key === `day:${october(14)}`)).toBe(false)
      f.press('O')
      const state = f.snapshot()
      expect(state.document.roots.at(-1)!.text).toBe('2026-10-14 ')
      expect(state.agenda?.revealed.has(october(14))).toBe(true)
      expect(state.agenda?.selectedKey).toBe(`node:${october(14)}:${state.document.roots.at(-1)!.id}`)
    })
    it('creates with Enter only in standard editing, and unfolds a collapsed day', async () => {
      const f = await fixture()
      const handler = createAgendaKeyDownHandler({ store: f.store })
      const day = f.store.getAgendaRows().find((row) => row.kind === 'day' && row.content)!
      f.store.applyAgenda({ kind: 'select', key: day.key })
      f.store.applyAgenda({ kind: 'toggle-fold', key: day.key })
      expect(f.snapshot().agenda?.collapsed.has(day.key)).toBe(true)
      handler({ key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>)
      const state = f.snapshot()
      expect(state.document.roots.at(-1)!.text).toBe('2026-10-15 ')
      expect(state.agenda?.collapsed.has(day.key)).toBe(false)
      expect(state.agenda?.selectedKey).toBe(`node:${october(15)}:${state.document.roots.at(-1)!.id}`)
    })
    it('does nothing on Vim Enter, counted or prefixed o, gaps, and real rows', async () => {
      const f = await fixture()
      const before = f.snapshot()
      f.press('Enter')
      f.press('2')
      f.press('o')
      f.press('g')
      f.press('o')
      f.press('o', { ctrlKey: true })
      f.press('Enter', { metaKey: true })
      const gap = f.store.getAgendaRows().find((row) => row.kind === 'gap')!
      f.store.applyAgenda({ kind: 'select', key: gap.key })
      f.press('o')
      f.press('O')
      const node = f.store.getAgendaRows().find((row) => row.kind === 'node')!
      f.store.applyAgenda({ kind: 'select', key: node.key })
      f.press('o')
      f.press('O')
      handlerEnter(f)
      expect(f.snapshot().document).toBe(before.document)
      expect(f.vim.mode).toBe('normal')
    })
    function handlerEnter(f: Awaited<ReturnType<typeof fixture>>): void {
      createAgendaKeyDownHandler({ store: f.store })({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent<HTMLElement>)
    }
    it('stays in Normal mode and leaves the document unchanged when creation is rejected', async () => {
      const f = await fixture()
      const before = f.snapshot()
      const create = vi.spyOn(f.store, 'createAgendaDayNode').mockReturnValue(false)
      f.press('o')
      expect(create).toHaveBeenCalledWith('selected')
      expect(f.vim.mode).toBe('normal')
      expect(f.snapshot().document).toBe(before.document)
    })
  })

  it('closes at origin and enters Tree only on real rows', async () => {
    const f = await fixture()
    f.press('.', { metaKey: true })
    expect(f.snapshot().agenda).toBeDefined()
    f.press('G')
    f.press('.', { metaKey: true })
    expect(f.snapshot().agenda).toBeUndefined()
    expect(f.snapshot().location.currentParentId).toBe('node')
    f.store.openAgenda()
    f.press('p', { metaKey: true })
    expect(f.snapshot().location.currentParentId).toBe('node')
    expect(f.snapshot().agenda).toBeUndefined()
  })
})
