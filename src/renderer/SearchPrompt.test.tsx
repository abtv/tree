// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import './test/setup'
import { createEditorStoreDouble } from './test/editor-store-double'
import { SearchPrompt } from './SearchPrompt'

afterEach(cleanup)

it('leaves composition confirmation and cancellation to native input before accepting a completed query', () => {
  const store = createEditorStoreDouble()
  const confirm = vi.spyOn(store.search, 'confirm')
  const cancel = vi.spyOn(store.search, 'cancelDraft')
  const restoreEditor = vi.fn()
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: 'old', draft: 'new', visible: true, pending: false }}
      restoreEditor={restoreEditor}
    />,
  )
  const input = screen.getByRole('textbox', { name: 'Search' })
  expect(input).toHaveFocus()
  fireEvent.compositionStart(input)
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(confirm).not.toHaveBeenCalled()
  expect(cancel).not.toHaveBeenCalled()
  fireEvent.compositionEnd(input)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(confirm).toHaveBeenCalledOnce()
  expect(restoreEditor).toHaveBeenCalledOnce()
})

it('cancels on window deactivation without stealing focus back from another window', () => {
  const store = createEditorStoreDouble()
  const cancel = vi.spyOn(store.search, 'cancelDraft')
  const restoreEditor = vi.fn()
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: '', draft: 'new', visible: true, pending: false }}
      restoreEditor={restoreEditor}
    />,
  )
  fireEvent.blur(window)
  expect(cancel).toHaveBeenCalledOnce()
  expect(restoreEditor).not.toHaveBeenCalled()
})
