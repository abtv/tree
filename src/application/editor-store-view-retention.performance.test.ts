import { expect, it } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { HISTORY_LIMIT } from './editor-history'
import type { PersistedEditorState, TreeNode } from '../domain/document'

function node(id: string, starred = false): TreeNode {
  return { id, text: id, ...(starred ? { starred: true as const } : {}), children: [] }
}

async function open(initial: PersistedEditorState): Promise<EditorStore> {
  const services: EditorServices = {
    load: async () => initial,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'created')
  await store.initialize()
  return store
}

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §22.1
it('keeps the edit that releases the views of a deleted branch on a 50000-root document within a frame', async () => {
  const projects = Array.from({ length: 32 }, (_, index) => node(`project${index}`, true))
  const roots = [
    { ...node('folder'), children: projects },
    node('home'),
    ...Array.from({ length: 49_999 }, (_, index) => node(`root${index}`)),
  ]
  const store = await open({
    version: 5,
    document: { roots },
    location: { currentParentId: null, selectedNodeId: 'folder' },
    view: { expandedIds: [], starredExpandedIds: Object.fromEntries(projects.map((project) => [project.id, []])) },
  })
  const views = (): number => (store.getSnapshot() as ReadySnapshot).expansion.otherViews.size
  const edit = (index: number): number => {
    store.endTextSession()
    const start = performance.now()
    store.editText('home', `Home ${index}`)
    return performance.now() - start
  }
  store.selectNode('folder', 0)
  store.deleteSelected()
  // The deletion's entry is the oldest; the next edit releases it.
  for (let index = 1; index < HISTORY_LIMIT; index += 1) edit(index)

  expect(views()).toBe(32)

  const elapsed = edit(HISTORY_LIMIT)
  console.info('PERF view-release-edit', { roots: roots.length - 1, elapsedMs: elapsed })

  expect(views()).toBe(0)
  // Without any view release the edit measured about 1 ms; 16 ms is one frame at 60 Hz.
  expect(elapsed).toBeLessThan(16)
})

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §22.1
it('keeps the edit that discards a redo branch of different starred views within a frame', async () => {
  const projects = Array.from({ length: 10_000 }, (_, index) => node(`project${index}`, true))
  const store = await open({
    version: 5,
    document: { roots: [node('home'), ...projects] },
    location: { currentParentId: null, selectedNodeId: 'home' },
    view: { expandedIds: [], starredExpandedIds: Object.fromEntries(projects.map((project) => [project.id, []])) },
  })
  const snapshot = (): ReadySnapshot => store.getSnapshot() as ReadySnapshot
  const samples: number[] = []
  for (let sample = 0; sample < 3; sample += 1) {
    // Each deletion removes a different starred node, so every undo state holds a different set of views.
    for (const project of projects.slice(sample * HISTORY_LIMIT, (sample + 1) * HISTORY_LIMIT)) {
      store.selectNode(project.id, 0)
      store.deleteSelected()
    }
    for (let index = 0; index < HISTORY_LIMIT; index += 1) store.undo()
    store.selectNode('home', 4)

    expect(snapshot().document.roots).toHaveLength(projects.length + 1)

    const start = performance.now()
    store.editText('home', `Home ${sample}`)
    samples.push(performance.now() - start)
    store.endTextSession()

    expect(snapshot().expansion.otherViews.size).toBe(projects.length)
  }
  const median = [...samples].sort((a, b) => a - b)[1]!
  console.info('PERF redo-discard-edit', { views: projects.length, redoEntries: HISTORY_LIMIT, samples, median })

  // Without any view release the edit measured about 0.4 ms; 16 ms is one frame at 60 Hz.
  expect(median).toBeLessThan(16)
})
