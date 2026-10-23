// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DataActivityPanel } from './DataActivityPanel'

afterEach(cleanup)

// @requirement PRODUCT.md §25.3
it('focuses an import result once and restores the editor when the result closes', () => {
  const view = render(<input aria-label="Editor" />)
  const editor = screen.getByLabelText('Editor')
  editor.focus()
  const result = (text: string) => (
    <>
      <input aria-label="Editor" />
      <DataActivityPanel text={text} action="OK" onAction={() => {}} onShowFolder={() => {}} focusAction />
    </>
  )
  view.rerender(result('Imported notes.'))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'OK' }))
  editor.focus()
  view.rerender(result('Imported “Notes.zip”.'))
  expect(document.activeElement).toBe(editor)
  screen.getByRole('button', { name: 'Show in Finder' }).focus()
  view.rerender(<input aria-label="Editor" />)
  expect(document.activeElement).toBe(editor)
})

// @requirement PRODUCT.md §25.2
it('announces progress, dispatches the action and leaves editor focus available', () => {
  const action = vi.fn()
  render(
    <>
      <input aria-label="Editor" />
      <DataActivityPanel text="Exporting Notes… 1 of 2 images" action="Cancel" onAction={action} />
    </>,
  )
  const input = screen.getByLabelText('Editor')
  input.focus()
  expect(screen.getByRole('status').textContent).toBe('Exporting Notes… 1 of 2 images')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(action).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(input)
})

// @requirement PRODUCT.md §25.2
it('returns keyboard focus to the latest editor when the focused panel closes', () => {
  const view = render(
    <>
      <input aria-label="Editor" />
      <DataActivityPanel text="Exported “Notes.zip”." action="OK" onAction={() => {}} />
    </>,
  )
  const input = screen.getByLabelText('Editor')
  input.focus()
  screen.getByRole('button', { name: 'OK' }).focus()
  view.rerender(<input aria-label="Editor" />)
  expect(document.activeElement).toBe(input)
})
