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

it.each(['', ' \t\n'])('finishes an empty query %j without traversing the document', (query) => {
  const roots = vi.fn(() => document.roots)
  const work = searchNodes(
    {
      get roots() {
        return roots()
      },
    },
    query,
  )
  let step = work.next()
  while (!step.done) step = work.next()

  expect(step.value).toEqual([])
  expect(roots).not.toHaveBeenCalled()
})

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
            {
              id: 'branch',
              text: '  Done\n  branch ',
              struckThrough: true,
              children: [{ id: 'deep', text: 'needle deep', children: [] }],
            },
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
    {
      id: 'deep',
      text: 'needle deep',
      path: 'needle root › Done branch',
      parentId: 'branch',
      pathStruckMatches: [{ start: 14, end: 25 }],
    },
    { id: 'sibling', text: 'needle sibling', path: 'needle root', parentId: 'root' },
    { id: 'outside', text: 'needle outside', path: null },
  ])
})

// @requirement PRODUCT.md §20.14.3
it('puts matching stars first and preserves traversal order within each group', () => {
  const work = searchNodes(
    {
      roots: [
        {
          id: 'parent',
          text: 'Note',
          children: [{ id: 'star-child', text: 'Zulu note', starred: true, children: [] }],
        },
        { id: 'other', text: 'Another note', children: [] },
        { id: 'star-root', text: 'Alpha note', starred: true, children: [] },
        { id: 'unmatched', text: 'Meeting', starred: true, children: [] },
      ],
    },
    'note',
  )

  let next = work.next()
  while (!next.done) next = work.next()

  expect(next.value.map(({ id }) => id)).toEqual(['star-child', 'star-root', 'parent', 'other'])
})

// @requirement PRODUCT.md §20.14.3
it('puts matching marked stars, then marked nodes, then stars before other matches', () => {
  const work = searchNodes(
    {
      roots: [
        { id: 'plain', text: 'Plain note', children: [] },
        { id: 'star', text: 'Star note', starred: true, children: [] },
        {
          id: 'mark-parent',
          text: 'Marked note',
          marked: true,
          children: [{ id: 'both', text: 'Both note', starred: true, marked: true, children: [] }],
        },
        { id: 'mark-root', text: 'Second marked note', marked: true, children: [] },
        { id: 'both-root', text: 'Second both note', starred: true, marked: true, children: [] },
        { id: 'unmatched', text: 'Meeting', marked: true, children: [] },
      ],
    },
    'note',
  )

  let next = work.next()
  while (!next.done) next = work.next()

  expect(next.value.map(({ id }) => id)).toEqual(['both', 'both-root', 'mark-parent', 'mark-root', 'star', 'plain'])
  expect(next.value[0]).toMatchObject({ starred: true, marked: true })
})

// @requirement PRODUCT.md §20.14.3
it.each([{ marked: true }, { marked: true, starred: true }] as const)(
  'keeps the first priority group when the other groups do not match (%j)',
  (flags) => {
    const source: Document = {
      roots: [
        { id: 'plain', text: 'Note', children: [] },
        { id: 'priority', text: 'Note', ...flags, children: [] },
      ],
    }

    expect(results('note', source).map(({ id }) => id)).toEqual(['priority', 'plain'])
  },
)

// @requirement PRODUCT.md §20.14.2
it('carries the image of a matching node, with its natural size when stored', () => {
  const work = searchNodes(
    {
      roots: [
        {
          id: 'sized',
          text: 'Plan',
          attachment: { id: 'a1', mimeType: 'image/png', width: 800, height: 240, searchText: 'release' },
          children: [],
        },
        {
          id: 'unsized',
          text: '',
          attachment: { id: 'a2', mimeType: 'image/png', searchText: 'release' },
          children: [],
        },
        { id: 'plain', text: 'release notes', children: [] },
      ],
    },
    'release',
  )

  let next = work.next()
  while (!next.done) next = work.next()

  expect(next.value.map(({ id, text, attachment }) => ({ id, text, attachment }))).toEqual([
    { id: 'sized', text: 'Plan', attachment: { id: 'a1', width: 800, height: 240 } },
    { id: 'unsized', text: 'Image', attachment: { id: 'a2' } },
    { id: 'plain', text: 'release notes', attachment: undefined },
  ])
  expect(next.value[0]?.imageExcerpt).toEqual({ text: 'release', matches: [{ start: 0, end: 7 }] })
  expect(next.value[1]?.imageExcerpt?.replacesTitle).toBe(true)
  expect(next.value[2]?.imageExcerpt).toBeUndefined()
})

// @requirement PRODUCT.md §20.14.2
it('shows bounded evidence for image terms, including additional matches and ancestor attribution', () => {
  const searchText = `${'😀'.repeat(13)}xx version Tree Version ${'tail '.repeat(28)}`
  const work = searchNodes(
    {
      roots: [
        {
          id: 'source',
          text: 'Roadmap',
          attachment: { id: 'pic', mimeType: 'image/png', searchText },
          children: [
            { id: 'child', text: 'Release notes', children: [] },
            { id: 'visible', text: 'Release Tree Version', children: [] },
          ],
        },
        { id: 'outside', text: 'Release notes', children: [] },
      ],
    },
    'release tree Version',
  )

  let next = work.next()
  while (!next.done) next = work.next()

  expect(next.value.map(({ id }) => id)).toEqual(['child', 'visible'])
  const excerpt = next.value[0]?.imageExcerpt
  expect(excerpt).toMatchObject({ ancestor: 'Roadmap', text: expect.stringMatching(/^…😀.*…$/u) })
  expect(excerpt!.matches.map(({ start, end }) => excerpt!.text.slice(start, end))).toEqual(['Tree', 'Version'])
  expect(next.value[1]?.imageExcerpt).toBeUndefined()
})

