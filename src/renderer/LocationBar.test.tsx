// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { LocationBar } from './LocationBar'

afterEach(cleanup)

it('marks completed ancestor and current labels without striking separators', () => {
  render(
    <LocationBar
      path={[
        { id: 'a', text: 'Ancestor', struckThrough: true, children: [] },
        { id: 'b', text: 'Current', struckThrough: true, children: [] },
      ]}
      currentParentId="b"
      onNavigate={vi.fn()}
    />,
  )

  expect(screen.getByText('Ancestor')).toHaveClass('node-text-struck')
  expect(screen.getByText('Current')).toHaveClass('node-text-struck')
  for (const separator of screen.getAllByText('›')) expect(separator).not.toHaveClass('node-text-struck')
})
