import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import { caretMarks } from './agenda-row-caret'
import { richTextHtml } from './editor-dom'

const link = (text: string): TreeNode => ({
  id: 'n',
  text,
  children: [],
  links: [{ start: 3, end: 8, url: 'https://x.test' }],
})

describe('Agenda row text marks in rich text', () => {
  // @requirement PRODUCT.md §23.4
  it('leaves the markup unchanged when there are no marks', () => {
    const node = link('go! https then')
    expect(richTextHtml(node, [], [])).toBe(richTextHtml(node))
    expect(richTextHtml(node)).toBe('go!<a href="https://x.test" rel="noreferrer" target="_blank"> http</a>s then')
  })

  // @requirement PRODUCT.md §23.4
  it('nests a block mark inside a link and keeps the text and link intact', () => {
    const node = link('go! https then')
    const html = richTextHtml(node, [], caretMarks({ key: 'k', anchor: 4, focus: 4 }, node.text.length, 'normal'))
    expect(html).toContain(
      '<a href="https://x.test" rel="noreferrer" target="_blank"> <span class="agenda-caret">h</span>ttp</a>',
    )
    expect(html.replace(/<[^>]+>/gu, '')).toBe('go! https then')
  })

  // @requirement PRODUCT.md §23.4
  it('draws a thin caret at the end of text that ends with a link or a decoration', () => {
    const node: TreeNode = {
      id: 'n',
      text: 'ab https',
      children: [],
      links: [{ start: 3, end: 8, url: 'https://x.test' }],
    }
    const end = richTextHtml(node, [], caretMarks({ key: 'k', anchor: 8, focus: 8 }, 8, 'insert'))
    expect(end.endsWith('</a><span class="agenda-caret"></span>')).toBe(true)
    const plain: TreeNode = { id: 'n', text: '2026-10-14', children: [] }
    const decorated = richTextHtml(
      plain,
      [{ start: 0, end: 10, className: 'agenda-date-active' }],
      caretMarks({ key: 'k', anchor: 10, focus: 10 }, 10, 'insert'),
    )
    expect(decorated).toBe('<span class="agenda-date-active">2026-10-14</span><span class="agenda-caret"></span>')
  })

  // @requirement PRODUCT.md §23.4
  it('shows the block on an empty text and splits a decoration around a selection', () => {
    const empty: TreeNode = { id: 'n', text: '', children: [] }
    expect(richTextHtml(empty, [], caretMarks({ key: 'k', anchor: 0, focus: 0 }, 0, 'normal'))).toBe(
      '<span class="agenda-caret"></span>',
    )
    const dated: TreeNode = { id: 'n', text: '2026-10-14 x', children: [] }
    const html = richTextHtml(
      dated,
      [{ start: 0, end: 10, className: 'agenda-date-active' }],
      caretMarks({ key: 'k', anchor: 8, focus: 11 }, 12, 'visual'),
    )
    expect(html).toBe(
      '<span class="agenda-date-active">2026-10-<span class="agenda-selection">14</span></span><span class="agenda-selection"> x</span>',
    )
  })
})
