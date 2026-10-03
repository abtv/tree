import { describe, expect, it } from 'vitest'
import { attachmentSummary, joinSiblingRange, type Document, type TreeNode } from './document'

const image = { id: 'image', mimeType: 'image/png' as const }

function node(id: string, text: string, children: TreeNode[] = [], attached = false): TreeNode {
  return { id, text, ...(attached ? { attachment: image } : {}), children }
}

function joined(document: Document, firstId: string, count: number, spaced: boolean) {
  const result = joinSiblingRange(document, firstId, count, spaced)
  if (result.kind !== 'joined') throw new Error(`expected a join, got ${result.kind}`)
  return result
}

describe('joinSiblingRange', () => {
  const document: Document = {
    roots: [node('a', 'alpha', [node('a1', 'one')]), node('b', 'beta', [node('b1', 'two')]), node('c', 'gamma')],
  }

  it('keeps the first ID and appends the children of every joined node in order', () => {
    const result = joined(document, 'a', 2, true)
    expect(result.document.roots.map((entry) => entry.id)).toEqual(['a', 'c'])
    expect(result.document.roots[0]).toEqual(node('a', 'alpha beta', [node('a1', 'one'), node('b1', 'two')]))
    // Descendants and untouched siblings are shared, not copied.
    expect(result.document.roots[0]!.children[0]).toBe(document.roots[0]!.children[0])
    expect(result.document.roots[0]!.children[1]).toBe(document.roots[1]!.children[0])
    expect(result.document.roots[1]).toBe(document.roots[2])
    expect(document.roots).toHaveLength(3)
  })

  it('joins a longer range left to right and reports the first join point', () => {
    const result = joined(document, 'a', 3, true)
    expect(result.document.roots).toHaveLength(1)
    expect(result.document.roots[0]!.text).toBe('alpha beta gamma')
    expect(result.cursor).toBe('alpha'.length)
  })

  it('removes surrounding whitespace for J and keeps it for gJ', () => {
    const padded: Document = { roots: [node('a', 'alpha  \t'), node('b', '  beta')] }
    const spaced = joined(padded, 'a', 2, true)
    expect(spaced.document.roots[0]!.text).toBe('alpha beta')
    expect(spaced.cursor).toBe(5)
    const raw = joined(padded, 'a', 2, false)
    expect(raw.document.roots[0]!.text).toBe('alpha  \t  beta')
    expect(raw.cursor).toBe('alpha  \t'.length)
  })

  it('inserts no space when either text is empty after trimming', () => {
    const empties: Document = { roots: [node('a', ''), node('b', 'beta'), node('c', '   '), node('d', 'delta')] }
    expect(joined(empties, 'a', 2, true).document.roots[0]!.text).toBe('beta')
    expect(joined(empties, 'a', 2, true).cursor).toBe(0)
    expect(joined(empties, 'b', 2, true).document.roots[1]!.text).toBe('beta')
    expect(joined(empties, 'b', 3, true).document.roots[1]!.text).toBe('beta delta')
  })

  it('moves hyperlink ranges with their text', () => {
    const url = 'https://example.com'
    const linked: Document = {
      roots: [
        { id: 'a', text: `see ${url} `, links: [{ start: 4, end: 4 + url.length, url }], children: [] },
        { id: 'b', text: ` ${url} end`, links: [{ start: 1, end: 1 + url.length, url }], children: [] },
      ],
    }
    const result = joined(linked, 'a', 2, true)
    const text = `see ${url} ${url} end`
    expect(result.document.roots[0]!.text).toBe(text)
    expect(result.document.roots[0]!.links).toEqual([
      { start: 4, end: 4 + url.length, url },
      { start: 5 + url.length, end: 5 + 2 * url.length, url },
    ])
    const raw = joined(linked, 'a', 2, false)
    expect(raw.document.roots[0]!.links).toEqual([
      { start: 4, end: 4 + url.length, url },
      { start: 4 + url.length + 1 + 1, end: 4 + 2 * url.length + 2, url },
    ])
  })

  it('carries the single attachment to the retained node and keeps the summary', () => {
    const attached: Document = { roots: [node('a', 'alpha'), node('b', 'beta', [node('b1', 'x', [], true)], true)] }
    const result = joined(attached, 'a', 2, true)
    expect(result.document.roots[0]!.attachment).toEqual(image)
    expect([...attachmentSummary(result.document)]).toEqual([['image', 2]])
    const first: Document = { roots: [node('a', 'alpha', [], true), node('b', 'beta')] }
    expect(joined(first, 'a', 2, true).document.roots[0]!.attachment).toEqual(image)
  })

  it('rejects a range with two attached nodes, even with the same attachment', () => {
    const both: Document = { roots: [node('a', 'alpha', [], true), node('b', 'beta'), node('c', 'gamma', [], true)] }
    expect(joinSiblingRange(both, 'a', 3, true)).toEqual({ kind: 'attachments' })
    expect(joinSiblingRange(both, 'a', 2, true).kind).toBe('joined')
    // An attachment on a descendant is not a participating attachment.
    const nested: Document = { roots: [node('a', 'alpha', [node('a1', 'x', [], true)], true), node('b', 'beta')] }
    expect(joinSiblingRange(nested, 'a', 2, true).kind).toBe('joined')
  })

  it('is impossible with fewer than two nodes or a range past the last sibling', () => {
    expect(joinSiblingRange(document, 'c', 2, true)).toEqual({ kind: 'impossible' })
    expect(joinSiblingRange(document, 'a', 1, true)).toEqual({ kind: 'impossible' })
    expect(joinSiblingRange(document, 'b', 3, true)).toEqual({ kind: 'impossible' })
  })

  it('joins siblings inside a parent and leaves the rest of the tree shared', () => {
    const nested: Document = { roots: [node('p', 'parent', [node('x', 'x'), node('y', 'y')]), node('q', 'q')] }
    const result = joined(nested, 'x', 2, true)
    expect(result.document.roots[0]).toEqual(node('p', 'parent', [node('x', 'x y')]))
    expect(result.document.roots[1]).toBe(nested.roots[1])
  })
})
