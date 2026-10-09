// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import './test/setup'
import { createRealStoreHarness } from './test/real-store-harness'
import { AgendaView } from './AgendaView'
import type { EditorStore } from '../application/editor-store'
import { dayNumberOf } from '../domain/calendar-date'

afterEach(cleanup)

// @requirement PRODUCT.md §23.9
it('renders attachments on inactive direct matches and excludes contextual ancestors', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        {
          id: 'parent',
          text: '2026-10-20 Parent',
          children: [
            {
              id: 'child',
              text: '2026-10-14 Child 2026-10-20',
              children: [],
            },
          ],
        },
      ],
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const state = harness.snapshot()
  const { container } = render(
    <AgendaView
      store={harness.store}
      agenda={state.agenda!}
      document={state.document}
      dragFreeze={{ begin: vi.fn(), end: vi.fn() }}
      renderInput={() => <span className="test-editor" />}
      renderText={(node) => <a href="https://example.com">{node.text}</a>}
      renderAttachment={(node, editable) => <span data-attachment={node.id} data-editable={editable} />}
    />,
  )
  expect(container.querySelectorAll('[data-attachment="child"]')).toHaveLength(2)
  expect(container.querySelectorAll('[data-attachment="child"][data-editable="false"]')).toHaveLength(2)
  expect(container.querySelectorAll('.agenda-role-context [data-attachment]')).toHaveLength(0)
  expect(container.querySelectorAll('[data-attachment="parent"]')).toHaveLength(1)
  expect(container.querySelectorAll('.agenda-role-match a')).toHaveLength(2)
  expect(container.querySelectorAll('.agenda-role-context a')).toHaveLength(0)
})

function View({ store }: { store: EditorStore }): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  if (state.status !== 'ready' || state.agenda === undefined) return <div />
  return (
    <AgendaView
      store={store}
      agenda={state.agenda}
      document={state.document}
      dragFreeze={{ begin: vi.fn(), end: vi.fn() }}
    />
  )
}

// @requirement PRODUCT.md §23.6
it('bounds mounted rows, pins distant selection and preserves its DOM across a fold threshold', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: Array.from({ length: 600 }, (_, index) => ({
        id: `n${index}`,
        text: `2026-10-08 Node ${index}`,
        children: [],
      })),
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  expect(container.querySelectorAll('.agenda-row').length).toBeLessThan(100)
  expect(container.querySelectorAll('.agenda-list-spacer').length).toBe(2)
  const rows = harness.store.getAgendaRows()
  const distant = rows.find((row) => row.kind === 'node' && row.nodeId === 'n599')!
  act(() => harness.store.applyAgenda({ kind: 'select', key: distant.key }))
  const element = container.querySelector(`[data-agenda-key="${distant.key}"]`)!
  expect(element).toBe(document.activeElement)
  expect(element.classList.contains('agenda-row-pinned')).toBe(true)
  const day = rows.find((row) => row.kind === 'day' && row.content)!
  act(() => harness.store.applyAgenda({ kind: 'toggle-fold', key: day.key }))
  expect(container.querySelectorAll('.agenda-list-spacer').length).toBe(0)
  expect(container.querySelector(`[data-agenda-key="${day.key}"]`)).toBe(document.activeElement)
  act(() => harness.store.applyAgenda({ kind: 'toggle-fold', key: day.key }))
  expect(container.querySelectorAll('.agenda-row').length).toBeLessThan(100)
  expect(container.querySelector(`[data-agenda-key="${day.key}"]`)).toBe(document.activeElement)
  expect(harness.saves).toHaveLength(0)
})

// @requirement PRODUCT.md §23.7
it('marks only other-day occurrences of the active node as live mirrors', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        { id: 'multi', text: '2026-10-14 Multi 2026-10-20', children: [] },
        { id: 'single', text: '2026-10-14 Single', children: [] },
      ],
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  const day14 = dayNumberOf({ year: 2026, month: 10, day: 14 })
  const day20 = dayNumberOf({ year: 2026, month: 10, day: 20 })
  const isMirror = (key: string): boolean =>
    container.querySelector(`[data-agenda-key="${key}"]`)!.classList.contains('agenda-mirror')
  expect(container.querySelectorAll('.agenda-mirror')).toHaveLength(0)
  act(() => harness.store.applyAgenda({ kind: 'select', key: `node:${day14}:multi` }))
  expect(container.querySelectorAll('.agenda-mirror')).toHaveLength(1)
  expect(isMirror(`node:${day20}:multi`)).toBe(true)
  act(() => harness.store.applyAgenda({ kind: 'select', key: `node:${day20}:multi` }))
  expect(isMirror(`node:${day14}:multi`)).toBe(true)
  expect(isMirror(`node:${day20}:multi`)).toBe(false)
  act(() => harness.store.applyAgenda({ kind: 'select', key: `node:${day14}:single` }))
  expect(container.querySelectorAll('.agenda-mirror')).toHaveLength(0)
})

// @requirement PRODUCT.md §23.7
it('keeps the active occurrence at its viewport position when a document change moves it', async () => {
  const harness = await createRealStoreHarness({
    document: { roots: [{ id: 'multi', text: '2026-10-14 Multi 2026-10-20', children: [] }] },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  const day14 = dayNumberOf({ year: 2026, month: 10, day: 14 })
  const day20 = dayNumberOf({ year: 2026, month: 10, day: 20 })
  act(() => harness.store.applyAgenda({ kind: 'select', key: `node:${day14}:multi` }))
  const tops = new Map([
    [`node:${day14}:multi`, 100],
    [`node:${day20}:multi`, 340],
  ])
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const top = tops.get(this.dataset.agendaKey ?? '') ?? 0
    return { top, bottom: top + 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: top, toJSON: () => ({}) }
  })
  const scroll = vi.spyOn(globalThis, 'scrollBy').mockImplementation(() => undefined)
  try {
    act(() => harness.store.editText('multi', 'Multi 2026-10-20'))
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll).toHaveBeenCalledWith(0, 240)
    expect(container.querySelector(`[data-agenda-key="node:${day20}:multi"]`)).not.toBeNull()
  } finally {
    rect.mockRestore()
    scroll.mockRestore()
  }
})
