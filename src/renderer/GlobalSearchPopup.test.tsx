// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { GlobalSearchPopup } from './GlobalSearchPopup'
import { createEditorStoreDouble } from './test/editor-store-double'
import { APPLE_SHORTCUTS } from './shortcut-profile'
import { RecentNodes, type RecentNode } from '../application/recent-nodes'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('retains empty feedback and shows only one delayed pending label', () => {
  vi.useFakeTimers()
  const { store } = setup(true)
  let publish: (results: readonly RecentNode[]) => void = () => undefined
  vi.mocked(store.searchNodes).mockImplementation((_query, callback) => {
    publish = callback
    return vi.fn()
  })
  const input = screen.getByRole('searchbox')

  fireEvent.change(input, { target: { value: 'x' } })
  act(() => vi.advanceTimersByTime(199))

  expect(screen.getByText('No recent nodes')).toBeInTheDocument()
  expect(screen.queryByText('Searching…')).toBeNull()
  expect(screen.getByText('↑ ↓ select · Enter open · Esc close')).toBeInTheDocument()

  act(() => vi.advanceTimersByTime(1))

  expect(screen.getAllByText('Searching…')).toHaveLength(1)
  expect(screen.getByText('No recent nodes')).toBeInTheDocument()

  act(() => publish([]))

  expect(screen.getByText('No results')).toBeInTheDocument()
  expect(screen.queryByText('Searching…')).toBeNull()

  fireEvent.change(input, { target: { value: 'xy' } })
  act(() => vi.advanceTimersByTime(100))

  expect(screen.getByText('No results')).toBeInTheDocument()
  expect(screen.queryByText('Searching…')).toBeNull()

  act(() => publish([{ id: 'found', text: 'Next result', path: null }]))
  act(() => vi.advanceTimersByTime(300))

  expect(screen.getByRole('option')).toHaveTextContent('Next result')
  expect(screen.queryByText('Searching…')).toBeNull()
})

it('cancels pending feedback on clear, close and reopen', () => {
  vi.useFakeTimers()
  const { store } = setup()
  vi.mocked(store.searchNodes).mockImplementation(() => vi.fn())
  const input = screen.getByRole('searchbox')

  fireEvent.change(input, { target: { value: 'needle' } })
  act(() => vi.advanceTimersByTime(100))
  fireEvent.change(input, { target: { value: '' } })
  act(() => vi.advanceTimersByTime(300))

  expect(screen.queryByText('Searching…')).toBeNull()
  expect(screen.getAllByRole('option')).toHaveLength(8)

  fireEvent.change(input, { target: { value: 'again' } })
  fireEvent.keyDown(input, { key: 'Escape' })

  expect(screen.queryByRole('dialog')).toBeNull()
  act(() => vi.advanceTimersByTime(300))

  fireEvent.keyDown(document, { key: ';', metaKey: true })
  act(() => vi.advanceTimersByTime(300))

  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.queryByText('Searching…')).toBeNull()
})

// @requirement PRODUCT.md §20.14
it('retains rows during refinement without allowing stale activation, then replaces them together', () => {
  const { store } = setup()
  let publish: (results: readonly RecentNode[]) => void = () => undefined
  vi.mocked(store.searchNodes).mockImplementation((_query, callback) => {
    publish = callback
    return vi.fn()
  })
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'n' } })
  act(() => publish([{ id: 'result', text: 'Node result', path: null }]))

  fireEvent.change(input, { target: { value: 'no' } })

  expect(screen.getByRole('option')).toHaveTextContent('Node result')
  expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true')
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(screen.getByRole('option'))
  expect(store.visitRecentNode).not.toHaveBeenCalled()

  act(() => publish([]))

  expect(screen.queryByRole('option')).toBeNull()
  expect(screen.getByText('No results')).toBeInTheDocument()
  expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'false')
})

