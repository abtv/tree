// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { Profiler, StrictMode, useSyncExternalStore } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import './test/setup'
import { createRealStoreHarness } from './test/real-store-harness'
import { AgendaView } from './AgendaView'
import type { EditorStore } from '../application/editor-store'
import { dayNumberOf } from '../domain/calendar-date'
import { AgendaSearchText } from './AgendaSearchText'
import * as revealModule from './viewport-reveal'

afterEach(cleanup)

// @requirement PRODUCT.md §23.2
// @requirement PRODUCT.md §23.4
it('groups adjacent siblings by path and lets navigation stop on a read-only path', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        {
          id: 'work',
          text: 'Work',
          struckThrough: true,
          children: [
            { id: 'a', text: '2026-10-08 A', struckThrough: true, children: [] },
            {
              id: 'b',
              text: '2026-10-08 B',
              struckThrough: true,
              children: [{ id: 'nested', text: '2026-10-08 Nested', struckThrough: true, children: [] }],
            },
            { id: 'c', text: '2026-10-08 C', struckThrough: true, children: [] },
          ],
        },
        { id: 'root', text: '2026-10-08 Root', children: [] },
      ],
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const before = harness.snapshot().document
  const { container } = render(<View store={harness.store} />)
  const paths = container.querySelectorAll<HTMLElement>('.agenda-row-path')

  expect([...paths].map((path) => path.textContent)).toEqual(['Work', 'Work › 2026-10-08 B', 'Work'])
  expect([...paths[1]!.querySelectorAll('.node-text-struck')].map((part) => part.textContent)).toEqual([
    'Work',
    '2026-10-08 B',
  ])
  expect([...container.querySelectorAll('.agenda-row-node')].map((row) => row.getAttribute('data-node-id'))).toEqual([
    'a',
    'b',
    'nested',
    'c',
    'root',
  ])

  fireEvent.keyDown(container.querySelector('.agenda-today')!, { key: 'ArrowDown' })

  expect(paths[0]).toHaveFocus()
  expect(paths[0]!.querySelector('input,textarea,[contenteditable],.line-number')).toBeNull()

  fireEvent.keyDown(paths[0]!, { key: 'A' })
  fireEvent.keyDown(paths[0]!, { key: 'Backspace' })
  fireEvent.keyDown(paths[0]!, { key: 'Enter' })
  fireEvent.keyDown(paths[0]!, { key: 'v', metaKey: true })

  expect(harness.snapshot().document).toBe(before)
  expect(paths[0]).toHaveFocus()

  fireEvent.keyDown(paths[0]!, { key: 'a', metaKey: true })
  fireEvent.keyDown(paths[0]!, { key: 'c', metaKey: true })

  expect(harness.clipboard.content).toEqual({ kind: 'text', text: 'Work' })

  fireEvent.keyDown(paths[0]!, { key: 'ArrowDown' })

  expect(container.querySelector('[data-node-id="a"]')).toHaveFocus()

  fireEvent.click(paths[1]!)

  expect(paths[1]).toHaveFocus()

  act(() => harness.store.applyAgenda({ kind: 'fold', key: paths[1]!.dataset.agendaKey!, operation: 'close-all' }))

  expect(container.querySelector('.agenda-row-path')).toBeNull()
  expect(container.querySelector('.agenda-today')).toHaveFocus()
})

// @requirement PRODUCT.md §23.2
it('refreshes path labels after editing a dated ancestor without changing grouped row identities', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        {
          id: 'parent',
          text: '2026-10-08 Parent',
          children: [{ id: 'child', text: '2026-10-08 Child', children: [] }],
        },
      ],
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  const rows = harness.store.getAgendaRows()
  const parent = rows.find((row) => row.kind === 'node' && row.nodeId === 'parent')!

  act(() => {
    harness.store.applyAgenda({ kind: 'select', key: parent.key })
    harness.store.editText('parent', '2026-10-08 Renamed')
  })

  expect(harness.store.getAgendaRows()).toBe(rows)
  expect(container.querySelector('.agenda-path')).toHaveTextContent('2026-10-08 Renamed')
})

