import { expect, it } from 'vitest'
import { TagCatalog } from './tag-catalog'
import type { TreeNode } from './document-types'

const node = (id: string, text: string, children: readonly TreeNode[] = []): TreeNode => ({ id, text, children })

// @requirement PRODUCT.md §20.13
it('ranks whole Unicode letters consistently in ambiguous and unambiguous fuzzy matches', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('catalog', '#xaaX𐐀 #zzzaX𐐀 #a_𐐁𐐀 #aX_𐐀')] })

  const names = catalog.suggest('draft', '#a𐐀', 4)?.suggestions ?? []

  expect(names).toHaveLength(4)
  expect(names.indexOf('xaaX𐐀')).toBeLessThan(names.indexOf('zzzaX𐐀'))
  expect(names.indexOf('aX_𐐀')).toBeLessThan(names.indexOf('a_𐐁𐐀'))
})

// @requirement PRODUCT.md §20.13
it('collects the entire document, deduplicates exact spelling and ranks like emoji', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('root', '#Work #work #cat2 #bobcat', [node('child', '#cat #joy-cat #cat')])] })

  expect(catalog.suggest('input', '#', 1)?.suggestions).toEqual(['Work', 'bobcat', 'cat', 'cat2', 'joy-cat', 'work'])
  expect(catalog.suggest('input', '#cat', 4)?.suggestions).toEqual(['cat', 'cat2', 'joy-cat', 'bobcat'])
  expect(catalog.suggest('input', '#W', 2)?.suggestions).toEqual(['Work'])
  expect(catalog.suggest('input', '#wk', 3)?.suggestions).toEqual(['work'])
  expect(catalog.suggest('input', '#absent', 7)).toBeUndefined()
})

// @requirement PRODUCT.md §20.13
it('replaces the edited node with its draft and excludes only the active occurrence', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('input', '#rocket #r'), node('other', '#road')] })

  expect(catalog.suggest('input', '#rocket #ro', 11)?.suggestions).toEqual(['road', 'rocket'])
  expect(catalog.suggest('input', '#new #n', 7)?.suggestions).toEqual(['new'])
  expect(catalog.suggest('input', '#r', 2)?.suggestions).toEqual(['road'])
  expect(catalog.suggest('input', '#ro', 3, [{ start: 0, end: 3 }])).toBeUndefined()
})

// @requirement PRODUCT.md §20.13
it('tracks removals, moves, document replacement and restored snapshots', () => {
  const catalog = new TagCatalog()
  const child = node('child', '#only')
  const first = { roots: [node('a', '#duplicate', [child]), node('b', '#duplicate')] }
  catalog.update(first)
  catalog.update({ roots: [node('a', '', []), node('b', '#duplicate', [child])] })

  expect(catalog.suggest('child', '#', 1)?.suggestions).toEqual(['duplicate'])

  catalog.update({ roots: [node('b', '')] })

  expect(catalog.suggest('b', '#', 1)).toBeUndefined()

  catalog.update(first)

  expect(catalog.suggest('input', '#', 1)?.suggestions).toEqual(['duplicate', 'only'])
})
