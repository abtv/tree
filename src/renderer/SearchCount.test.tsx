// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import './test/setup'
import { SearchCount } from './SearchCount'

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it('retains the completed count through fast searches without a blank or intermediate count', () => {
  const view = render(<SearchCount pending={false} label="3 / 7" />)

  view.rerender(<SearchCount pending label="0" />)
  act(() => vi.advanceTimersByTime(199))

  expect(screen.getByRole('status')).toHaveTextContent('3 / 7')
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')

  view.rerender(<SearchCount pending={false} label="2" />)

  expect(screen.getByRole('status')).toHaveTextContent('2')
  expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'false')
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.getByRole('status')).toHaveTextContent('2')
})

it('shows pending after 200ms, replaces it immediately, and restarts the delay for another search', () => {
  const view = render(<SearchCount pending label="7" />)

  act(() => vi.advanceTimersByTime(200))

  expect(screen.getByRole('status')).toHaveTextContent('Searching…')

  view.rerender(<SearchCount pending={false} label="0" />)

  expect(screen.getByRole('status')).toHaveTextContent('0')

  view.rerender(<SearchCount pending label="0" />)
  act(() => vi.advanceTimersByTime(199))

  expect(screen.getByRole('status')).toHaveTextContent('0')

  act(() => vi.advanceTimersByTime(1))

  expect(screen.getByRole('status')).toHaveTextContent('Searching…')
})

it('cancels the delay when Find closes', () => {
  const view = render(<SearchCount pending label="7" />)

  view.unmount()

  expect(vi.getTimerCount()).toBe(0)
})
