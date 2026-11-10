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

// @requirement PRODUCT.md §20.13
// @requirement PRODUCT.md §20.14
it.each(['@', '&'] as const)('searches only complete %s names and maps real matches in paths and text', (prefix) => {
  const text = `${prefix}Anna ${prefix}Annabelle #Anna ${prefix}Anna`
  const work = searchNodes(
    {
      roots: [
        {
          id: 'parent',
          text: `Team ${prefix}Anna`,
          children: [
            { id: 'match', text, links: [{ start: 0, end: 5, url: 'https://example.com' }], children: [] },
            { id: 'other', text: '#Anna @anna &anna email@Anna embedded&Anna', children: [] },
          ],
        },
      ],
    },
    `${prefix}Anna`,
  )
  let next = work.next()
  while (!next.done) next = work.next()

  expect(next.value.map(({ id }) => id)).toEqual(['parent', 'match'])
  expect(next.value[1]?.tagMatches?.map(({ start, end }) => text.slice(start, end))).toEqual([`${prefix}Anna`])
  expect(next.value[1]?.pathTagMatches).toEqual([{ start: 5, end: 10 }])
})

it('restores ancestor paths after leaving nested branches and separates breadcrumb levels', () => {
  const work = searchNodes(
    {
      roots: [
        {
          id: 'root',
          text: 'needle root',
          children: [
            { id: 'branch', text: 'Branch', children: [{ id: 'deep', text: 'needle deep', children: [] }] },
            { id: 'sibling', text: 'needle sibling', children: [] },
          ],
        },
        { id: 'outside', text: 'needle outside', children: [] },
      ],
    },
    'needle',
  )
  let next = work.next()
  while (!next.done) next = work.next()

  expect(next.value).toEqual([
    { id: 'root', text: 'needle root', path: null },
    { id: 'deep', text: 'needle deep', path: 'needle root › Branch' },
    { id: 'sibling', text: 'needle sibling', path: 'needle root' },
    { id: 'outside', text: 'needle outside', path: null },
  ])
})

it('cancels the pending callback and does not reschedule an already queued stale callback', () => {
  const callbacks: (() => void)[] = []
  const cancelled = vi.fn()
  const schedule = vi.fn((callback: () => void) => {
    callbacks.push(callback)
    return cancelled
  })
  const publish = vi.fn()
  const cancel = runNodeSearch({ roots: [{ id: 'long', text: 'a'.repeat(100_000), children: [] }] }, 'xyz', publish, {
    schedule,
  })
  callbacks.shift()!()

  cancel()
  callbacks.shift()!()

  expect(cancelled).toHaveBeenCalledOnce()
  expect(schedule).toHaveBeenCalledTimes(2)
  expect(callbacks).toEqual([])
  expect(publish).not.toHaveBeenCalled()
})

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
  expect(tags.searchSuggestions('#wrk')).toEqual([])
  expect(tags.suggest('', '#wrk', 4)?.suggestions).toEqual(['Work', 'work', 'worker'])
  expect(tags.has('new_tag')).toBe(false)
  expect(tags.searchSuggestions('text #w')).toEqual([])
  expect(tags.searchSuggestions('#work #w')).toEqual([])
})

it('keeps complete multiline text and projects only real tag matches through normalized ancestor paths', () => {
  const parent = '  Project\n  #tag  #tag'
  const text = `${'long '.repeat(50)}\n#tag #tag #tagged`
  const work = searchNodes(
    {
      roots: [
        {
          id: 'parent',
          text: parent,
          links: [{ start: parent.lastIndexOf('#tag'), end: parent.length, url: 'https://example.com' }],
          children: [
            {
              id: 'child',
              text,
              links: [{ start: text.indexOf('#tag'), end: text.indexOf('#tag') + 4, url: 'https://example.com' }],
              children: [],
            },
          ],
        },
      ],
    },
    '#tag',
  )
  let next = work.next()
  while (!next.done) next = work.next()
  const child = next.value.find((item) => item.id === 'child')!

  expect(child.text).toBe(text)
  expect(child.path).toBe('Project #tag #tag')
  expect(child.tagMatches?.map((match) => child.text.slice(match.start, match.end))).toEqual(['#tag'])
  expect(child.tagMatches?.[0]?.start).toBe(text.lastIndexOf('#tag #tagged'))
  expect(child.pathTagMatches).toEqual([{ start: 8, end: 12 }])
})

it('maps multiple ancestor levels and includes a whole tag ending exactly at the label cutoff', () => {
  const work = searchNodes(
    {
      roots: [
        {
          id: 'root',
          text: '  #other   #tag   ',
          children: [
            {
              id: 'parent',
              text: `${'a'.repeat(155)} #tag #tag`,
              children: [{ id: 'leaf', text: '#tag', children: [] }],
            },
          ],
        },
      ],
    },
    '#tag',
  )
  let next = work.next()
  while (!next.done) next = work.next()
  const leaf = next.value.find((item) => item.id === 'leaf')!

  expect(leaf.path).toBe(`#other #tag › ${'a'.repeat(155)} #tag`)
  expect(leaf.pathTagMatches).toEqual([
    { start: 7, end: 11 },
    { start: 170, end: 174 },
  ])
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