// @requirement PRODUCT.md §22.1
// @requirement PRODUCT.md §23.6
it('windows path groups and retains a selected offscreen path without an editor or line number', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: Array.from({ length: 200 }, (_, index) => ({
        id: `parent${index}`,
        text: `Project ${index}`,
        children: [{ id: `task${index}`, text: `2026-10-08 Task ${index}`, children: [] }],
      })),
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  const paths = harness.store.getAgendaRows().filter((row) => row.kind === 'path')

  act(() => harness.store.applyAgenda({ kind: 'select', key: paths.at(-1)!.key }))

  const selected = container.querySelector('.agenda-row-path[aria-selected="true"]')!
  expect(paths).toHaveLength(200)
  expect(container.querySelectorAll('.agenda-row').length).toBeLessThan(100)
  expect(selected).toHaveTextContent('Project 199')
  expect(selected).toHaveFocus()
  expect(selected.closest('.agenda-entry')).toHaveClass('agenda-row-pinned')
  expect(selected.querySelector('input,textarea,[contenteditable],.line-number')).toBeNull()
})

// @requirement PRODUCT.md §22.1
it('measures attached entries after all sibling editors project their content', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: Array.from({ length: 8 }, (_, index) => ({
        id: `n${index}`,
        text: `2026-10-08 Wrapped entry ${index}`,
        children: [],
      })),
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const state = harness.snapshot()
  const projectedCounts: number[] = []
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.matches('.agenda-entry-node'))
      projectedCounts.push(document.querySelectorAll('.test-editor[data-projected]').length)
    return { top: 0, bottom: 25, left: 0, right: 0, width: 0, height: 25, x: 0, y: 0, toJSON: () => ({}) }
  })
  try {
    render(
      <AgendaView
        store={harness.store}
        agenda={state.agenda!}
        document={state.document}
        renderInput={(node) => (
          <div
            className="test-editor"
            ref={(element) => {
              if (element !== null) {
                element.textContent = node.text
                element.dataset.projected = 'true'
              }
            }}
          />
        )}
      />,
    )

    expect(projectedCounts).toHaveLength(8)
    expect(projectedCounts).toEqual(Array(8).fill(8))
  } finally {
    rect.mockRestore()
  }
})

