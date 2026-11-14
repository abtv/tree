import { expect, it } from 'vitest'
import fc from 'fast-check'
import { imageSearchTextEnrichment } from './image-search-text'
import { parsePersistedState, serializeState, type Document } from './document'

// @requirement PRODUCT.md §15.1
it('preserves immutable trees, shared history branches and serialized recognition including empty results', () => {
  fc.assert(
    fc.property(fc.string({ maxLength: 1000 }), (text) => {
      const other = { id: 'other', text: 'Other', children: [] }
      const source = {
        id: 'source',
        text: '',
        attachment: { id: 'image', mimeType: 'image/png' as const },
        children: [],
      }
      const document: Document = { roots: [source, other] }
      const enrich = imageSearchTextEnrichment('image', text)

      const result = enrich(document)
      const history = enrich({ roots: [source] })
      const state = serializeState(result, { currentParentId: null, selectedNodeId: 'source' })

      expect(source.attachment).toEqual({ id: 'image', mimeType: 'image/png' })
      expect(result.roots[1]).toBe(other)
      expect(history.roots[0]).toBe(result.roots[0])
      expect(result.roots[0]!.attachment?.searchText).toBe(text)
      expect(parsePersistedState(JSON.parse(JSON.stringify(state))).document).toEqual(result)
      expect(enrich(document)).toBe(result)
    }),
  )
})

it.each([42, null, {}, 'a'.repeat(1_048_577)])('rejects malformed hidden recognition metadata', (searchText) => {
  expect(() =>
    parsePersistedState({
      version: 1,
      document: {
        roots: [
          {
            id: 'a',
            text: '',
            children: [],
            attachment: { id: 'image', mimeType: 'image/png', searchText },
          },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    }),
  ).toThrow('saved attachment')
})

it('enriches every image occurrence when history moves, duplicates or removes images', () => {
  fc.assert(
    fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }), (attached) => {
      const roots = attached.map((hasImage, index) => ({
        id: String(index),
        text: '',
        children: [],
        ...(hasImage ? { attachment: { id: 'image', mimeType: 'image/png' as const } } : {}),
      }))
      const enrich = imageSearchTextEnrichment('image', 'Result')
      const original = JSON.stringify(roots)
      const variants: Document[] = [
        { roots },
        { roots: [...roots].reverse() },
        { roots: [{ id: 'parent', text: '', attachment: { id: 'image', mimeType: 'image/png' }, children: roots }] },
        { roots: roots.slice(1) },
      ]

      for (const document of variants) {
        const result = enrich(document)
        const stack = [...result.roots]
        while (stack.length) {
          const node = stack.pop()!
          if (node.attachment) expect(node.attachment.searchText).toBe('Result')
          stack.push(...node.children)
        }
      }

      expect(JSON.stringify(roots)).toBe(original)
    }),
  )
})
