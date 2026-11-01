import { expect, it } from 'vitest'
import { TagCatalog } from './tag-catalog'
import type { TreeNode } from './document-types'

const node = (id: string, text: string, children: readonly TreeNode[] = []): TreeNode => ({ id, text, children })

it('rejects search queries that are not a complete tag fragment without throwing', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('source', '#alpha')] })

  for (const query of ['', 'alpha', 'prefix #a']) expect(catalog.searchSuggestions(query)).toEqual([])
})

it.each(['source', 'legacy id with spaces', 'Stryker was here!'])(
  'searches tags without treating saved node id %s as an active editing node',
  (id) => {
    const catalog = new TagCatalog()
    catalog.update({ roots: [node(id, '#alpha')] })

    expect(catalog.searchSuggestions('#a')).toEqual(['alpha'])
  },
)

it('uses the current text of a node moved and edited in a replacement snapshot', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('b', '#beta'), node('a', '#alpha')] })
  catalog.update({ roots: [node('b', '#beta', [node('a', '#apple #a_b_c')])] })

  expect(catalog.suggest('a', '#', 1)?.suggestions).toEqual(['beta'])
  expect(catalog.suggest('a', '#alpha #a', 9)?.suggestions).toEqual(['alpha', 'beta'])
})

it('discards removed node contributions before previewing text for that id', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('a', '#a_b_c'), node('b', '#beta')] })
  catalog.update({ roots: [node('b', '#beta')] })

  expect(catalog.suggest('a', '#a_b_c #ac', 10)?.suggestions).toEqual(['a_b_c'])
})

it('offers a deleted tag only once when a new draft introduces it again', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('a', '#alpha'), node('b', '#beta')] })
  catalog.update({ roots: [node('b', '#beta')] })

  expect(catalog.suggest('draft', '#alpha #', 8)?.suggestions).toEqual(['alpha', 'beta'])
})

it('merges draft tags once in alphabetical order with existing suggestions', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('a', '#apple #a_b_c'), node('b', '#alpha #abc')] })

  expect(catalog.suggest('a', '#alpha #a', 9)?.suggestions).toEqual(['abc', 'alpha'])
  expect(catalog.suggest('draft', '#aardvark #a', 12)?.suggestions).toEqual([
    'a_b_c',
    'aardvark',
    'abc',
    'alpha',
    'apple',
  ])
})

it('returns fuzzy names ordered by word boundaries before proximity', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('catalog', '#abc #a_b_c #abbc')] })

  expect(catalog.suggest('draft', '#ac', 3)?.suggestions).toEqual(['a_b_c', 'abc', 'abbc'])
})

it('allows excluded ranges touching either edge of the active fragment', () => {
  const catalog = new TagCatalog()
  catalog.update({ roots: [node('catalog', '#road')] })

  expect(catalog.suggest('draft', 'x #ro y', 5, [{ start: 0, end: 2 }])?.suggestions).toEqual(['road'])
  expect(catalog.suggest('draft', 'x #ro y', 5, [{ start: 5, end: 7 }])?.suggestions).toEqual(['road'])
})

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
