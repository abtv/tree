// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import './test/setup'
import { createRealStoreHarness } from './test/real-store-harness'
import { AgendaView } from './AgendaView'
import type { EditorStore } from '../application/editor-store'
import { dayNumberOf } from '../domain/calendar-date'
import { HOLD_ACTIVATION_MS } from './node-drag'

const scrollBy = vi.hoisted(() => vi.fn())
vi.mock('./scroll-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scroll-viewport')>()),
  scrollViewportBy: scrollBy,
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const ROW = 20
const day = (month: number, date: number): number => dayNumberOf({ year: 2026, month, day: date })

function dragFreeze() {
  return { begin: vi.fn<(nodeId: string, pointerId: number) => void>(), end: vi.fn<(pointerId?: number) => void>() }
}

function View({
  store,
  freeze,
  locked,
}: {
  store: EditorStore
  freeze: ReturnType<typeof dragFreeze>
  locked?: boolean
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  if (state.status !== 'ready' || state.agenda === undefined) return <div />
  return (
    <AgendaView
      store={store}
      agenda={state.agenda}
      document={state.document}
      dragFreeze={freeze}
      locked={locked ?? false}
    />
  )
}

async function setup(locked = false) {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        {
          id: 'context',
          text: 'Context',
          children: [
            { id: 'first', text: '2026-10-14 Prepare 2026-10-20', children: [] },
            { id: 'second', text: '2026-10-15 Review', children: [] },
          ],
        },
      ],
    },
    services: { today: () => day(10, 8) },
  })
  harness.store.openAgenda()
  const freeze = dragFreeze()
  const view = render(<View store={harness.store} freeze={freeze} locked={locked} />)
  const rows = harness.store.getAgendaRows()
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = rows.findIndex((row) => row.key === this.dataset.agendaKey)
    const top = index < 0 ? 0 : index * ROW
    return {
      top,
      bottom: top + ROW,
      height: ROW,
      left: 0,
      right: 600,
      width: 600,
      x: 0,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
  })
  const element = (key: string): HTMLElement => view.container.querySelector<HTMLElement>(`[data-agenda-key="${key}"]`)!
  const centerOf = (key: string): number => rows.findIndex((row) => row.key === key) * ROW + ROW / 2
  return { ...harness, freeze, rows, element, centerOf, container: view.container }
}

function down(target: Element, clientY: number, init: Partial<PointerEventInit> = {}): void {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    button: 0,
    isPrimary: true,
    pointerType: 'mouse',
    clientX: 100,
    clientY,
    ...init,
  })
}
const move = (target: Element, clientY: number): boolean =>
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY })
const up = (target: Element, clientY: number): boolean =>
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY })
const hold = (): void => void act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))

const firstKey = `node:${day(10, 14)}:first`
const textOf = (harness: Awaited<ReturnType<typeof setup>>, id: string): string => {
  const snapshot = harness.snapshot()
  return snapshot.document.roots[0]!.children.find((node) => node.id === id)!.text
}

// @requirement PRODUCT.md §23.12
it('drags a direct match onto another day after the hold and changes only that date', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  expect(source).not.toHaveClass('agenda-row-dragging')
  hold()
  expect(source).toHaveClass('agenda-row-dragging')
  expect(document.body).toHaveClass('node-drag-active')
  expect(ctx.freeze.begin).toHaveBeenCalledWith('first', 1)

  const header = `day:${day(10, 15)}`
  move(source, ctx.centerOf(header))
  expect(ctx.element(header)).toHaveClass('agenda-row-drop-on')
  expect(document.body).not.toHaveClass('node-drag-invalid')
  up(source, ctx.centerOf(header))

  expect(textOf(ctx, 'first')).toBe('2026-10-15 Prepare 2026-10-20')
  expect(textOf(ctx, 'second')).toBe('2026-10-15 Review')
  expect(ctx.snapshot().agenda!.activeOccurrence).toEqual({ nodeId: 'first', day: day(10, 15) })
  expect(document.body).not.toHaveClass('node-drag-active')
  expect(ctx.container.querySelector('.agenda-row-dragging, .agenda-row-drop-on')).toBeNull()
  expect(ctx.freeze.end).toHaveBeenCalledWith(1)
  act(() => ctx.store.undo())
  expect(textOf(ctx, 'first')).toBe('2026-10-14 Prepare 2026-10-20')
})

