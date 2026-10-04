import { expect, it, vi } from 'vitest'
import * as transitions from './editor-command-transitions'
import { EditorStore, type Clock } from './editor-store'
import { createServices, freshIds } from './test/editor-store-arbitraries'

async function lockedStore(): Promise<{ store: EditorStore; services: ReturnType<typeof createServices> }> {
  const services = createServices(
    {
      version: 1,
      document: {
        roots: [
          { id: 'a', text: 'Alpha', children: [] },
          { id: 'b', text: 'Beta', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    },
    () => ({ kind: 'text', text: '' }),
  )
  const clock: Clock = { setTimeout: () => 0, clearTimeout: () => {} }
  const store = new EditorStore(services, freshIds(), clock)
  await store.initialize()
  await store.flushPersistence()
  services.save = async () => {
    throw new Error('disk full')
  }
  store.editText('a', 'Changed')
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(store.flushPersistence()).rejects.toThrow('disk full')
  }
  expect(store.getSnapshot()).toMatchObject({ persistenceLocked: true })
  return { store, services }
}

// @requirement PRODUCT.md §16.2
// @requirement PRODUCT.md §22.1
it('avoids building a reordered document while locked and permits the transition after recovery', async () => {
  const { store, services } = await lockedStore()
  const before = store.getSnapshot()
  // This call count guards allocation work, while the snapshots guard its result.
  const build = vi.spyOn(transitions, 'moveNodeTransition')
  try {
    store.moveNodeTo('a', 2)
    expect(build).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toBe(before)
    services.save = async (state) => {
      services.saves.push(state)
    }
    await store.flushPersistence()
    store.moveNodeTo('a', 2)
    expect(build).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toMatchObject({
      document: { roots: [{ id: 'b' }, { id: 'a', text: 'Changed' }] },
      location: { selectedNodeId: 'a' },
    })
  } finally {
    build.mockRestore()
  }
})

// @requirement PRODUCT.md §16.2
// @requirement PRODUCT.md §22.1
it('avoids building a moved document while locked and permits the move to another parent after recovery', async () => {
  const { store, services } = await lockedStore()
  const before = store.getSnapshot()
  const build = vi.spyOn(transitions, 'moveNodeToParentTransition')
  try {
    expect(store.moveNodeToParent('a', 'b', 0)).toBe(false)
    expect(build).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toBe(before)
    services.save = async (state) => {
      services.saves.push(state)
    }
    await store.flushPersistence()
    expect(store.moveNodeToParent('a', 'b', 0)).toBe(true)
    expect(build).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot()).toMatchObject({
      document: { roots: [{ id: 'b', children: [{ id: 'a', text: 'Changed' }] }] },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
  } finally {
    build.mockRestore()
  }
})
