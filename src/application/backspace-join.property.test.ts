import fc from 'fast-check'
import { expect, it } from 'vitest'
import { assertDocument, locateNode, type TreeNode } from '../domain/document'
import { joinPreviousTextTransition } from './editor-command-transitions'

it('joins only the two sibling leaves at any depth and preserves input and unrelated identities', () => {
  fc.assert(
    fc.property(
      fc.string({ minLength: 1 }),
      fc.string({ minLength: 1 }),
      fc.integer({ min: 0, max: 10 }),
      (a, b, depth) => {
        const first: TreeNode = { id: 'a', text: a, children: [] }
        const second: TreeNode = { id: 'b', text: b, children: [] }
        const other: TreeNode = { id: 'other', text: 'Other', children: [] }
        let roots = [first, second, other]
        for (let index = 0; index < depth; index++) roots = [{ id: `parent-${index}`, text: 'Parent', children: roots }]
        const document = { roots }
        const location = { currentParentId: null, selectedNodeId: 'b' }

        const result = joinPreviousTextTransition(document, location, 0)!

        assertDocument(result.document)
        expect(locateNode(result.document, 'a')!.node.text).toBe(a + b)
        expect(locateNode(result.document, 'b')).toBeUndefined()
        expect(locateNode(result.document, 'other')!.node).toBe(other)
        expect(result.location).toEqual({ ...location, selectedNodeId: 'a' })
        expect(result.focus).toEqual({ nodeId: 'a', cursor: a.length })
        expect(locateNode(document, 'a')!.node).toBe(first)
        expect(locateNode(document, 'b')!.node).toBe(second)
      },
    ),
  )
})
