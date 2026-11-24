// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import './test/setup'
import { createEditorStoreDouble } from './test/editor-store-double'
import { SearchPrompt } from './SearchPrompt'

afterEach(cleanup)

it('returns to the editor after confirming a Vim query', () => {
  const store = createEditorStoreDouble()
  const confirm = vi.spyOn(store.search, 'confirm')
  const restoreEditor = vi.fn()
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: '', draft: 'apple', visible: true, pending: false }}
      restoreEditor={restoreEditor}
      vim
    />,
  )

  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Search' }), { key: 'Enter' })

  expect(confirm).toHaveBeenCalledWith(1)
  expect(restoreEditor).toHaveBeenCalledOnce()
})

it('confirms backward with Shift+Enter while retaining input focus', () => {
  const store = createEditorStoreDouble()
  const confirm = vi.spyOn(store.search, 'confirm')
  const restoreEditor = vi.fn()
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: '', draft: 'a', visible: true, pending: false }}
      restoreEditor={restoreEditor}
    />,
  )

  fireEvent.keyDown(screen.getByPlaceholderText('Find'), { key: 'Enter', shiftKey: true })

  expect(confirm).toHaveBeenCalledWith(-1)
  expect(restoreEditor).not.toHaveBeenCalled()
})

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
  expect(restoreEditor).not.toHaveBeenCalled()
})

// Page focus set while the window is inactive does not activate it; the Electron spec
// "returns Normal-mode focus after the application is hidden or the window is blurred" checks that.
it.each([
  { mode: 'Vim entry', vim: true, remainsVisible: true, restores: true },
  { mode: 'a Find panel that closes', vim: false, remainsVisible: false, restores: true },
  { mode: 'a Find panel that stays open', vim: false, remainsVisible: true, restores: false },
])('cancels on window deactivation and returns page focus for $mode', ({ vim, remainsVisible, restores }) => {
  const store = createEditorStoreDouble()
  const cancel = vi.spyOn(store.search, 'cancelDraft')
  vi.spyOn(store.search.session, 'getSnapshot').mockReturnValue({
    confirmed: '',
    visible: remainsVisible,
    pending: false,
  })
  const restoreEditor = vi.fn()
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: '', draft: 'new', visible: true, pending: false }}
      restoreEditor={restoreEditor}
      vim={vim}
    />,
  )

  fireEvent.blur(window)

  expect(cancel).toHaveBeenCalledOnce()
  expect(restoreEditor).toHaveBeenCalledTimes(restores ? 1 : 0)
})

it('returns page focus when the prompt blurs because the window is deactivated', () => {
  const store = createEditorStoreDouble()
  const cancel = vi.spyOn(store.search, 'cancelDraft')
  const restoreEditor = vi.fn()
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: '', draft: 'new', visible: true, pending: false }}
      restoreEditor={restoreEditor}
      vim
    />,
  )
  vi.spyOn(document, 'hasFocus').mockReturnValue(false)

  fireEvent.blur(screen.getByRole('textbox', { name: 'Search' }))

  expect(cancel).toHaveBeenCalledOnce()
  expect(restoreEditor).toHaveBeenCalledOnce()
})

it('leaves focus where the user moved it within the window', () => {
  const store = createEditorStoreDouble()
  const cancel = vi.spyOn(store.search, 'cancelDraft')
  const restoreEditor = vi.fn()
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: '', draft: 'new', visible: true, pending: false }}
      restoreEditor={restoreEditor}
      vim
    />,
  )
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)

  fireEvent.blur(screen.getByRole('textbox', { name: 'Search' }))

  expect(cancel).toHaveBeenCalledOnce()
  expect(restoreEditor).not.toHaveBeenCalled()
})

it('does not take focus from outside the prompt on window deactivation', () => {
  const store = createEditorStoreDouble()
  const restoreEditor = vi.fn()
  const outside = document.createElement('button')
  document.body.append(outside)
  render(
    <SearchPrompt
      store={store}
      snapshot={{ confirmed: '', draft: 'new', visible: true, pending: false }}
      restoreEditor={restoreEditor}
      vim
    />,
  )
  outside.focus()

  fireEvent.blur(window)

  expect(restoreEditor).not.toHaveBeenCalled()
  outside.remove()
})
