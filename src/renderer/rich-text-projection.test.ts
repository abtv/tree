// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
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

const denseNode = { id: 'dense', text: 'xx '.repeat(512), children: [] }
const denseMatches = Array.from({ length: 512 }, (_, index) => ({
  start: 3 * index,
  end: 3 * index + 2,
  className: 'search-match',
}))

it('reuses a compact dense draft and styles the current span without reading or replacing markup', () => {
  const input = document.createElement('div')
  const projection = new RichTextProjection()
  projection.apply(input, denseNode, undefined, denseMatches, undefined)
  const firstSpan = input.firstElementChild
  const lastSpan = input.lastElementChild
  const readMarkup = vi.spyOn(input, 'innerHTML', 'get')

  projection.apply(input, denseNode, undefined, denseMatches, undefined)
  projection.apply(input, denseNode, undefined, denseMatches, denseMatches.at(-1))

  expect(input.querySelector('.search-match-current')).toBe(lastSpan)
  expect(input.firstElementChild).toBe(firstSpan)
  expect(readMarkup).not.toHaveBeenCalled()

  projection.apply(input, denseNode, undefined, denseMatches, undefined)

  expect(input.querySelector('.search-match-current')).toBeNull()
  expect(input.lastElementChild).toBe(lastSpan)
  readMarkup.mockRestore()
  projection.reset()
})

it.each(['before notification', 'after notification'])('repairs a changed compact match class %s', async (when) => {
  const input = document.createElement('div')
  const projection = new RichTextProjection()
  projection.apply(input, denseNode, undefined, denseMatches, denseMatches[0])
  const damaged = input.firstElementChild!
  damaged.className = ''
  if (when === 'after notification') await Promise.resolve()

  projection.apply(input, denseNode, undefined, denseMatches, denseMatches[1])

  expect(input.firstElementChild).not.toBe(damaged)
  expect(input.querySelectorAll('.search-match')).toHaveLength(denseMatches.length)
  expect(input.children.item(1)).toHaveProperty('className', 'search-match search-match-current')
  projection.reset()
})

it('uses the composed markup when dense local highlights cross a link boundary', () => {
  const input = document.createElement('div')
  const projection = new RichTextProjection()
  const linked = { ...denseNode, links: [{ start: 1, end: 2, url: 'https://example.test' }] }

  projection.apply(input, linked, undefined, denseMatches, denseMatches[0])

  expect(input.querySelectorAll('.search-match-current')).toHaveLength(2)
  expect(input.querySelector('a > .search-match-current')?.textContent).toBe('x')
  expect(input.textContent).toBe(linked.text)
  projection.reset()
})

it('projects the edited text when a compact draft drops below the dense threshold', () => {
  const input = document.createElement('div')
  const projection = new RichTextProjection()
  projection.apply(input, denseNode, undefined, denseMatches, undefined)
  input.firstElementChild!.firstChild!.textContent = 'xy'
  const edited = { ...denseNode, text: `xy${denseNode.text.slice(2)}` }

  projection.apply(input, edited, undefined, denseMatches.slice(1), undefined)

  expect(input.textContent).toBe(edited.text)
  expect(input.querySelectorAll('.search-match')).toHaveLength(denseMatches.length - 1)
  expect(input.firstElementChild?.getAttribute('data-local-match')).toBe('3:5')
  projection.reset()
})
