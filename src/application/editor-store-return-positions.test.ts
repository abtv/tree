import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorStore, type EditorServices } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import type { Location, PersistedView, TreeNode } from '../domain/document'
import { dayNumberOf } from '../domain/calendar-date'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })

function node(id: string, children: TreeNode[] = [], text = id): TreeNode {
  return { id, text, children }
}

// a > b > c > d; a > x > y; other > z. Only `other` carries a date, so Agenda lists it.
const roots: TreeNode[] = [
  node('a', [node('b', [node('c', [node('d')])]), node('x', [node('y')])]),
  node('other', [node('z')], '2026-10-08 Other'),
]

async function open(
  location: Location = { currentParentId: null, selectedNodeId: 'a' },
  view: PersistedView = { expandedIds: [] },
): Promise<{ store: EditorStore; measure: (top: number) => void }> {
  const services: EditorServices = {
    today: () => today,
    load: async () => ({ version: 5, document: { roots }, location, view }),
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    cleanupAttachments: async () => undefined,
  }
  const store = new EditorStore(services, () => 'unused')
  await store.initialize()
  let top = 0
  store.registerSelectedRowTopReader(() => top)
  return { store, measure: (value) => (top = value) }
}

function snapshot(store: EditorStore): ReadySnapshot {
  return store.getSnapshot() as ReadySnapshot
}

function enter(store: EditorStore, measure: (top: number) => void, nodeId: string, top: number): void {
  store.selectNode(nodeId, 0)
  measure(top)
  store.enter()
}

function returnRowTop(store: EditorStore): number | undefined {
  return snapshot(store).focus.returnRowTop
}

afterEach(() => vi.useRealTimers())

// @requirement PRODUCT.md §7.1
describe('return positions when leaving a node', () => {
  it('returns each entered level to its own position on nested leaves', async () => {
    const { store, measure } = await open()
    enter(store, measure, 'a', 300)
    enter(store, measure, 'b', 120)

    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: 'a', selectedNodeId: 'b' })
    expect(returnRowTop(store)).toBe(120)

    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'a' })
    expect(returnRowTop(store)).toBe(300)
  })

  it('restores the selected ancestor through the location path and forgets the levels it skips', async () => {
    const { store, measure } = await open()
    enter(store, measure, 'a', 300)
    enter(store, measure, 'b', 120)
    enter(store, measure, 'c', 80)

    store.navigateToAncestor(null)

    expect(snapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'a' })
    expect(returnRowTop(store)).toBe(300)

    store.visitRecentNode('c')
    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: 'b', selectedNodeId: 'c' })
    expect(returnRowTop(store)).toBeUndefined()

    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: 'a', selectedNodeId: 'b' })
    expect(returnRowTop(store)).toBeUndefined()
  })

  it('uses a position once', async () => {
    const { store, measure } = await open()
    enter(store, measure, 'a', 300)
    store.leave()

    store.visitRecentNode('a')
    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'a' })
    expect(returnRowTop(store)).toBeUndefined()
  })

  it('keeps a position while its node stays on the path and forgets it once navigation leaves it', async () => {
    const { store, measure } = await open()
    enter(store, measure, 'a', 300)

    store.visitRecentNode('x')
    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: 'a', selectedNodeId: 'x' })
    expect(returnRowTop(store)).toBeUndefined()

    store.leave()

    expect(returnRowTop(store)).toBe(300)

    enter(store, measure, 'a', 250)
    store.visitRecentNode('other')
    store.visitRecentNode('x')
    store.leave()
    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'a' })
    expect(returnRowTop(store)).toBeUndefined()
  })

  it('keeps a position while Agenda opens and closes over the entered level', async () => {
    const { store, measure } = await open()
    enter(store, measure, 'a', 300)

    store.openAgenda()
    store.closeAgenda()
    store.leave()

    expect(returnRowTop(store)).toBe(300)
  })

  it('restores nothing when going back shows another list than the one the row stood in', async () => {
    const { store, measure } = await open({ currentParentId: null, selectedNodeId: 'a' }, { expandedIds: ['a'] })

    enter(store, measure, 'b', 200)
    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: 'a', selectedNodeId: 'b' })
    expect(returnRowTop(store)).toBeUndefined()
  })

  it('records no position when entering from Agenda', async () => {
    const { store, measure } = await open()
    measure(200)
    store.openAgenda()
    store.applyAgenda({ kind: 'select', key: `node:${today}:other` })

    store.enter()
    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'other' })
    expect(returnRowTop(store)).toBeUndefined()
  })

  it('replaces an older position of the same node when Agenda enters it again', async () => {
    const { store, measure } = await open()
    enter(store, measure, 'other', 200)
    store.openAgenda()
    store.applyAgenda({ kind: 'select', key: `node:${today}:other` })

    store.enter()
    store.leave()

    expect(snapshot(store).location).toEqual({ currentParentId: null, selectedNodeId: 'other' })
    expect(returnRowTop(store)).toBeUndefined()
  })
})
