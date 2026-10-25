import fc from 'fast-check'
import { expect, it } from 'vitest'
import { TagCatalog } from './tag-catalog'
import { findTags } from './tags'
import type { Document, TreeNode } from './document-types'

// @requirement PRODUCT.md §20.13
it('keeps derived membership equal to literal document tags across edits and undo/redo snapshots', () => {
  fc.assert(
    fc.property(
      fc.array(fc.array(fc.constantFrom('Work', 'work', 'a-b', '週_2'), { maxLength: 6 }), {
        minLength: 1,
        maxLength: 25,
      }),
      (edits) => {
        const catalog = new TagCatalog()
        let roots: readonly TreeNode[] = [
          { id: 'a', text: '', children: [] },
          { id: 'b', text: '#fixed', children: [] },
        ]
        const history: Document[] = []
        const check = (document: Document): void => {
          catalog.update(document)
          const expected = [
            ...new Set(document.roots.flatMap((node) => findTags(node.text).map((tag) => tag.name))),
          ].sort()
          expect(catalog.suggest('draft', '#', 1)?.suggestions ?? []).toEqual(expected)
        }
        for (const tags of edits) {
          roots = [{ ...roots[0]!, text: tags.map((tag) => `#${tag}`).join(' ') }, roots[1]!]
          const document = { roots }
          history.push(document)
          check(document)
        }
        for (const document of [...history].reverse()) check(document)
        for (const document of history) check(document)
      },
    ),
  )
})
