import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'

afterEach(() => vi.useRealTimers())

async function setup(childCount = 1) {
  vi.useFakeTimers()
  const services: EditorServices = {
    load: async () => ({
      version: 1,
      document: {
        roots: [
          {
            id: 'a',
            text: 'apple apple',
            children: Array.from({ length: childCount }, (_, index) => ({
              id: index === 0 ? 'b' : `b-${index}`,
              text: 'apple',
              children: [],
            })),
          },
          { id: 'c', text: 'apple', children: [{ id: 'd', text: 'apple', children: [] }] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    }),
    save: vi.fn(async () => undefined),
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'new')
  await store.initialize()
  return { store, services, state: () => store.getSnapshot() as ReadySnapshot }
}

it('serializes navigation, reveals only ancestors and cleans search-owned folds', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)
  expect(state().expansion.expandedIds.size).toBe(0)

  store.search.confirm()
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('b')
  expect(state().expansion.expandedIds).toEqual(new Set(['a']))

  store.search.navigate({ nodeId: 'b', offset: 0 }, 1, 2)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('d')

  store.hideSearch()

  expect(state().expansion.expandedIds).toEqual(new Set(['c']))
  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: false })
})

it('does not save query entry and preserves only confirmed recall across presentation changes', async () => {
  const { store, services, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  await vi.runAllTimersAsync()

  expect(services.save).not.toHaveBeenCalled()

  store.search.confirm()
  await vi.runAllTimersAsync()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('draft')
  store.openAgenda()

  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: false })

  store.closeAgenda()
  store.search.begin({ nodeId: state().location.selectedNodeId, offset: 0 })

  expect(store.search.session.getSnapshot().draft).toBe('apple')
})

it('invalidates pending destinations after editing and keeps manual fold choices', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.editText('a', 'changed')
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('a')
  expect(store.search.session.getSnapshot().count?.total).toBe(3)

  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  store.toggleExpansion('a')
  store.toggleExpansion('a')
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 3)
  await vi.runAllTimersAsync()

  store.hideSearch()

  expect(state().expansion.expandedIds.has('a')).toBe(true)
})

it('keeps a newer manual selection authoritative over a pending search jump', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  store.selectNode('c', 0)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('c')
  expect(state().focus?.cursor).toBe(0)
  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: true })
})

it('recounts structural deletion, split, join and history before navigating current text', async () => {
  const { store, state } = await setup()

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  store.deleteSelected() // Removes a and its folded child while confirmation is pending.
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('c')
  expect(store.search.session.getSnapshot().count?.total).toBe(2)

  store.undo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)

  store.redo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(2)

  store.undo()
  store.selectNode('a', 2)
  store.createSiblingOrFirstChild(2)
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(4)

  store.selectNode('a', 0)

  expect(store.joinNodes({ count: 2 }, false)).toBe(true)

  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)

  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1)
  await vi.runAllTimersAsync()

  expect(state().focus).toMatchObject({ nodeId: 'a', cursor: 6 })
})

it('replaces scope after subtree moves and retains recall through Undo and Redo', async () => {
  const { store, state } = await setup()

  store.enter()
  store.search.begin({ nodeId: 'b', offset: 0 })
  store.search.edit('apple')
  store.search.confirm()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(3)
  expect(store.moveNodeToParent('c', 'a', 1)).toBe(true)

  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count?.total).toBe(5)
  expect(store.moveNodeToParent('c', null, 1)).toBe(true)
  expect(store.search.session.getSnapshot()).toMatchObject({ confirmed: 'apple', visible: false })
  expect(state().location.currentParentId).toBeNull()

  store.undo()
  store.redo()
  store.search.begin({ nodeId: 'c', offset: 0 })
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot()).toMatchObject({ draft: 'apple', count: { total: 5 } })
})

it('serializes alternating rapid jumps and discards the remaining queue on mutation', async () => {
  const { store, state } = await setup()
  const origin = { nodeId: 'a', offset: 0 }

  store.search.begin(origin)
  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate(origin, 1, 3)
  store.search.navigate(origin, -1, 2)
  await vi.runAllTimersAsync()

  expect(state().focus).toMatchObject({ nodeId: 'b', cursor: 0 })

  store.search.navigate({ nodeId: 'b', offset: 0 }, 1, 1)
  store.search.navigate({ nodeId: 'b', offset: 0 }, -1, 1)
  store.editText('b', 'pear')
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('b')
  expect(store.search.session.getSnapshot().count?.total).toBe(4)
})

it('refines pending scans and rejects destinations in a removed large folded branch', async () => {
  const { store, state } = await setup(2000)

  store.search.begin({ nodeId: 'a', offset: 0 })
  store.search.edit('absent phrase')
  await vi.advanceTimersToNextTimerAsync()

  store.search.edit('apple')
  store.search.confirm()
  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1500)
  store.deleteSelected()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count).toEqual({ kind: 'count', total: 2, capped: false })
  expect(state().location.selectedNodeId).toBe('c')

  store.undo()
  await vi.runAllTimersAsync()

  expect(store.search.session.getSnapshot().count).toEqual({ kind: 'count', total: 100, capped: true })

  store.search.navigate({ nodeId: 'a', offset: 0 }, 1, 1500)
  await vi.runAllTimersAsync()

  expect(state().location.selectedNodeId).toBe('b-1498')
})
