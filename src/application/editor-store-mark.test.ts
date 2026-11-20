import { expect, it } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { PersistedEditorState } from '../domain/document'
import { locateChangeSite } from './editor-undo-focus'
import { toggleMarkNode } from '../domain/document'

// @requirement PRODUCT.md §2.7
it('locates a mark-only history change at the affected node', () => {
  const document = { roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }] }

  expect(locateChangeSite(document, toggleMarkNode(document, 'child'))).toEqual({
    nodeId: 'child',
    parentId: 'root',
    cursor: 0,
  })
})

// @requirement PRODUCT.md §2.7
it('toggles, undoes, redoes and restores marks through the persistence service', async () => {
  let saved: PersistedEditorState | null = null
  const services: EditorServices = {
    load: async () => saved,
    save: async (state) => {
      saved = JSON.parse(JSON.stringify(state)) as PersistedEditorState
    },
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'root')
  await store.initialize()

  let pending = true
  store.registerPendingEditFinisher(() => {
    if (!pending) return false
    pending = false
    store.editText('root', 'Finished replacement')
    return true
  })

  expect(store.toggleMarkNode()).toBe(true)
  expect(store.starTarget?.marked).toBe(true)
  store.undo()
  expect(store.starTarget?.marked).toBeUndefined()
  expect(store.starTarget?.text).toBe('Finished replacement')
  store.redo()
  await store.flushPersistence()
  const restored = new EditorStore(services, () => 'unused')
  await restored.initialize()

  expect(saved).toMatchObject({ version: 6 })
  expect(restored.starTarget?.marked).toBe(true)
  expect(restored.initialSearchResults()).toEqual([
    { id: 'root', text: 'Finished replacement', path: null, marked: true },
  ])
  restored.toggleMarkNode()
  await restored.flushPersistence()
  expect(restored.starTarget?.marked).toBeUndefined()
})

// @requirement PRODUCT.md §20.14
it('lists marked nodes before starred and recent nodes when Search opens', async () => {
  const services: EditorServices = {
    load: async () => ({
      version: 6,
      document: {
        roots: [
          { id: 'recent', text: 'Recent', children: [] },
          { id: 'star', text: 'Star', starred: true, children: [] },
          { id: 'mark', text: 'Mark', marked: true, children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'recent' },
      view: { expandedIds: [] },
    }),
    loadRecentNodes: async () => ['recent', 'mark', 'star'],
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'unused')
  await store.initialize()

  expect(store.initialSearchResults().map((entry) => entry.id)).toEqual(['mark', 'star', 'recent'])
})
