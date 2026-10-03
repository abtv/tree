import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import {
  vimForestClipboardContent,
  vimNodeClipboardContent,
  vimNormalClipboardContent,
  vimSelectionClipboardContent,
} from './vim-clipboard-content'

const node: TreeNode = {
  id: 'parent',
  text: 'see https://example.com',
  links: [{ start: 4, end: 23, url: 'https://example.com' }],
  attachment: { id: 'picture', mimeType: 'image/png' },
  children: [{ id: 'child', text: 'Excluded child', children: [] }],
}

describe('Vim external clipboard projections', () => {
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

  it('prefers text for one Visual node and otherwise copies its image or nothing', () => {
    expect(vimForestClipboardContent([node])).toEqual({ kind: 'text', text: node.text })
    expect(vimForestClipboardContent([{ ...node, text: '' }])).toEqual({ kind: 'image', attachmentId: 'picture' })
    expect(vimForestClipboardContent([{ id: 'empty', text: '', children: [] }])).toBeUndefined()
    expect(vimForestClipboardContent([])).toBeUndefined()
  })

  it('joins sibling text in order with leading, middle and trailing empty entries', () => {
    const blank = { id: 'empty', text: '', children: [] }
    const imageOnly = { ...node, text: '' }
    expect(vimForestClipboardContent([blank, node, imageOnly, { ...node, text: 'last' }, blank])).toEqual({
      kind: 'text',
      text: '\nsee https://example.com\n\nlast\n',
    })
    expect(vimForestClipboardContent([blank, imageOnly])).toEqual({ kind: 'text', text: '\n' })
  })

  it('never reads children when projecting a Visual forest', () => {
    const root: TreeNode = {
      id: 'root',
      text: 'root',
      get children(): TreeNode[] {
        throw new Error('descendant traversal')
      },
    }
    expect(vimForestClipboardContent([root, root])).toEqual({ kind: 'text', text: 'root\nroot' })
  })

  it('exports Normal yanks only when the actual sibling forest has one node', () => {
    expect(vimNormalClipboardContent([node], false)).toEqual({ kind: 'text', text: node.text })
    expect(vimNormalClipboardContent([node], true)).toEqual({ kind: 'image', attachmentId: 'picture' })
    expect(vimNormalClipboardContent([node, node], false)).toBeUndefined()
    expect(vimNormalClipboardContent([], false)).toBeUndefined()
  })
})
