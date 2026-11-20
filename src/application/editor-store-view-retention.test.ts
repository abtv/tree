import { afterEach, describe, expect, it, vi } from 'vitest'
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
    // 1970-04-11
    today: () => 100,
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

/** Creates an unstarred node after `home` and deletes it: two undo entries. */
function unstarredNodeCycle(store: EditorStore): void {
  store.selectNode('home', 4)
  store.createSiblingOrFirstChild(4)
  store.deleteSelected()
}

afterEach(() => {
  vi.useRealTimers()
})

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
    // A cycle adds three history entries, so history can restore at most a third of HISTORY_LIMIT
    // deleted nodes, and only their views remain.
    expect(snapshot(store).expansion.otherViews.size).toBeLessThanOrEqual(Math.ceil(HISTORY_LIMIT / 3))
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

  it('stay while redo can restore the node and are dropped when a change discards that redo', async () => {
    const store = await open({
      version: 5,
      document: { roots: [node('home')] },
      location: { currentParentId: null, selectedNodeId: 'home' },
      view: { expandedIds: [] },
    })
    store.selectNode('home', 4)
    store.createSiblingOrFirstChild(4)
    store.toggleStarNode()
    store.enter()
    store.leave()
    // Removes the star, then the node.
    store.undo()
    store.undo()

    expect(snapshot(store).expansion.otherViews.has('created0')).toBe(true)

    store.redo()
    store.redo()
    store.undo()
    store.undo()
    store.editText('home', 'Home')

    expect(snapshot(store).expansion.otherViews.has('created0')).toBe(false)
  })

  it('are dropped when the node of the view Tree keeps active under Agenda becomes unreachable', async () => {
    const store = await open({
      version: 5,
      document: { roots: [node('home')] },
      location: { currentParentId: null, selectedNodeId: 'home' },
      view: { expandedIds: [] },
    })
    store.selectNode('home', 4)
    store.createSiblingOrFirstChild(4)
    store.toggleStarNode()
    store.enter()
    store.openAgenda()
    // Removes the star, then the node, while Tree keeps the node's view active.
    store.undo()
    store.undo()
    // Discards the redo branch, the last history that holds the node.
    store.editText('home', 'Home')

    store.closeAgenda()

    expect(snapshot(store).expansion.viewOwnerId).toBeNull()
    expect(snapshot(store).expansion.otherViews.has('created0')).toBe(false)
  })

  it('leave Agenda Find the days it opened when the Tree view under Agenda is released', async () => {
    vi.useFakeTimers()
    const store = await open({
      version: 5,
      document: {
        roots: [
          node('home'),
          { id: 'a', text: 'needle one 1970-04-11', children: [] },
          { id: 'b', text: 'needle two 1970-04-12', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'home' },
      view: { expandedIds: [] },
    })
    store.selectNode('home', 4)
    store.createSiblingOrFirstChild(4)
    store.toggleStarNode()
    store.enter()
    store.openAgenda()
    store.undo()
    store.undo()
    store.applyAgenda({ kind: 'fold', key: 'day:100', operation: 'close' })
    store.applyAgenda({ kind: 'fold', key: 'day:101', operation: 'close' })
    store.applyAgenda({ kind: 'select', key: 'day:100', cursor: 0 })
    store.search.begin(store.searchOrigin(0))
    store.search.edit('needle')
    store.search.confirm()
    await vi.runAllTimersAsync()
    store.search.navigate(store.searchOrigin(0), 1, 1)
    await vi.runAllTimersAsync()

    expect(snapshot(store).agenda?.selectedKey).toBe('node:101:b')

    // Discards the redo branch, so the Tree view of the removed node is released.
    store.editText('b', 'needle revised 1970-04-12')
    store.hideSearch()

    expect(snapshot(store).expansion.viewOwnerId).toBeNull()
    expect(snapshot(store).agenda?.collapsed.has('day:100')).toBe(true)
    expect(snapshot(store).agenda?.collapsed.has('day:101')).toBe(false)
  })

  it('are dropped after a bulk deletion as soon as history no longer holds the deleted branch', async () => {
    const projects = Array.from({ length: 500 }, (_, index) =>
      node(`project${index}`, [node(`phase${index}`, [node(`step${index}`)])], true),
    )
    const store = await open({
      version: 5,
      document: { roots: [node('folder', projects), node('home')] },
      location: { currentParentId: null, selectedNodeId: 'folder' },
      view: {
        expandedIds: [],
        starredExpandedIds: Object.fromEntries(projects.map((project, index) => [project.id, [`phase${index}`]])),
      },
    })
    // A separate edit first: history still holds the branch when it releases this older entry.
    store.editText('home', 'Home')
    store.selectNode('folder', 0)
    store.deleteSelected()
    // With the edit and the deletion, history is now exactly full.
    for (let cycle = 0; cycle < HISTORY_LIMIT / 2 - 1; cycle += 1) unstarredNodeCycle(store)

    expect(snapshot(store).expansion.otherViews.size).toBe(500)

    // Releases the edit, then the deletion, the last entry that holds the branch.
    unstarredNodeCycle(store)

    expect(snapshot(store).expansion.otherViews.size).toBe(0)
  })
})