// @requirement PRODUCT.md §22.1
// @requirement PRODUCT.md §23.6
it.each([false, true])('settles late row measurements and releases detached rows (StrictMode: %s)', async (strict) => {
  const day = dayNumberOf({ year: 2026, month: 10, day: 8 })
  const harness = await createRealStoreHarness({
    document: {
      roots: Array.from({ length: 200 }, (_, index) => ({
        id: `n${index}`,
        text: '2026-10-08 Task',
        children: [],
      })),
    },
    services: { today: () => day },
  })
  harness.store.openAgenda()
  harness.store.applyAgenda({ kind: 'select', key: `node:${day}:n0` })
  const rows = harness.store.getAgendaRows()
  const estimatedHeight = rows.length * 25
  const observed = new Set<Element>()
  // Register targets without delivering notifications: late mounts must be measured before
  // ResizeObserver's first delivery, not repaired by it after an incomplete layout commit.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(element: Element): void {
        observed.add(element)
      }
      unobserve(element: Element): void {
        observed.delete(element)
      }
      disconnect(): void {
        observed.clear()
      }
    },
  )
  vi.stubGlobal('innerHeight', 400)
  vi.stubGlobal('innerWidth', 800)
  let scrollTop = 0
  let lateHeight = 80
  const measured: Element[] = []
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.matches('.agenda-list')) return new DOMRect(0, -scrollTop, 800, estimatedHeight)
    if (this.matches('.agenda-entry')) measured.push(this)
    return new DOMRect(0, 0, 800, this.querySelector('[data-node-id="n100"]') === null ? 25 : lateHeight)
  })
  const scroll = vi.spyOn(globalThis, 'scrollBy').mockImplementation((_x, delta) => {
    scrollTop += delta
  })
  const createReveal = revealModule.createViewportReveal
  const factory = vi.spyOn(revealModule, 'createViewportReveal').mockImplementation(() => ({
    ...createReveal(),
    begin: vi.fn(),
    beginRegion: vi.fn(),
  }))
  const committed = vi.fn()
  const view = () => {
    const content = (
      <Profiler id="agenda" onRender={committed}>
        <View store={harness.store} />
      </Profiler>
    )
    return strict ? <StrictMode>{content}</StrictMode> : content
  }
  try {
    const result = render(view())
    const list = result.container.querySelector<HTMLElement>('.agenda-list')!
    const selected = result.container.querySelector('[data-node-id="n0"]')!

    expect(list.style.height).toBe(`${estimatedHeight}px`)
    expect(result.container.querySelector('[data-node-id="n100"]')).toBeNull()

    committed.mockClear()
    scrollTop = 2500
    fireEvent.scroll(window)

    const late = result.container.querySelector('[data-node-id="n100"]')!
    expect(late).not.toBeNull()
    expect(list.style.height).toBe(`${estimatedHeight + 55}px`)
    const lateEntry = late.closest('.agenda-entry')!
    expect(measured).toContain(lateEntry)
    expect(harness.store.getAgendaRows()).toBe(rows)
    expect(committed.mock.calls.length).toBeLessThanOrEqual(4)
    expect(result.container.querySelectorAll('.agenda-row').length).toBeLessThan(100)
    expect(result.container.querySelector('[data-node-id="n0"]')).toBe(selected)
    expect(selected).toHaveFocus()
    expect(selected.closest('.agenda-entry')).toHaveClass('agenda-row-pinned')
    expect([...observed].every((element) => element.isConnected)).toBe(true)

    committed.mockClear()
    measured.length = 0
    result.rerender(view())
    result.rerender(view())
    result.rerender(view())

    expect(committed).toHaveBeenCalledTimes(3)
    expect(measured).toHaveLength(0)
    expect(scrollTop).toBe(2500)

    scrollTop = 0
    fireEvent.scroll(window)

    expect(late.isConnected).toBe(false)
    expect(observed.has(lateEntry)).toBe(false)

    lateHeight = 100
    measured.length = 0
    scrollTop = 2500
    fireEvent.scroll(window)

    expect(list.style.height).toBe(`${estimatedHeight + 75}px`)
    expect(measured).not.toContain(lateEntry)
    expect([...observed].every((element) => element.isConnected)).toBe(true)

    lateHeight = 40
    vi.stubGlobal('innerWidth', 1000)
    fireEvent.resize(window)

    expect(list.style.height).toBe(`${estimatedHeight + 15}px`)
    expect(selected).toHaveFocus()
    expect(scrollTop).toBe(2500)
    expect(result.container.querySelectorAll('.agenda-row').length).toBeLessThan(100)

    measured.length = 0
    fireEvent.resize(window)

    expect(measured).toHaveLength(0)

    result.unmount()

    expect(observed.size).toBe(0)
  } finally {
    cleanup()
    factory.mockRestore()
    bounds.mockRestore()
    scroll.mockRestore()
    vi.unstubAllGlobals()
  }
})