function setup(empty = false) {
  HTMLElement.prototype.scrollIntoView = vi.fn()
  const recentNodes = new RecentNodes()
  const store = createEditorStoreDouble({ snapshot: { status: 'ready' }, recentNodes })
  const document = {
    roots: Array.from({ length: 10 }, (_, id) => ({ id: String(id), text: `Node ${id}`, children: [] })),
  }
  recentNodes.load(empty ? [] : document.roots.map(({ id }) => id), document)
  const beforeVisit = vi.fn()
  render(
    <>
      <textarea className="node-input" defaultValue="alpha beta" aria-label="Editor" />
      <GlobalSearchPopup
        store={store}
        shortcuts={APPLE_SHORTCUTS}
        blocked={false}
        beforeOpen={vi.fn()}
        beforeVisit={beforeVisit}
      />
    </>,
  )
  const input = screen.getByLabelText('Editor') as HTMLTextAreaElement
  input.focus()
  input.setSelectionRange(2, 7, 'backward')
  fireEvent.keyDown(input, { key: ';', metaKey: true })
  return { store, input, beforeVisit }
}

// @requirement PRODUCT.md §20.14.2
it('shares only consecutive path headings without changing result order or keyboard targets', () => {
  const { store } = setup()
  const results = [
    { id: 'a', text: 'First needle\nFull second line', path: 'Project' },
    { id: 'b', text: 'Second needle', path: 'Project' },
    { id: 'c', text: 'Third needle', path: 'Other' },
    { id: 'd', text: 'Fourth needle', path: 'Project' },
    { id: 'root', text: 'Root needle', path: null },
  ]
  vi.mocked(store.searchNodes).mockImplementation((_query, publish) => {
    publish(results)
    return vi.fn()
  })

  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'needle' } })

  expect(screen.getAllByText('Project')).toHaveLength(2)
  expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
    ...results.slice(0, 4).map((item) => item.text),
    'Root needle',
  ])
  expect(screen.getAllByRole('option')[1]).toHaveAccessibleDescription('Project')
  expect(screen.getAllByRole('option')[3]).toHaveAccessibleDescription('Project')

  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'ArrowDown' })
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(store.visitRecentNode).toHaveBeenCalledWith('c')
})

// @requirement PRODUCT.md §20.14
it('borrows focus, wraps eight results and restores a directional selection without visiting', () => {
  const { input, store } = setup()
  expect(screen.getAllByRole('option')).toHaveLength(8)
  expect(screen.getByRole('searchbox', { name: 'Search query' })).toHaveFocus()
  fireEvent.keyDown(document, { key: 'ArrowUp' })
  expect(screen.getAllByRole('option')[7]).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(screen.getByRole('searchbox', { name: 'Search query' })).toHaveFocus()
  fireEvent.keyDown(document, { key: 'Escape' })

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(input).toHaveFocus()
  expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 7, 'backward'])
  expect(store.visitRecentNode).not.toHaveBeenCalled()
})

it('keeps title and scrollbar interaction inside the popup and reveals arrow-selected rows', () => {
  setup()
  const last = screen.getAllByRole('option')[7]!
  const list = screen.getByRole('listbox')
  vi.spyOn(last, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 200 - list.scrollTop, 200, 52))
  vi.spyOn(list, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 200, 100))
  Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 })
  fireEvent.pointerDown(screen.getByRole('dialog'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'ArrowUp' })

  expect(list.scrollTop).toBeGreaterThan(0)
})

it('visits only on confirmation and permits dismissing an empty history', () => {
  const { store, beforeVisit } = setup()
  fireEvent.keyDown(document, { key: 'ArrowDown' })
  fireEvent.keyDown(document, { key: 'Enter' })

  expect(beforeVisit).toHaveBeenCalledOnce()
  expect(store.visitRecentNode).toHaveBeenCalledWith('1')
  expect(screen.queryByRole('dialog')).toBeNull()

  cleanup()
  const empty = setup(true)
  fireEvent.keyDown(document, { key: 'Enter' })
  expect(screen.getByText('No recent nodes')).toBeInTheDocument()
  expect(empty.store.visitRecentNode).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(empty.input).toHaveFocus()
})

