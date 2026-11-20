import { describe, expect, it } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { HISTORY_LIMIT } from './editor-history'
import { locateNode, type PersistedEditorState, type TreeNode } from '../domain/document'

function node(id: string, children: TreeNode[] = [], starred = false): TreeNode {
  return { id, text: id, ...(starred ? { starred: true as const } : {}), children }
}

async function open(initial: PersistedEditorState): Promise<EditorStore> {
  const services: EditorServices = {
    load: async () => initial,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  let counter = 0
  const store = new EditorStore(services, () => `created${counter++}`)
  await store.initialize()
  return store
}

function snapshot(store: EditorStore): ReadySnapshot {
  return store.getSnapshot() as ReadySnapshot
}

/** Creates a node after `home`, stars it, enters it so it receives a view, leaves and deletes it. */
function starredNodeCycle(store: EditorStore): void {
  store.selectNode('home', 4)
  store.createSiblingOrFirstChild(4)
  store.toggleStarNode()
  store.enter()
  store.leave()
  store.deleteSelected()
}

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §22.1
describe('views of deleted starred nodes', () => {
  it('stay bounded by undo history across many created and deleted starred nodes', async () => {
    const store = await open({
      version: 5,
      document: { roots: [node('home')] },
      location: { currentParentId: null, selectedNodeId: 'home' },
      view: { expandedIds: [] },
    })

    for (let cycle = 0; cycle < 1_000; cycle += 1) starredNodeCycle(store)

    expect(snapshot(store).document.roots.map((root) => root.id)).toEqual(['home'])
    // A cycle adds three history entries, so history can restore about a third of HISTORY_LIMIT
    // deleted nodes; retention keeps at most about twice that many views.
    expect(snapshot(store).expansion.otherViews.size).toBeLessThan(HISTORY_LIMIT)
  })

  it('keeps the view of a deleted node that undo can still restore', async () => {
    const store = await open({
      version: 5,
      document: { roots: [node('project', [node('phase', [node('step')])], true), node('home')] },
      location: { currentParentId: null, selectedNodeId: 'home' },
      view: { expandedIds: [], starredExpandedIds: { project: ['phase'] } },
    })
    store.selectNode('project', 0)
    store.deleteSelected()
    for (let cycle = 0; cycle < 40; cycle += 1) starredNodeCycle(store)
    // Undo followed by a change discards redo history, which releases views no history can restore.
    store.undo()
    starredNodeCycle(store)

    while (locateNode(snapshot(store).document, 'project') === undefined) store.undo()
    store.selectNode('project', 0)
    store.enter()

    expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['phase', 'step'])
  })
})
