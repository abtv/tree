// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SearchQueryInput } from './SearchQueryInput'

afterEach(cleanup)

it('styles valid marker terms and preserves literal text, whitespace and native input semantics', () => {
  const value = '@me  local #work &review @ #bad! mail@me'
  const { container } = render(<SearchQueryInput aria-label="Query" value={value} onChange={vi.fn()} />)

  expect(screen.getByRole('textbox')).toHaveValue(value)
  expect(container.querySelector('.node-search-input-mirror')).toHaveTextContent(value.replace(/\s+/g, ' '))
  expect([...container.querySelectorAll('.node-search-match')].map((el) => el.textContent)).toEqual([
    '@me',
    '#work',
    '&review',
  ])
  expect(container.querySelector('.node-search-input-mirror')).toHaveAttribute('aria-hidden', 'true')
})

it('leaves composition to native input and restores marker presentation on commitment', () => {
  const onCompositionEnd = vi.fn()
  const { container } = render(<SearchQueryInput value="@me" onChange={vi.fn()} onCompositionEnd={onCompositionEnd} />)
  const input = screen.getByRole('textbox')

  fireEvent.compositionStart(input)

  expect(container.querySelector('.node-search-input-mirror')).toBeNull()
  expect(input).toHaveValue('@me')

  fireEvent.compositionEnd(input)

  expect(container.querySelector('.node-search-match')).toHaveTextContent('@me')
  expect(onCompositionEnd).toHaveBeenCalledOnce()
})