// @requirement PRODUCT.md §23.12
it('drops on any row of the target day, including a node row', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  const target = `node:${day(10, 15)}:second`
  move(source, ctx.centerOf(target))
  expect(ctx.element(`day:${day(10, 15)}`)).toHaveClass('agenda-row-drop-on')
  up(source, ctx.centerOf(target))
  expect(textOf(ctx, 'first')).toBe('2026-10-15 Prepare 2026-10-20')
})

// @requirement PRODUCT.md §23.12
it('changes nothing when dropped on its own day, and shows no outline there', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const before = ctx.snapshot().document
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  const header = `day:${day(10, 14)}`
  move(source, ctx.centerOf(header))
  expect(ctx.container.querySelector('.agenda-row-drop-on')).toBeNull()
  expect(document.body).not.toHaveClass('node-drag-invalid')
  up(source, ctx.centerOf(header))
  expect(ctx.snapshot().document).toBe(before)
})

// @requirement PRODUCT.md §23.12
it('marks a gap as an invalid drop and changes nothing there', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const before = ctx.snapshot().document
  const gap = ctx.rows.find((row) => row.kind === 'gap')!
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  move(source, ctx.centerOf(gap.key))
  expect(document.body).toHaveClass('node-drag-invalid')
  expect(ctx.container.querySelector('.agenda-row-drop-on')).toBeNull()
  up(source, ctx.centerOf(gap.key))
  expect(ctx.snapshot().document).toBe(before)
  expect(document.body).not.toHaveClass('node-drag-invalid')
})

// @requirement PRODUCT.md §23.12
it('never drags contextual ancestors, day headers, gaps, or from the chevron', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const context = `node:${day(10, 14)}:context`
  const gap = ctx.rows.find((row) => row.kind === 'gap')!
  for (const key of [context, `day:${day(10, 14)}`, gap.key]) down(ctx.element(key), ctx.centerOf(key))
  down(ctx.element(firstKey).querySelector('.node-enter-control')!, ctx.centerOf(firstKey))
  hold()
  act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))
  expect(ctx.container.querySelector('.agenda-row-dragging')).toBeNull()
  expect(document.body).not.toHaveClass('node-drag-active')
})

// @requirement PRODUCT.md §23.12
it('ignores secondary buttons and touch pointers', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey), { button: 2 })
  down(source, ctx.centerOf(firstKey), { isPrimary: false })
  down(source, ctx.centerOf(firstKey), { pointerType: 'touch' })
  hold()
  expect(ctx.container.querySelector('.agenda-row-dragging')).toBeNull()
})

// @requirement PRODUCT.md §23.12
it('does not start before the hold elapses and a quick release moves nothing', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const before = ctx.snapshot().document
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS - 1))
  expect(source).not.toHaveClass('agenda-row-dragging')
  up(source, ctx.centerOf(firstKey))
  act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
  expect(source).not.toHaveClass('agenda-row-dragging')
  expect(ctx.snapshot().document).toBe(before)
})

// @requirement PRODUCT.md §23.12
it('cancels when the pointer leaves the source row or moves too far before the hold', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  move(source, ctx.centerOf(firstKey) + ROW * 3)
  hold()
  expect(source).not.toHaveClass('agenda-row-dragging')
})

// @requirement PRODUCT.md §23.12
it('cancels a pending hold when the held pointer leaves the list, but not a reset hover', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  const list = ctx.container.querySelector('.agenda-list')!
  down(source, ctx.centerOf(firstKey))
  fireEvent.pointerLeave(list, { pointerId: 1, buttons: 0 })
  hold()
  expect(source).toHaveClass('agenda-row-dragging')
  up(source, ctx.centerOf(firstKey))
  down(source, ctx.centerOf(firstKey))
  fireEvent.pointerLeave(list, { pointerId: 1, buttons: 1 })
  hold()
  expect(source).not.toHaveClass('agenda-row-dragging')
})

// @requirement PRODUCT.md §23.12
it('does not scroll-anchor to the source row after dropping the active occurrence', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  act(() => ctx.store.applyAgenda({ kind: 'select', key: firstKey }))
  scrollBy.mockClear()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  const header = `day:${day(10, 15)}`
  move(source, ctx.centerOf(header))
  up(source, ctx.centerOf(header))
  expect(textOf(ctx, 'first')).toBe('2026-10-15 Prepare 2026-10-20')
  expect(scrollBy).not.toHaveBeenCalled()
})

