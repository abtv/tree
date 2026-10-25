import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../domain/document'
import { joinPreviousTextTransition } from './editor-command-transitions'

const leaf = (id: string, text = id): TreeNode => ({ id, text, children: [] })
const location = { currentParentId: null, selectedNodeId: 'b' }

describe('Backspace text joins', () => {
  it('preserves links, whitespace and the first node identity at the join caret', () => {
    const url = 'https://one.test'
    const left = `${url} `
    const right = ` ${url}`
    const document = {
      roots: [
        { ...leaf('a', left), links: [{ start: 0, end: url.length, url }] },
        { ...leaf('b', right), links: [{ start: 1, end: right.length, url }] },
      ],
    }

    const result = joinPreviousTextTransition(document, location, 0)!

    expect(result.document.roots).toEqual([
      {
        ...leaf('a', left + right),
        links: [
          { start: 0, end: url.length, url },
          { start: left.length + 1, end: left.length + right.length, url },
        ],
      },
    ])
    expect(result.location).toEqual({ ...location, selectedNodeId: 'a' })
    expect(result.focus).toEqual({ nodeId: 'a', cursor: left.length })
  })

  it.each(['a', 'b'])('rejects children or attachments on %s', (id) => {
    for (const extra of [
      { children: [leaf('child')] },
      { attachment: { id: 'image', mimeType: 'image/png' as const } },
    ]) {
      const roots = [leaf('a'), leaf('b')].map((node) => (node.id === id ? { ...node, ...extra } : node))

      expect(joinPreviousTextTransition({ roots }, location, 0)).toBeUndefined()
    }
  })

  it('rejects first siblings, headings, empty text and nonzero carets', () => {
    const document = { roots: [leaf('a'), leaf('b')] }

    expect(joinPreviousTextTransition(document, { ...location, selectedNodeId: 'a' }, 0)).toBeUndefined()
    expect(joinPreviousTextTransition(document, { ...location, currentParentId: 'b' }, 0)).toBeUndefined()
    expect(joinPreviousTextTransition(document, location, 1)).toBeUndefined()
    expect(joinPreviousTextTransition({ roots: [leaf('a'), leaf('b', '')] }, location, 0)).toBeUndefined()
    expect(joinPreviousTextTransition({ roots: [leaf('a', ''), leaf('b')] }, location, 0)).toBeUndefined()
  })

  it('never joins an adjacent descendant from another parent', () => {
    const document = { roots: [{ ...leaf('a'), children: [leaf('child')] }, leaf('b')] }

    expect(joinPreviousTextTransition(document, location, 0)).toBeUndefined()
    expect(joinPreviousTextTransition(document, { ...location, selectedNodeId: 'child' }, 0)).toBeUndefined()
  })
})
