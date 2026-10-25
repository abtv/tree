import { expect, it, vi } from 'vitest'
import { runNodeSearch, searchNodes } from './node-search'
import { TagCatalog } from '../domain/tag-catalog'
import type { Document } from '../domain/document'

const document: Document = {
  roots: [
    { id: 'a', text: 'Alpha #work #w', children: [{ id: 'b', text: 'alpha alpha #Work', children: [] }] },
    { id: 'c', text: 'ALPHA #worker', children: [] },
    { id: 'd', text: 'link #work', links: [{ start: 5, end: 10, url: 'https://example.com' }], children: [] },
  ],
}

function results(query: string) {
  const work = searchNodes(document, query)
  let next = work.next()
  while (!next.done) next = work.next()
  return next.value
}

// @requirement PRODUCT.md §20.14
it('searches the complete tree once per node using literal smart case and parent paths', () => {
  expect(results('alpha').map(({ id }) => id)).toEqual(['a', 'b', 'c'])
  expect(results('Alpha').map(({ id }) => id)).toEqual(['a'])
  expect(results('a.*')).toEqual([])
  expect(results('alpha')[1]).toMatchObject({ path: 'Alpha #work #w' })
})

it('matches complete case-sensitive tags, excluding links and prefixes', () => {
  expect(results('#work').map(({ id }) => id)).toEqual(['a'])
  expect(results('#Work').map(({ id }) => id)).toEqual(['b'])
  expect(results('#w').map(({ id }) => id)).toEqual(['a'])
  expect(results('#new_tag')).toEqual([])
  const tags = new TagCatalog()
  tags.update(document)

  expect(tags.searchSuggestions('#')).toEqual(['Work', 'w', 'work', 'worker'])
  expect(tags.searchSuggestions('#wrk')).toEqual(['work', 'worker'])
  expect(tags.has('new_tag')).toBe(false)
  expect(tags.searchSuggestions('text #w')).toEqual([])
  expect(tags.searchSuggestions('#work #w')).toEqual([])
})

it('yields on long unmatched text and cancellation prevents stale publication', () => {
  const callbacks: (() => void)[] = []
  const publish = vi.fn()
  const cancel = runNodeSearch({ roots: [{ id: 'a', text: 'a'.repeat(100_000), children: [] }] }, 'xyz', publish, {
    schedule: (callback) => {
      callbacks.push(callback)
      return () => undefined
    },
  })
  callbacks.shift()!()
  expect(publish).not.toHaveBeenCalled()
  expect(callbacks).toHaveLength(1)

  cancel()
  callbacks.shift()!()

  expect(publish).not.toHaveBeenCalled()
})
