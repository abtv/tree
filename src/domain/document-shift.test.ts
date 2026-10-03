import { describe, expect, it } from 'vitest'
import { attachmentSummary, MAX_DOCUMENT_DEPTH, shiftSiblingRange, type Document, type TreeNode } from './document'

const image = { id: 'image', mimeType: 'image/png' as const }

function node(id: string, children: TreeNode[] = [], attached = false): TreeNode {
  return { id, text: id.toUpperCase(), ...(attached ? { attachment: image } : {}), children }
}

function shape(nodes: readonly TreeNode[]): unknown[] {
  return nodes.map((entry) => (entry.children.length === 0 ? entry.id : { [entry.id]: shape(entry.children) }))
}

const document: Document = { roots: [node('a'), node('b', [node('b1')]), node('c'), node('d')] }

describe('shiftSiblingRange', () => {
  it('moves a range into the end of the preceding sibling and back out again', () => {
    const indented = shiftSiblingRange(document, 'b', 2, 'in')
    if (indented.kind !== 'moved') throw new Error('expected a move')
    expect(shape(indented.document.roots)).toEqual([{ a: [{ b: ['b1'] }, 'c'] }, 'd'])
    // Nodes outside the moved path are shared, and moved subtrees are not copied.
    expect(indented.document.roots[1]).toBe(document.roots[3])
    expect(indented.document.roots[0]!.children[0]).toBe(document.roots[1])

    const outdented = shiftSiblingRange(indented.document, 'b', 2, 'out')
    if (outdented.kind !== 'moved') throw new Error('expected a move')
    expect(outdented.document).toEqual(document)
  })

  it('leaves unselected children under the original parent when moving out', () => {
    const nested: Document = { roots: [node('p', [node('x'), node('y'), node('z')]), node('q')] }
    const result = shiftSiblingRange(nested, 'y', 1, 'out')
    if (result.kind !== 'moved') throw new Error('expected a move')
    expect(shape(result.document.roots)).toEqual([{ p: ['x', 'z'] }, 'y', 'q'])
  })

  it('is impossible for the first sibling, a root moving out, and a range past the end', () => {
    expect(shiftSiblingRange(document, 'a', 1, 'in')).toEqual({ kind: 'impossible' })
    expect(shiftSiblingRange(document, 'b', 1, 'out')).toEqual({ kind: 'impossible' })
    expect(shiftSiblingRange(document, 'd', 2, 'in')).toEqual({ kind: 'impossible' })
    expect(shiftSiblingRange(document, 'b', 0, 'in')).toEqual({ kind: 'impossible' })
  })

  it('reports too-deep when any moved descendant would fall below the maximum depth', () => {
    let deep: TreeNode = node('leaf')
    for (let level = MAX_DOCUMENT_DEPTH - 2; level >= 1; level -= 1) deep = node(`n${level}`, [deep])
    // `deep` is MAX_DOCUMENT_DEPTH - 1 levels tall, so one more level still fits...
    const fits: Document = { roots: [node('first'), deep] }
    expect(shiftSiblingRange(fits, 'n1', 1, 'in').kind).toBe('moved')
    // ...but two more levels do not.
    const tooDeep: Document = { roots: [node('first'), node('wrapper', [deep])] }
    const inner: Document = { roots: [node('first', [node('second')]), node('wrapper', [deep])] }
    expect(shiftSiblingRange(tooDeep, 'wrapper', 1, 'in').kind).toBe('too-deep')
    expect(shiftSiblingRange(inner, 'wrapper', 1, 'in').kind).toBe('too-deep')
  })

  it('keeps attachment multiplicity and does not mutate the input', () => {
    const attached: Document = { roots: [node('a', [], true), node('b', [node('b1', [], true)])] }
    const before = structuredClone(attached)
    const result = shiftSiblingRange(attached, 'b', 1, 'in')
    if (result.kind !== 'moved') throw new Error('expected a move')
    expect(attachmentSummary(result.document).get('image')).toBe(2)
    expect(attached).toEqual(before)
  })
})
