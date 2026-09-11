// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import './test/setup'
import { App } from './App'

describe('App', () => {
  it('renders the application shell', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Tree' })).toBeInTheDocument()
  })
})
