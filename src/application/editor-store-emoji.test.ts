import { expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'

it.each([
  null,
  {
    version: 1,
    document: { roots: [{ id: 'a', text: 'Text', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'a' },
  },
])('loads emoji preferences before ready and flushes them independently of document history (%s)', async (loaded) => {
  const saveEmojiHistory = vi.fn<(names: readonly string[]) => Promise<void>>(async () => undefined)
  const services: EditorServices = {
    load: async () => loaded,
    loadEmojiHistory: async () => ['rocket'],
    saveEmojiHistory,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'a', { setTimeout: () => 1, clearTimeout: () => undefined })
  await store.initialize()

  expect(store.getSnapshot().status).toBe('ready')
  expect(store.emojiHistory.suggestions[0]?.shortcode).toBe('rocket')
  store.emojiHistory.remember('cat')
  store.undo()
  await store.flushPersistence()

  expect(saveEmojiHistory).toHaveBeenLastCalledWith(['cat', 'rocket'])
})
