import { expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'

const document = {
  roots: [
    { id: 'a', text: 'Alpha', children: [{ id: 'child', text: 'Child', children: [] }] },
    { id: 'b', text: 'Beta', children: [] },
  ],
}

async function setup() {
  const saveRecentNodes = vi.fn<(ids: readonly string[]) => Promise<void>>(async () => undefined)
  const services: EditorServices = {
    load: async () => ({ version: 1, document, location: { currentParentId: null, selectedNodeId: 'a' } }),
    save: async () => undefined,
    loadRecentNodes: async () => ['child'],
    saveRecentNodes,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  let id = 0
  const store = new EditorStore(services, () => `created${id++}`, {
    setTimeout: () => 1,
    clearTimeout: () => undefined,
  })
  await store.initialize()
  return { store, saveRecentNodes }
}

// @requirement PRODUCT.md §20.14
it('records successful edits, creation and entry, excluding ordinary navigation, folds and undo', async () => {
  const { store, saveRecentNodes } = await setup()
  store.selectNode('b', 2)
  store.toggleExpansion('a')
  store.editText('b', 'Beta')

  expect(store.recentNodes.getIds()).toEqual(['child'])

  store.editText('b', 'Beta changed')
  store.selectNode('a', 0)
  store.enter()

  expect(store.recentNodes.getIds()).toEqual(['a', 'b', 'child'])

  store.createSibling('after')

  expect(store.recentNodes.getIds()[0]).toBe('created0')
  expect(saveRecentNodes).not.toHaveBeenCalled()

  store.undo()

  expect(store.recentNodes.getIds()).toEqual(['a', 'b', 'child'])
  await store.flushPersistence()
  expect(saveRecentNodes).toHaveBeenLastCalledWith(['a', 'b', 'child'])
})

it('reveals the real parent from Agenda, resets caret even on repeated visits and never edits content', async () => {
  const { store } = await setup()
  store.openAgenda()
  store.visitRecentNode('child')
  const first = store.getSnapshot()

  expect(first).toMatchObject({
    document,
    location: { currentParentId: 'a', selectedNodeId: 'child' },
    focus: { nodeId: 'child', cursor: 0 },
  })
  expect(first).not.toHaveProperty('agenda')

  store.selectNode('child', 3)
  store.visitRecentNode('child')

  expect(store.getSnapshot()).toMatchObject({ focus: { nodeId: 'child', cursor: 0 } })
  expect(store.getSnapshot()).not.toBe(first)
  expect(store.recentNodes.getIds()).toEqual(['child'])
})

// @requirement PRODUCT.md §20.14
it('omits only a sole exact tag suggestion and restores completion when the query or catalog changes', async () => {
  const { store } = await setup()
  store.editText('a', 'Alpha #p1 #Work #作')
  const before = store.getSnapshot()

  expect(store.searchNodeSuggestions('#p1')).toEqual([])
  expect(store.searchNodeSuggestions('#Work')).toEqual([])
  expect(store.searchNodeSuggestions('#作')).toEqual([])
  expect(store.searchNodeSuggestions('#p')).toEqual(['p1'])
  expect(store.searchNodeSuggestions('#Wor')).toEqual(['Work'])
  expect(store.searchNodeSuggestions('#work')).toEqual([])
  expect(store.searchNodeSuggestions('#unknown')).toEqual([])
  expect(store.getSnapshot()).toBe(before)

  store.editText('b', 'Beta #p10')

  expect(store.searchNodeSuggestions('#p1')).toEqual(['p1', 'p10'])

  store.undo()

  expect(store.searchNodeSuggestions('#p1')).toEqual([])
})

// @requirement PRODUCT.md §20.14
it('gates short and unknown queries without changing tags, document, selection or history', async () => {
  const { store } = await setup()
  store.editText('a', 'Alpha #w')
  const before = store.getSnapshot()
  const recent = store.recentNodes.getIds()
  const publish = vi.fn()

  store.searchNodes('Al', publish)
  store.searchNodes('#new_tag', publish)
  expect(publish.mock.calls).toEqual([[[]], [[]]])
  expect(store.searchNodeSuggestions('#')).toEqual(['w'])
  await new Promise<void>((resolve) =>
    store.searchNodes('#w', (results) => {
      expect(results.map(({ id }) => id)).toEqual(['a'])
      resolve()
    }),
  )

  expect(store.getSnapshot()).toStrictEqual(before)
  expect(store.recentNodes.getIds()).toBe(recent)
})
