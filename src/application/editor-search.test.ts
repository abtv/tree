import { afterEach, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'

afterEach(() => vi.useRealTimers())

async function setup() {
  vi.useFakeTimers()
  const services: EditorServices = {
    load: async () => ({
      version: 1,
      document: {
        roots: [
          { id: 'a', text: 'apple apple', children: [{ id: 'b', text: 'apple', children: [] }] },
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
