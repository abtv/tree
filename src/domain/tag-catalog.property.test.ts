import fc from 'fast-check'
import { expect, it } from 'vitest'
import { TagCatalog } from './tag-catalog'
import { findTags } from './tags'
import type { Document, TreeNode } from './document-types'

// @requirement PRODUCT.md §20.13
it('keeps marker membership correct across edits and undo/redo snapshots', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          tags: fc.array(fc.constantFrom('Work', 'work', 'a-b', '週_2'), { maxLength: 6 }),
          finished: fc.boolean(),
        }),
        { minLength: 1, maxLength: 25 },
      ),
      fc.constantFrom('#', '@', '&'),
      (edits, prefix) => {
        const catalog = new TagCatalog(prefix)
        const fixed: TreeNode = { id: 'b', text: `${prefix}fixed ${prefix}work`, children: [] }
        const history: Document[] = []
        const namesOf = (roots: readonly TreeNode[]) =>
          [...new Set(roots.flatMap((node) => findTags(node.text, [], prefix).map((tag) => tag.name)))].sort()
        const check = (document: Document): void => {
          catalog.update(document)
          const expected = namesOf(document.roots)
          expect(catalog.suggest('draft', prefix, 1)?.suggestions ?? []).toEqual(expected)
          expect(catalog.searchSuggestions(prefix)).toEqual(expected)
          expect(catalog.searchSuggestions(`${prefix}WORK`)).toEqual(
            expected.filter((name) => name.toLowerCase() === 'work'),
          )
        }
        for (const { tags, finished } of edits) {
          const edited: TreeNode = {
            id: 'a',
            text: tags.map((tag) => `${prefix}${tag}`).join(' '),
            children: [],
            ...(finished ? { struckThrough: true } : {}),
          }
          const document = { roots: [edited, fixed] }
          history.push(document)
          check(document)
        }
        for (const document of [...history].reverse()) check(document)
        for (const document of history) check(document)
      },
    ),
  )
})
