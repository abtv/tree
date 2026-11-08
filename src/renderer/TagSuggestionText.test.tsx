// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { TagSuggestionText } from './TagSuggestionText'

afterEach(cleanup)

it.each([
  ['test', '#tes', '#tes'],
  ['new_tag', '#tag', 'tag'],
  ['Straße', '#ss', 'ß'],
  ['𐐀bc', '#𐐨b', '#𐐀b'],
  ['test', '#', ''],
  ['ai-automation-meeting', '#tag', ''],
])('highlights only the continuous matching source span in %s for %s', (name, query, highlighted) => {
  const { container } = render(<TagSuggestionText name={name} query={query} />)

  expect(container.textContent).toBe(`#${name}`)
  expect([...container.querySelectorAll('strong')].map((element) => element.textContent).join('')).toBe(highlighted)
})