// @requirement PRODUCT.md §23.15
it('settles an unchanged focused heading even though its inline ref reattaches on each commit', async () => {
  const day = dayNumberOf({ year: 2026, month: 10, day: 8 })
  const harness = await createRealStoreHarness({
    document: { roots: [{ id: 'n0', text: '2026-10-08 Task', children: [] }] },
    services: { today: () => day },
  })
  harness.store.openAgenda()
  harness.store.applyAgenda({ kind: 'focus-day', key: `day:${day}`, scrollTop: 0 })
  vi.stubGlobal('ResizeObserver', undefined)
  const headingReads = vi.fn()
  const scroll = vi.spyOn(globalThis, 'scrollBy').mockImplementation(() => undefined)
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.matches('.agenda-focused-heading')) {
      headingReads()
      return new DOMRect(0, 0, 800, 50)
    }
    return new DOMRect(0, 0, 800, 25)
  })
  const committed = vi.fn()
  const view = () => (
    <StrictMode>
      <Profiler id="agenda" onRender={committed}>
        <View store={harness.store} />
      </Profiler>
    </StrictMode>
  )
  try {
    const result = render(view())
    const heading = result.container.querySelector('.agenda-focused-heading')!

    expect(heading).toHaveFocus()
    expect(committed.mock.calls.length).toBeLessThanOrEqual(4)

    committed.mockClear()
    headingReads.mockClear()
    result.rerender(view())
    result.rerender(view())
    result.rerender(view())

    expect(headingReads).toHaveBeenCalledTimes(3)
    expect(committed).toHaveBeenCalledTimes(3)
    expect(heading).toHaveFocus()
  } finally {
    cleanup()
    bounds.mockRestore()
    scroll.mockRestore()
    vi.unstubAllGlobals()
  }
})

