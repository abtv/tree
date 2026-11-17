import { expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import type { LinkRange, TreeNode } from '../domain/document'
import { textPasteTransition } from './editor-clipboard-transitions'

// @requirement PRODUCT.md §13.1
// @requirement PRODUCT.md §14
// @requirement PRODUCT.md §23.9
it.each([true, false])('keeps rich link offsets through mixed line endings (single node: %s)', (singleNode) => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom('\n', '\r\n', '\r'), { minLength: 1, maxLength: 30 }), (breaks) => {
      let text = ''
      let normalized = ''
      const links: LinkRange[] = []
      const expected: LinkRange[] = []
      const expectedNodes: TreeNode[] = []
      for (const [index, lineBreak] of breaks.entries()) {
        const url = `https://example.com/${index}`
        // A prefix keeps automatic URL recognition from masking lost clipboard metadata.
        const prefix = index % 2 === 0 ? 'X🔹' : 'X'
        links.push({ start: text.length + prefix.length, end: text.length + prefix.length + url.length, url })
        expected.push({
          start: 3 + normalized.length + prefix.length,
          end: 3 + normalized.length + prefix.length + url.length,
          url,
        })
        const linePrefix = (index === 0 ? 'abc' : '') + prefix
        expectedNodes.push({
          id: index === 0 ? 'target' : `new-${index}`,
          text: linePrefix + url,
          links: [{ start: linePrefix.length, end: linePrefix.length + url.length, url }],
          children: [],
        })
        text += prefix + url + lineBreak
        normalized += prefix + url + '\n'
      }

      const result = textPasteTransition(
        { roots: [{ id: 'target', text: 'abcdef', children: [] }] },
        { currentParentId: null, selectedNodeId: 'target' },
        'target',
        3,
        { kind: 'text', text, links },
        (count) => {
          if (singleNode) throw new Error('A single-node paste cannot allocate sibling IDs')
          return Array.from({ length: count }, (_, index) => `new-${index + 1}`)
        },
        singleNode,
      )

      if (singleNode) {
        expect(result.document.roots).toEqual([
          { id: 'target', text: `abc${normalized}def`, links: expected, children: [] },
        ])
        expect(result.focus).toEqual({ nodeId: 'target', cursor: 3 + normalized.length })
      } else {
        expectedNodes.push({ id: `new-${breaks.length}`, text: 'def', children: [] })
        expect(result.document.roots).toEqual(expectedNodes)
        expect(result.focus).toEqual({ nodeId: `new-${breaks.length}`, cursor: 0 })
      }
    }),
    { numRuns: propertyRuns(50) },
  )
})
