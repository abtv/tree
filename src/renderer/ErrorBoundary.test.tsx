// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import './test/setup'
import { ErrorBoundary } from './ErrorBoundary'

afterEach(cleanup)

function Exploding(): React.JSX.Element {
  throw new Error('render exploded')
}

describe('ErrorBoundary', () => {
  it('renders its children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <p>content</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('content')).toBeInTheDocument()
  })

  it('shows a fallback with the error message and diagnostic logging', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Tree encountered an unexpected error')
    expect(screen.getByRole('alert')).toHaveTextContent('render exploded')
    expect(consoleError).toHaveBeenCalledWith(
      'Tree encountered an unexpected error.',
      expect.objectContaining({ message: 'render exploded' }),
      expect.anything(),
    )

    consoleError.mockRestore()
  })

  it('reloads the window when the fallback action is used', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const reload = vi.fn()
    const originalLocation = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } })

    render(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    )
    screen.getByRole('button', { name: 'Reload' }).click()

    expect(reload).toHaveBeenCalledOnce()

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
    consoleError.mockRestore()
  })
})
