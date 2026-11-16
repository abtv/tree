import { expect, it } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { PersistedEditorState } from '../domain/document'
import { locateChangeSite } from './editor-undo-focus'
import { toggleStarNode } from '../domain/document'

it('locates a star-only history change at the affected node', () => {
  const document = { roots: [{ id: 'root', text: 'Root', children: [{ id: 'child', text: 'Child', children: [] }] }] }

  expect(locateChangeSite(document, toggleStarNode(document, 'child'))).toEqual({
    nodeId: 'child',
    parentId: 'root',
    cursor: 0,
  })
})

it('toggles, undoes, redoes and restores stars through the persistence service', async () => {
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

  expect(store.toggleStarNode()).toBe(true)
  expect(store.starTarget?.starred).toBe(true)
  store.undo()
  expect(store.starTarget?.starred).toBeUndefined()
  expect(store.starTarget?.text).toBe('Finished replacement')
  store.redo()
  await store.flushPersistence()
  const restored = new EditorStore(services, () => 'unused')
  await restored.initialize()

  expect(restored.starTarget?.starred).toBe(true)
  expect(restored.initialSearchResults().map((entry) => entry.id)).toEqual(['root'])
  restored.toggleStarNode()
  await restored.flushPersistence()
  expect(restored.starTarget?.starred).toBeUndefined()
})