// @requirement PRODUCT.md §23.1
it('restores the complete-day opening intent after StrictMode mount-effect cleanup', async () => {
  const harness = await createRealStoreHarness({
    document: { roots: [{ id: 'today', text: '2026-10-08 Today task', children: [] }] },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const createReveal = revealModule.createViewportReveal
  const regions: ReturnType<typeof vi.fn>[] = []
  const factory = vi.spyOn(revealModule, 'createViewportReveal').mockImplementation(() => {
    const reveal = createReveal()
    regions.push(vi.spyOn(reveal, 'beginRegion'))
    return reveal
  })
  try {
    const view = render(
      <StrictMode>
        <View store={harness.store} />
      </StrictMode>,
    )

    // StrictMode allocates the memo twice, then replays effects for the retained owner.
    expect(regions.map((begin) => begin.mock.calls.length).filter(Boolean)).toEqual([2])
    expect(view.container.querySelector('.agenda-today')).toHaveFocus()

    view.unmount()
  } finally {
    factory.mockRestore()
  }
})

// @requirement PRODUCT.md §23.9
it('renders attachments on inactive direct matches and excludes contextual ancestors', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: [
        {
          id: 'parent',
          text: '2026-10-10 Parent',
          children: [
            {
              id: 'child',
              text: '2026-10-09 Child 2026-10-10',
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
      renderInput={() => <span className="test-editor" />}
      renderText={(node, day, marks, context) => (
        <AgendaSearchText
          node={{ ...node, links: [{ start: 0, end: node.text.length, url: 'https://example.com' }] }}
          day={day}
          marks={marks}
          context={context}
          query=""
          onClick={() => undefined}
        />
      )}
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
  return <AgendaView store={store} agenda={state.agenda} document={state.document} />
}

// @requirement PRODUCT.md §23.6
it('applies measured growth and shrink once in StrictMode while retaining the selected row', async () => {
  const day = dayNumberOf({ year: 2026, month: 10, day: 8 })
  const harness = await createRealStoreHarness({
    document: {
      roots: Array.from({ length: 200 }, (_, index) => ({
        id: `n${index}`,
        text: '2026-10-08 Task',
        children: [],
      })),
    },
    services: { today: () => day },
  })
  harness.store.openAgenda()
  harness.store.applyAgenda({ kind: 'select', key: `node:${day}:n20` })
  let resize: ResizeObserverCallback | undefined
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  let scrollTop = 500
  let height = 25
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.classList.contains('agenda-list')) return new DOMRect(0, -scrollTop, 600, 5000)
    return new DOMRect(
      0,
      0,
      600,
      this.matches('.agenda-entry') && this.querySelector('[data-node-id="n8"]') !== null ? height : 25,
    )
  })
  const scroll = vi.spyOn(globalThis, 'scrollBy').mockImplementation((_x, delta) => {
    scrollTop += delta
  })
  const createReveal = revealModule.createViewportReveal
  const factory = vi.spyOn(revealModule, 'createViewportReveal').mockImplementation(() => ({
    ...createReveal(),
    begin: vi.fn(),
    beginRegion: vi.fn(),
  }))
  try {
    const { container } = render(
      <StrictMode>
        <View store={harness.store} />
      </StrictMode>,
    )
    const selected = container.querySelector('[data-node-id="n20"]')!
    const entry = container.querySelector('[data-node-id="n8"]')!.closest('.agenda-entry')!
    const notify = () => act(() => resize!([{ target: entry } as ResizeObserverEntry], {} as ResizeObserver))

    height = 80
    notify()
    notify()

    expect(scroll.mock.calls).toEqual([[0, 55]])
    expect(scrollTop).toBe(555)
    expect(container.querySelector('[data-node-id="n20"]')).toBe(selected)
    expect(selected).toHaveFocus()

    height = 25
    notify()

    expect(scroll.mock.calls).toEqual([
      [0, 55],
      [0, -55],
    ])
    expect(scrollTop).toBe(500)
  } finally {
    cleanup()
    factory.mockRestore()
    bounds.mockRestore()
    scroll.mockRestore()
    vi.unstubAllGlobals()
  }
})

// @requirement PRODUCT.md §23.6
it('bounds mounted rows, pins distant selection and preserves its DOM across a fold threshold', async () => {
  const harness = await createRealStoreHarness({
    document: {
      roots: Array.from({ length: 200 }, (_, index) => ({
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

  const rows = harness.store.getAgendaRows()
  const distant = rows.find((row) => row.kind === 'node' && row.nodeId === 'n199')!

  act(() => harness.store.applyAgenda({ kind: 'select', key: distant.key }))
  const element = container.querySelector(`[data-agenda-key="${distant.key}"]`)!

  expect(element).toBe(document.activeElement)
  expect(element.closest('.agenda-entry')!.classList.contains('agenda-row-pinned')).toBe(true)

  const day = rows.find((row) => row.kind === 'day' && row.content)!

  act(() => harness.store.applyAgenda({ kind: 'toggle-fold', key: day.key }))

  expect(container.querySelectorAll('.agenda-row').length).toBe(harness.store.getAgendaRows().length)
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
        { id: 'multi', text: '2026-10-09 Multi 2026-10-10', children: [] },
        { id: 'single', text: '2026-10-09 Single', children: [] },
      ],
    },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })

  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  const day14 = dayNumberOf({ year: 2026, month: 10, day: 9 })
  const day20 = dayNumberOf({ year: 2026, month: 10, day: 10 })
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
    document: { roots: [{ id: 'multi', text: '2026-10-09 Multi 2026-10-10', children: [] }] },
    services: { today: () => dayNumberOf({ year: 2026, month: 10, day: 8 }) },
  })
  harness.store.openAgenda()
  const { container } = render(<View store={harness.store} />)
  const day14 = dayNumberOf({ year: 2026, month: 10, day: 9 })
  const day20 = dayNumberOf({ year: 2026, month: 10, day: 10 })
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
    act(() => harness.store.editText('multi', 'Multi 2026-10-10'))

    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll).toHaveBeenCalledWith(0, 240)
    expect(container.querySelector(`[data-agenda-key="node:${day20}:multi"]`)).not.toBeNull()
  } finally {
    rect.mockRestore()
    scroll.mockRestore()
  }
})
