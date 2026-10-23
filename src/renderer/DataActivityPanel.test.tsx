// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DataActivityPanel } from './DataActivityPanel'

afterEach(cleanup)

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
