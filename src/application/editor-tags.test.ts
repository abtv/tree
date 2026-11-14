import { expect, it } from 'vitest'
import { EditorStore } from './editor-store'
import { createServices, freshIds } from './test/editor-store-arbitraries'
import { serializeState } from '../domain/document'

// @requirement PRODUCT.md §20.13
// @requirement PRODUCT.md §20.14
it('routes global Search to independent marker catalogs and suppresses redundant exact suggestions', async () => {
  const services = createServices(
    serializeState(
      { roots: [{ id: 'a', text: '#Anna @Anna_Smith &weekly-review', children: [] }] },
      { currentParentId: null, selectedNodeId: 'a' },
    ),
    () => ({ kind: 'text', text: '' }),
  )
  const store = new EditorStore(services, freshIds('marker-'))
  await store.initialize()

  expect(store.searchNodeSuggestions('#')).toEqual(['Anna'])
  expect(store.searchNodeSuggestions('@')).toEqual(['Anna_Smith'])
  expect(store.searchNodeSuggestions('&')).toEqual(['weekly-review'])
  expect(store.searchNodeSuggestions('@AS')).toEqual([])
  expect(store.searchNodeSuggestions('@anna')).toEqual(['Anna_Smith'])
  expect(store.searchNodeSuggestions('@Anna_Smith')).toEqual([])
  expect(store.searchNodeSuggestions('&weekly-review')).toEqual([])
  for (const [query, expected] of [
    ['@Anna', []],
    ['&Anna_Smith', []],
    ['@anna_smith', ['a']],
    ['@anna_smith #anna &weekly-review', ['a']],
  ] as const) {
    const results = await new Promise<readonly { id: string }[]>((resolve) => store.searchNodes(query, resolve))

    expect(results.map(({ id }) => id)).toEqual(expected)
  }

  store.editText('a', '#Anna')

  expect(store.searchNodeSuggestions('@')).toEqual([])
  expect(store.searchNodeSuggestions('&')).toEqual([])

  store.undo()

  expect(store.searchNodeSuggestions('@')).toEqual(['Anna_Smith'])
  expect(store.searchNodeSuggestions('&')).toEqual(['weekly-review'])
})

// @requirement PRODUCT.md §20.13
it.each(['#', '@', '&'] as const)(
  'publishes whole-document %s names for edits, paste, deletion and history in Tree and Agenda',
  async (prefix) => {
    const document = {
      roots: [
        {
          id: 'a',
          text: `2026-10-08 ${prefix}Work`,
          children: [{ id: 'child', text: `${prefix}hidden`, children: [] }],
        },
        { id: 'b', text: `2026-10-08 ${prefix}work`, children: [] },
      ],
    }
    const services = createServices(serializeState(document, { currentParentId: null, selectedNodeId: 'a' }), () => ({
      kind: 'text',
      text: '',
    }))
    const store = new EditorStore(services, freshIds('tag-'))
    await store.initialize()
    const names = () => store.suggestTags('draft', prefix, 1)?.suggestions ?? []
    const seen: string[][] = []
    const stop = store.subscribe(() => seen.push([...names()]))

    expect(names()).toEqual(['Work', 'hidden', 'work'])

    store.editText('child', `${prefix}new`)

    expect(names()).toEqual(['Work', 'new', 'work'])
    expect(seen.at(-1)).toEqual(['Work', 'new', 'work'])

    store.undo()

    expect(names()).toEqual(['Work', 'hidden', 'work'])

    store.redo()
    store.openAgenda()

    expect(names()).toEqual(['Work', 'new', 'work'])

    store.closeAgenda()
    store.leave()
    store.selectNode('b', 0)
    await store.paste('b', '2026-10-08 #work'.length, async () => ({ kind: 'text', text: ` ${prefix}pasted` }))

    expect(names()).toEqual(['Work', 'new', 'pasted', 'work'])

    store.deleteSelected()

    expect(names()).toEqual(['Work', 'new'])

    store.undo()

    expect(names()).toEqual(['Work', 'new', 'pasted', 'work'])
    stop()
  },
)