// @requirement PRODUCT.md §23.12
it('cancels on Escape without moving or saving', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const before = ctx.snapshot().document
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  move(source, ctx.centerOf(`day:${day(10, 15)}`))
  act(() => void fireEvent.keyDown(globalThis as unknown as Window, { key: 'Escape' }))
  expect(source).not.toHaveClass('agenda-row-dragging')
  expect(document.body).not.toHaveClass('node-drag-active')
  up(source, ctx.centerOf(`day:${day(10, 15)}`))
  expect(ctx.snapshot().document).toBe(before)
})

// @requirement PRODUCT.md §23.12
it('follows and drops a pointer that leaves the list when native capture is unavailable', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  const header = `day:${day(10, 15)}`
  fireEvent.pointerMove(document.body, { pointerId: 1, clientX: 100, clientY: ctx.centerOf(header) })
  expect(ctx.element(header)).toHaveClass('agenda-row-drop-on')
  fireEvent.pointerMove(document.body, { pointerId: 2, clientX: 100, clientY: ctx.centerOf(`day:${day(10, 14)}`) })
  expect(ctx.element(header)).toHaveClass('agenda-row-drop-on')
  fireEvent.pointerUp(document.body, { pointerId: 2, clientX: 100, clientY: ctx.centerOf(header) })
  expect(source).toHaveClass('agenda-row-dragging')
  fireEvent.pointerUp(document.body, { pointerId: 1, clientX: 100, clientY: ctx.centerOf(header) })
  expect(textOf(ctx, 'first')).toBe('2026-10-15 Prepare 2026-10-20')
  expect(document.body).not.toHaveClass('node-drag-active')
})

// @requirement PRODUCT.md §23.12
it.each(['pointercancel on the list', 'pointercancel outside', 'window blur', 'lost pointer capture'])(
  'cancels without moving on %s',
  async (ending) => {
    vi.useFakeTimers()
    const ctx = await setup()
    const before = ctx.snapshot().document
    const source = ctx.element(firstKey)
    down(source, ctx.centerOf(firstKey))
    hold()
    move(source, ctx.centerOf(`day:${day(10, 15)}`))
    act(() => {
      if (ending === 'pointercancel on the list') fireEvent.pointerCancel(source, { pointerId: 1 })
      else if (ending === 'pointercancel outside') fireEvent.pointerCancel(document.body, { pointerId: 1 })
      else if (ending === 'window blur') fireEvent.blur(globalThis as unknown as Window)
      else fireEvent.lostPointerCapture(source, { pointerId: 1 })
    })
    expect(source).not.toHaveClass('agenda-row-dragging')
    expect(document.body).not.toHaveClass('node-drag-active')
    up(source, ctx.centerOf(`day:${day(10, 15)}`))
    expect(ctx.snapshot().document).toBe(before)
  },
)

// @requirement PRODUCT.md §23.12
it('keeps tracking the drop target while the list scrolls under a stationary pointer', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  const header = `day:${day(10, 15)}`
  move(source, ctx.centerOf(header))
  expect(ctx.element(header)).toHaveClass('agenda-row-drop-on')
  act(() => void fireEvent.scroll(globalThis as unknown as Window))
  expect(ctx.element(header)).toHaveClass('agenda-row-drop-on')
  up(source, ctx.centerOf(header))
})

// @requirement PRODUCT.md §23.12
it('does not drag while persistence is locked', async () => {
  vi.useFakeTimers()
  const ctx = await setup(true)
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  expect(source).not.toHaveClass('agenda-row-dragging')
})

// @requirement PRODUCT.md §23.12
it('suppresses the click that follows a completed drag', async () => {
  vi.useFakeTimers()
  const ctx = await setup()
  const source = ctx.element(firstKey)
  down(source, ctx.centerOf(firstKey))
  hold()
  const header = ctx.element(`day:${day(10, 15)}`)
  move(source, ctx.centerOf(`day:${day(10, 15)}`))
  up(source, ctx.centerOf(`day:${day(10, 15)}`))
  const selected = ctx.snapshot().agenda!.selectedKey
  fireEvent.click(header)
  expect(ctx.snapshot().agenda!.selectedKey).toBe(selected)
})
