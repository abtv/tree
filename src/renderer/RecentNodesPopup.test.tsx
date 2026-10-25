// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { RecentNodesPopup } from './RecentNodesPopup'
import { createEditorStoreDouble } from './test/editor-store-double'
import { APPLE_SHORTCUTS } from './shortcut-profile'

afterEach(cleanup)

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
  expect(screen.getByRole('listbox')).toHaveFocus()
  fireEvent.keyDown(document, { key: 'ArrowUp' })
  expect(screen.getAllByRole('option')[7]).toHaveAttribute('aria-selected', 'true')
  fireEvent.keyDown(document, { key: 'Tab' })
  expect(screen.getByRole('listbox')).toHaveFocus()
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