// @requirement PRODUCT.md §20.14.2
// @requirement PRODUCT.md §20.14.3
it('keeps OCR evidence on its ancestor path and never highlights a marker inside an image', () => {
  const source: Document = {
    roots: [
      {
        id: 'outer',
        text: 'Roadmap',
        attachment: { id: 'outer-image', mimeType: 'image/png', searchText: 'tree @Project outer plan' },
        children: [
          {
            id: 'inner',
            text: 'Branch',
            attachment: { id: 'inner-image', mimeType: 'image/png', searchText: 'tree @Project inner' },
            children: [{ id: 'nested', text: 'Release @Project', children: [] }],
          },
          { id: 'sibling', text: 'Release @Project', children: [] },
          {
            id: 'own',
            text: 'Release @Project',
            attachment: { id: 'own-image', mimeType: 'image/png', searchText: 'plan @Project own' },
            children: [],
          },
          { id: 'visible', text: 'Release @Project tree plan', children: [] },
        ],
      },
      { id: 'outside', text: 'Release @Project', children: [] },
    ],
  }

  const matches = results('release tree plan @Project', source)

  expect(matches.map(({ id }) => id)).toEqual(['nested', 'sibling', 'own', 'visible'])
  expect(matches.find(({ id }) => id === 'sibling')?.imageExcerpt).toEqual({
    ancestor: 'Roadmap',
    text: 'tree @Project outer plan',
    matches: [
      { start: 0, end: 4 },
      { start: 20, end: 24 },
    ],
  })
  expect(matches.find(({ id }) => id === 'own')?.imageExcerpt).toEqual({
    text: 'plan @Project own',
    matches: [{ start: 0, end: 4 }],
  })
  expect(matches.find(({ id }) => id === 'visible')?.imageExcerpt).toBeUndefined()
})

// @requirement PRODUCT.md §20.14.2
it('does not reuse an earlier leaf image to explain a later node’s visible match', () => {
  const source: Document = {
    roots: [
      {
        id: 'image',
        text: 'Release',
        attachment: { id: 'pic', mimeType: 'image/png', searchText: 'Tree' },
        children: [],
      },
      { id: 'plain', text: 'Release Tree', children: [] },
    ],
  }

  const matches = results('release tree', source)

  expect(matches.map(({ id }) => id)).toEqual(['image', 'plain'])
  expect(matches[0]?.imageExcerpt?.text).toBe('Tree')
  expect(matches[1]?.imageExcerpt).toBeUndefined()
})

// @requirement PRODUCT.md §20.14.2
it('keeps a clipped image match found after the streaming scan yields', () => {
  const term = `release${'x'.repeat(110)}`
  const context = 'before '.repeat(80)
  const source: Document = {
    roots: [
      {
        id: 'image',
        text: '',
        attachment: { id: 'pic', mimeType: 'image/png', searchText: context + term },
        children: [],
      },
    ],
  }

  const matches = results(term, source)

  expect(matches).toHaveLength(1)
  expect(matches[0]?.imageExcerpt).toEqual({
    text: `…${context.slice(-24)}${term.slice(0, 72)}…`,
    matches: [{ start: 25, end: 97 }],
    replacesTitle: true,
  })
})

// @requirement PRODUCT.md §20.14.2
it.each(['😀', '\u{10000}', '\u{203ff}'])('does not split %s at the trailing excerpt boundary', (character) => {
  const before = `needle ${'x'.repeat(88)}`
  const source: Document = {
    roots: [
      {
        id: 'image',
        text: 'Photo',
        attachment: { id: 'pic', mimeType: 'image/png', searchText: `${before}${character} label` },
        children: [],
      },
    ],
  }

  expect(results('needle', source)[0]?.imageExcerpt).toEqual({
    text: `${before}…`,
    matches: [{ start: 0, end: 6 }],
  })
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

it('includes finished branches', () => {
  const source: Document = {
    roots: [
      {
        id: 'finished',
        text: 'Report',
        struckThrough: true,
        children: [{ id: 'archived', text: 'Report draft', struckThrough: true, children: [] }],
      },
      { id: 'open', text: 'Report outline', children: [] },
    ],
  }
  const callbacks: (() => void)[] = []
  const scheduler = {
    schedule(callback: () => void) {
      callbacks.push(callback)
      return () => undefined
    },
  }
  const visible = vi.fn()

  runNodeSearch(source, 'report', visible, scheduler)
  callbacks.forEach((callback) => callback())

  expect(visible).toHaveBeenCalledExactlyOnceWith([
    expect.objectContaining({ id: 'finished' }),
    expect.objectContaining({ id: 'archived' }),
    expect.objectContaining({ id: 'open' }),
  ])
})

function results(query: string, source = document) {
  const work = searchNodes(source, query)
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

it('matches complete smart-case tags, excluding links and prefixes', () => {
  expect(results('#work').map(({ id }) => id)).toEqual(['a', 'b'])
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
