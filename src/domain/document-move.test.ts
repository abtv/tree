import { describe, expect, it } from 'vitest'
import {
  assertDocument,
  attachmentSummary,
  MAX_DOCUMENT_DEPTH,
  moveSibling,
  moveSubtree,
  type Document,
  type TreeNode,
} from './document'

const image = { id: 'image', mimeType: 'image/png' as const }

function node(id: string, children: TreeNode[] = [], attached = false): TreeNode {
  return { id, text: id.toUpperCase(), ...(attached ? { attachment: image } : {}), children }
}

function shape(nodes: readonly TreeNode[]): unknown[] {
  return nodes.map((entry) => (entry.children.length === 0 ? entry.id : { [entry.id]: shape(entry.children) }))
}

function moved(result: ReturnType<typeof moveSubtree>): Document {
  if (result.kind !== 'moved') throw new Error(`expected a move, got ${result.kind}`)
  return result.document
}

const document: Document = {
  roots: [node('a', [node('a1'), node('a2', [node('a21')])]), node('b', [node('b1')]), node('c'), node('d')],
}

describe('moveSubtree', () => {
  it('nests a node as the last child of a sibling', () => {
    const next = moved(moveSubtree(document, 'c', 'b', 1))
    expect(shape(next.roots)).toEqual([{ a: ['a1', { a2: ['a21'] }] }, { b: ['b1', 'c'] }, 'd'])
    assertDocument(next)
  })

  it('inserts at the requested index among the new parent children', () => {
    const next = moved(moveSubtree(document, 'c', 'a', 1))
    expect(shape(next.roots)).toEqual([{ a: ['a1', 'c', { a2: ['a21'] }] }, { b: ['b1'] }, 'd'])
  })

  it('outdents a node to the document root', () => {
    const next = moved(moveSubtree(document, 'a1', null, 4))
    expect(shape(next.roots)).toEqual([{ a: [{ a2: ['a21'] }] }, { b: ['b1'] }, 'c', 'd', 'a1'])
  })

  it('outdents a node to a position between the roots', () => {
    const next = moved(moveSubtree(document, 'b1', null, 1))
    expect(shape(next.roots)).toEqual([{ a: ['a1', { a2: ['a21'] }] }, 'b1', 'b', 'c', 'd'])
  })

  it('moves a node with its subtree to a distant parent', () => {
    const next = moved(moveSubtree(document, 'a2', 'b', 0))
    expect(shape(next.roots)).toEqual([{ a: ['a1'] }, { b: [{ a2: ['a21'] }, 'b1'] }, 'c', 'd'])
    expect(next.roots[1]!.children[0]).toBe(document.roots[0]!.children[1])
  })

  it('moves a node under its own former sibling subtree and into a deeper descendant', () => {
    const next = moved(moveSubtree(document, 'd', 'a21', 0))
    expect(shape(next.roots)).toEqual([{ a: ['a1', { a2: [{ a21: ['d'] }] }] }, { b: ['b1'] }, 'c'])
  })

  it('equals moveSibling for a move within the same parent', () => {
    for (const [id, index] of [
      ['a', 2],
      ['c', 0],
      ['b', 3],
      ['d', 1],
    ] as const) {
      expect(moved(moveSubtree(document, id, null, index))).toEqual(moveSibling(document, id, index))
    }
    expect(moved(moveSubtree(document, 'a2', 'a', 0))).toEqual(moveSibling(document, 'a2', 0))
  })

  it('clamps the index into the destination children', () => {
    expect(shape(moved(moveSubtree(document, 'c', 'b', 99)).roots)).toEqual([
      { a: ['a1', { a2: ['a21'] }] },
      { b: ['b1', 'c'] },
      'd',
    ])
    expect(shape(moved(moveSubtree(document, 'c', 'b', -5)).roots)).toEqual([
      { a: ['a1', { a2: ['a21'] }] },
      { b: ['c', 'b1'] },
      'd',
    ])
  })

  it('is impossible for an unknown node or parent', () => {
    expect(moveSubtree(document, 'missing', null, 0)).toEqual({ kind: 'impossible' })
    expect(moveSubtree(document, 'a', 'missing', 0)).toEqual({ kind: 'impossible' })
  })

  it('is impossible to move a node under itself or one of its descendants', () => {
    expect(moveSubtree(document, 'a', 'a', 0)).toEqual({ kind: 'impossible' })
    expect(moveSubtree(document, 'a', 'a2', 0)).toEqual({ kind: 'impossible' })
    expect(moveSubtree(document, 'a', 'a21', 0)).toEqual({ kind: 'impossible' })
  })

  it('accepts a destination that is only a sibling of the moved node ancestors', () => {
    expect(moveSubtree(document, 'a21', 'a1', 0).kind).toBe('moved')
  })

  it('fits at the depth boundary and reports too-deep one level past it', () => {
    let deep: TreeNode = node('leaf')
    for (let level = MAX_DOCUMENT_DEPTH - 2; level >= 1; level -= 1) deep = node(`n${level}`, [deep])
    // `deep` is MAX_DOCUMENT_DEPTH - 1 levels tall: it fits one level down, not two.
    const fits: Document = { roots: [node('first'), deep] }
    expect(moveSubtree(fits, 'n1', 'first', 0).kind).toBe('moved')
    const tooDeep: Document = { roots: [node('first', [node('second')]), deep] }
    expect(moveSubtree(tooDeep, 'n1', 'second', 0)).toEqual({ kind: 'too-deep' })
    expect(tooDeep.roots[0]!.children[0]!.children).toEqual([])
  })

  it('does not mutate the input and shares the subtrees it does not touch', () => {
    const before = structuredClone(document)
    const next = moved(moveSubtree(document, 'c', 'b', 1))
    expect(document).toEqual(before)
    expect(next.roots[2]).toBe(document.roots[3])
    expect(next.roots[0]).toBe(document.roots[0])
    expect(next.roots[1]!.children[0]).toBe(document.roots[1]!.children[0])
    expect(next.roots[1]!.children[1]).toBe(document.roots[2])
  })

  it('keeps the attachment summary', () => {
    const attached: Document = { roots: [node('a', [], true), node('b', [node('b1', [], true)])] }
    const next = moved(moveSubtree(attached, 'b', 'a', 0))
    expect(attachmentSummary(next).get('image')).toBe(2)
  })
})
