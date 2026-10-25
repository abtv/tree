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
