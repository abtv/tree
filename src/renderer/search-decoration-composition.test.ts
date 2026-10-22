// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { readEditableContent, richTextHtml } from './editor-dom'

it('composes overlapping matches and dates across a link without duplicating text or splitting its identity', () => {
  const node = {
    id: 'a',
    text: 'before link after',
    children: [],
    links: [{ start: 7, end: 11, url: 'https://example.test' }],
  }
  const element = document.createElement('div')
  element.innerHTML = richTextHtml(node, [
    { start: 5, end: 14, className: 'search-match' },
    { start: 8, end: 10, className: 'date-like' },
  ])
  expect(readEditableContent(element)).toEqual({ text: node.text, links: node.links })
  expect(element.querySelectorAll('a')).toHaveLength(1)
  expect([...element.querySelectorAll('.search-match')].map((span) => span.textContent).join('')).toBe('e link af')
  expect(element.querySelector('a .date-like')?.textContent).toBe('in')
})
