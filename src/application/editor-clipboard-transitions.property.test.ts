import { expect, it } from 'vitest'
import fc from 'fast-check'
import { propertyRuns } from '../test/property-runs'
import type { LinkRange } from '../domain/document'
import { textPasteTransition } from './editor-clipboard-transitions'

// @requirement PRODUCT.md §23.9
it('keeps hyperlink text and offsets through mixed-line-ending single-node paste', () => {
  fc.assert(
    fc.property(fc.array(fc.constantFrom('\n', '\r\n', '\r'), { minLength: 1, maxLength: 30 }), (breaks) => {
      let text = ''
      let normalized = ''
      const links: LinkRange[] = []
      const expected: LinkRange[] = []
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
        text += prefix + url + lineBreak
        normalized += prefix + url + '\n'
      }

      const result = textPasteTransition(
        { roots: [{ id: 'target', text: 'abcdef', children: [] }] },
        { currentParentId: null, selectedNodeId: 'target' },
        'target',
        3,
        { kind: 'text', text, links },
        () => {
          throw new Error('A single-node paste cannot allocate sibling IDs')
        },
        true,
      )

      expect(result.document.roots).toEqual([
        { id: 'target', text: `abc${normalized}def`, links: expected, children: [] },
      ])
      expect(result.focus).toEqual({ nodeId: 'target', cursor: 3 + normalized.length })
    }),
    { numRuns: propertyRuns(50) },
  )
})
