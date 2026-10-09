// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { richTextHtml, readEditableContent, setSelectionRange, getSelectionRange } from './editor-dom'

// @requirement PRODUCT.md §23.9
it('decorates dates without changing text, links or caret offsets', () => {
  const node = {
    id: 'n',
    text: '2026-10-14 https://example.com 2026-10-20',
    children: [],
    links: [{ start: 11, end: 30, url: 'https://example.com' }],
  }
  const input = document.createElement('div')
  input.innerHTML = richTextHtml(node, [
    { start: 0, end: 10, className: 'agenda-date-active' },
    { start: 31, end: 41, className: 'agenda-date-secondary' },
  ])
  document.body.append(input)
  expect(readEditableContent(input)).toEqual({ text: node.text, links: node.links })
  expect(input.querySelector('.agenda-date-active')?.textContent).toBe('2026-10-14')
  for (const [start, end] of [
    [0, 4],
    [8, 12],
    [31, 36],
    [41, 41],
  ]) {
    setSelectionRange(input, start!, end!)
    expect(getSelectionRange(input)).toEqual({ start, end })
  }
  input.remove()
})