it('cancels obsolete searches, restores recent nodes on clear and starts empty with Cmd+;', () => {
  const { store } = setup()
  const cancel = vi.fn()
  vi.mocked(store.searchNodes).mockImplementation((_query, publish) => {
    publish([{ id: 'result', text: 'Found', path: null }])
    return cancel
  })
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'needle' } })
  expect(screen.getByText('Found')).toBeInTheDocument()
  fireEvent.change(input, { target: { value: '' } })
  expect(cancel).toHaveBeenCalledOnce()
  expect(screen.getAllByRole('option')).toHaveLength(8)
  fireEvent.change(input, { target: { value: 'next' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  fireEvent.keyDown(document, { key: ';', metaKey: true })

  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getByRole('searchbox')).toHaveFocus()
})

it.each(['#', '#work'])('closes Search on the first Escape with %s tag suggestions and restores selection', (query) => {
  const { store, input: editor, beforeVisit } = setup()
  const cancel = vi.fn()
  vi.mocked(store.searchNodeSuggestions).mockReturnValue(['work', 'worker'])
  vi.mocked(store.searchNodes).mockReturnValue(cancel)
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: query } })
  expect(screen.getByRole('listbox', { name: 'Tags' })).toBeInTheDocument()

  fireEvent.keyDown(input, { key: 'Escape' })

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(editor).toHaveFocus()
  expect([editor.selectionStart, editor.selectionEnd, editor.selectionDirection]).toEqual([2, 7, 'backward'])
  expect(cancel).toHaveBeenCalledOnce()
  expect(store.visitRecentNode).not.toHaveBeenCalled()
  expect(beforeVisit).not.toHaveBeenCalled()

  fireEvent.keyDown(editor, { key: ';', metaKey: true })

  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.queryByRole('listbox', { name: 'Tags' })).toBeNull()
})

it('accepts tag suggestions with ordinary completion keys and respects IME', () => {
  const { store } = setup()
  vi.mocked(store.searchNodeSuggestions).mockReturnValue(['work', 'worker'])
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: '#w' } })
  fireEvent.keyDown(input, { key: 'n', ctrlKey: true })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(input).toHaveValue('#worker')
  expect(store.visitRecentNode).not.toHaveBeenCalled()
  expect(screen.queryByRole('listbox', { name: 'Tags' })).toBeNull()
  fireEvent.change(input, { target: { value: '#work' } })
  fireEvent.compositionStart(input)
  fireEvent.change(input, { target: { value: '#作' } })
  fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(input).toHaveFocus()
  expect(screen.queryByRole('listbox', { name: 'Tags' })).toBeNull()
  expect(input).toHaveValue('#作')
  fireEvent.compositionEnd(input)
  expect(screen.getByRole('listbox', { name: 'Tags' })).toBeInTheDocument()
})

it.each(['keyboard', 'pointer'])(
  'refreshes on document replacement but does not reopen when %s visit finishes a buffered edit',
  (path) => {
    const { store, beforeVisit } = setup()
    let notify: () => void = () => undefined
    vi.mocked(store.subscribe).mockImplementation((listener) => {
      notify = listener
      return () => undefined
    })
    const snapshot = store.getSnapshot()
    if (snapshot.status !== 'ready') throw new Error('Expected ready store')
    vi.mocked(store.getSnapshot).mockReturnValue({ ...snapshot, document: { roots: [] } })
    const input = screen.getByRole('searchbox')
    fireEvent.change(input, { target: { value: 'needle' } })
    vi.mocked(store.searchNodes).mockClear()
    vi.mocked(store.getSnapshot).mockReturnValue({ ...snapshot, document: { roots: [] } })

    act(() => notify())
    expect(store.searchNodes).toHaveBeenCalledOnce()

    fireEvent.change(input, { target: { value: '' } })
    beforeVisit.mockImplementation(() => {
      vi.mocked(store.getSnapshot).mockReturnValue({ ...snapshot, document: { roots: [] } })
      notify()
    })
    if (path === 'keyboard') fireEvent.keyDown(input, { key: 'Enter' })
    else fireEvent.click(screen.getAllByRole('option')[0]!)

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(store.visitRecentNode).toHaveBeenCalledWith('0')
  },
)
