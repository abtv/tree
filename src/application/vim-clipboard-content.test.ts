import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import {
  vimForestClipboardContent,
  vimNodeClipboardContent,
  vimNormalClipboardContent,
  vimSelectionClipboardContent,
  vimYankClipboardContent,
} from './vim-clipboard-content'

const node: TreeNode = {
  id: 'parent',
  text: 'see https://example.com',
  links: [{ start: 4, end: 23, url: 'https://example.com' }],
  attachment: { id: 'picture', mimeType: 'image/png' },
  children: [{ id: 'child', text: 'Excluded child', children: [] }],
}

describe('Vim external clipboard projections', () => {
  it('exports every descendant in preorder with four spaces per level', () => {
    const forest: TreeNode[] = [
      {
        id: 'root',
        text: 'Root',
        children: [{ id: 'child', text: 'Child', children: [{ id: 'grandchild', text: 'Grandchild', children: [] }] }],
      },
      { id: 'sibling', text: 'Sibling', children: [] },
    ]

    expect(vimForestClipboardContent(forest)).toEqual({
      kind: 'text',
      text: 'Root\n    Child\n        Grandchild\nSibling',
    })
  })

  it('copies forward and reverse character selections as plain text', () => {
    expect(vimSelectionClipboardContent(node.text, 4, 23)).toEqual({ kind: 'text', text: 'https://example.com' })
    expect(vimSelectionClipboardContent(node.text, 23, 4)).toEqual({ kind: 'text', text: 'https://example.com' })
    expect(vimSelectionClipboardContent(node.text, 4, 4)).toBeUndefined()
  })

  it('copies Normal text or image by caret without descendants or link metadata', () => {
    expect(vimNodeClipboardContent(node, false)).toEqual({ kind: 'text', text: node.text })
    expect(vimNodeClipboardContent(node, true)).toEqual({ kind: 'image', attachmentId: 'picture' })

    const textOnly: TreeNode = { id: 'text-only', text: '', children: [] }

    expect(vimNodeClipboardContent(textOnly, false)).toBeUndefined()
    expect(vimNodeClipboardContent(textOnly, true)).toBeUndefined()
  })

  it('prefers text for one Visual leaf and otherwise copies its image or nothing', () => {
    expect(vimForestClipboardContent([{ ...node, children: [] }])).toEqual({ kind: 'text', text: node.text })
    expect(vimForestClipboardContent([{ ...node, text: '', children: [] }])).toEqual({
      kind: 'image',
      attachmentId: 'picture',
    })
    expect(vimForestClipboardContent([{ id: 'empty', text: '', children: [] }])).toBeUndefined()
    expect(vimForestClipboardContent([])).toBeUndefined()
  })

  it('joins sibling text in order with leading, middle and trailing empty entries', () => {
    const blank = { id: 'empty', text: '', children: [] }
    const imageOnly = { ...node, text: '', children: [] }

    expect(vimForestClipboardContent([blank, node, imageOnly, { ...node, text: 'last' }, blank])).toEqual({
      kind: 'text',
      text: '\nsee https://example.com\n    Excluded child\n\nlast\n    Excluded child\n',
    })
    expect(vimForestClipboardContent([blank, imageOnly])).toEqual({ kind: 'text', text: '\n' })
  })

  it('exports a single branch as text even when its root is empty or has only an image', () => {
    expect(vimForestClipboardContent([node])).toEqual({ kind: 'text', text: `${node.text}\n    Excluded child` })
    expect(vimForestClipboardContent([{ ...node, text: '' }])).toEqual({ kind: 'text', text: '\n    Excluded child' })
    expect(
      vimForestClipboardContent([{ ...node, text: '', children: [{ id: 'empty', text: '', children: [] }] }]),
    ).toEqual({ kind: 'text', text: '\n    ' })
  })

  it('exports Normal deletions only when the actual sibling forest has one node', () => {
    expect(vimNormalClipboardContent([node], false)).toEqual({ kind: 'text', text: node.text })
    expect(vimNormalClipboardContent([node], true)).toEqual({ kind: 'image', attachmentId: 'picture' })
    expect(vimNormalClipboardContent([node, node], false)).toBeUndefined()
    expect(vimNormalClipboardContent([], false)).toBeUndefined()
  })

  it('exports text yanks as complete forests including empty roots and indented empty descendants', () => {
    const blank: TreeNode = { id: 'blank', text: '', children: [] }
    const branch = { ...node, children: [blank, ...node.children] }

    expect(vimYankClipboardContent([branch], false)).toEqual({
      kind: 'text',
      text: `${node.text}\n    \n    Excluded child`,
    })
    expect(vimYankClipboardContent([blank, branch, blank], false)).toEqual({
      kind: 'text',
      text: `\n${node.text}\n    \n    Excluded child\n`,
    })
    expect(vimYankClipboardContent([{ ...node, text: '' }], false)).toEqual({
      kind: 'text',
      text: '\n    Excluded child',
    })
    expect(vimYankClipboardContent([blank], false)).toBeUndefined()
    expect(vimYankClipboardContent([], false)).toBeUndefined()
  })

  it('retains image-caret and empty-text-leaf rules for Normal yanks', () => {
    const leaf = { ...node, text: '', children: [] }

    expect(vimYankClipboardContent([node], true)).toEqual({ kind: 'image', attachmentId: 'picture' })
    expect(vimYankClipboardContent([node, leaf], true)).toBeUndefined()
    expect(vimYankClipboardContent([leaf], false)).toBeUndefined()
    expect(vimYankClipboardContent([leaf], true)).toEqual({ kind: 'image', attachmentId: 'picture' })
    expect(vimYankClipboardContent([], true)).toBeUndefined()
  })

  it('reads each selected node text once in a wide subtree and retains document order', () => {
    let reads = 0
    const children = Array.from({ length: 10000 }, (_, index): TreeNode => ({
      id: `child-${index}`,
      get text() {
        reads += 1
        return String(index)
      },
      children: [],
    }))

    const copied = vimYankClipboardContent([{ id: 'root', text: 'Root', children }], false)

    expect(reads).toBe(10000)
    expect(copied).toEqual({ kind: 'text', text: `Root\n${children.map((_, index) => `    ${index}`).join('\n')}` })
  })
})
