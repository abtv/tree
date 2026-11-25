// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { RichTextProjection } from './rich-text-projection'

const node = { id: 'one', text: 'x x', children: [] }
const first = { start: 0, end: 1, className: 'search-match' }
const second = { start: 2, end: 3, className: 'search-match' }
const matches = [first, second]

it('updates current styling without replacing nodes and clears it when the destination leaves the row', () => {
  const input = document.createElement('div')
  const projection = new RichTextProjection()
  projection.apply(input, node, undefined, matches, first)
  const [firstSpan, secondSpan] = input.querySelectorAll('.search-match')

  projection.apply(input, node, undefined, matches, second)

  expect(input.querySelector('.search-match-current')).toBe(secondSpan)
  expect(input.querySelector('.search-match')).toBe(firstSpan)

  projection.apply(input, node, undefined, matches, undefined)

  expect(input.querySelector('.search-match-current')).toBeNull()
  expect(input.querySelector('.search-match')).toBe(firstSpan)
})

it.each(['before notification', 'after notification'])('reconciles native content changes %s', async (when) => {
  const input = document.createElement('div')
  const projection = new RichTextProjection()
  projection.apply(input, node, undefined, matches, first)
  input.querySelector('.search-match-current')!.firstChild!.textContent = 'changed'
  if (when === 'after notification') await Promise.resolve()

  projection.apply(input, node, undefined, matches, second)

  expect(input.textContent).toBe(node.text)
  expect(input.querySelector('.search-match-current')?.getAttribute('data-local-match')).toBe('2:3')
  projection.reset()
})
