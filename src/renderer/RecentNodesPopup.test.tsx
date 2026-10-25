// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RecentNodesPopup } from './RecentNodesPopup'
import { createEditorStoreDouble } from './test/editor-store-double'
import { APPLE_SHORTCUTS } from './shortcut-profile'
import type { RecentNode } from '../application/recent-nodes'

afterEach(cleanup)

// @requirement PRODUCT.md §20.14
it('retains rows during refinement without allowing stale activation, then replaces them together', () => {
  const { store } = setup()
  let publish: (results: readonly RecentNode[]) => void = () => undefined
  vi.mocked(store.searchNodes).mockImplementation((_query, callback) => {
    publish = callback
    return vi.fn()
  })
  const input = screen.getByRole('searchbox')
  fireEvent.change(input, { target: { value: 'nod' } })
  act(() => publish([{ id: 'result', text: 'Node result', path: null }]))

  fireEvent.change(input, { target: { value: 'node' } })

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
  const store = createEditorStoreDouble({ snapshot: { status: 'ready' } })
  const document = {
    roots: Array.from({ length: 10 }, (_, id) => ({ id: String(id), text: `Node ${id}`, children: [] })),
  }
  store.recentNodes.load(empty ? [] : document.roots.map(({ id }) => id), document)
  const beforeVisit = vi.fn()
  render(
    <>
      <textarea className="node-input" defaultValue="alpha beta" aria-label="Editor" />
      <RecentNodesPopup
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
  const reveal = vi.spyOn(last, 'scrollIntoView')
  fireEvent.pointerDown(screen.getByRole('dialog'))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'ArrowUp' })

  expect(reveal).toHaveBeenCalledWith({ block: 'nearest' })
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

it('cancels obsolete searches, restores recent nodes on clear and starts empty with Cmd+F', () => {
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
  fireEvent.keyDown(document, { key: 'f', metaKey: true })

  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getByRole('searchbox')).toHaveFocus()
})

it('accepts tag suggestions with ordinary completion keys, keeps literal input on Escape and respects IME', () => {
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
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(input).toHaveValue('#work')
  expect(input).toHaveFocus()
  fireEvent.compositionStart(input)
  fireEvent.change(input, { target: { value: '#作' } })
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(screen.queryByRole('listbox', { name: 'Tags' })).toBeNull()
  expect(input).toHaveValue('#作')
  fireEvent.compositionEnd(input)
  expect(screen.getByRole('listbox', { name: 'Tags' })).toBeInTheDocument()
})

it('refreshes on document replacement but does not reopen when visit finishes a buffered edit', () => {
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
  fireEvent.keyDown(input, { key: 'Enter' })

  expect(screen.queryByRole('dialog')).toBeNull()
  expect(store.visitRecentNode).toHaveBeenCalledWith('0')
})
