import { describe, expect, it } from 'vitest'
import type { Document, NodeId, TreeNode } from '../domain/document'
import { expansionFromViews, type ExpansionState } from './expansion-state'
import { ExpansionViewRetention, MIN_RETAINED_VIEW_SCAN } from './expansion-view-retention'

function tree(id: string, children: TreeNode[] = []): TreeNode {
  return { id, text: id, children }
}

function ids(prefix: string, count: number): NodeId[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${index}`)
}

/** The root view is active; every listed owner has an inactive view. */
function views(owners: readonly NodeId[]): ExpansionState {
  return expansionFromViews(
    ['root-fold'],
    owners.map((id) => [id, [`${id}-fold`]] as const),
  )
}

function owners(state: ExpansionState): (NodeId | null)[] {
  return [...state.otherViews.keys()].sort()
}

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §22.1
describe('ExpansionViewRetention', () => {
  it('keeps every view without reading history while fewer views than the threshold belong to absent nodes', () => {
    const state = views(ids('gone', MIN_RETAINED_VIEW_SCAN - 1))
    let historyReads = 0

    const released = new ExpansionViewRetention().release(state, { roots: [tree('home')] }, () => {
      historyReads += 1
      return []
    })

    expect(released).toBe(state)
    expect(historyReads).toBe(0)
  })

  it('drops only views whose node neither the document nor history contains', () => {
    const shared = tree('shared', [tree('deep')])
    const document: Document = { roots: [tree('present'), tree('project'), shared] }
    const history: Document[] = [
      { roots: [tree('outer', [tree('undoable')]), shared] },
      { roots: [tree('project', [tree('removed')]), shared] },
    ]
    const gone = ids('gone', MIN_RETAINED_VIEW_SCAN - 2)
    const state = views([...gone, 'present', 'undoable', 'removed'])

    const released = new ExpansionViewRetention().release(state, document, () => history)

    expect(owners(released)).toEqual(['present', 'removed', 'undoable'])
    expect(released.otherViews.get('undoable')).toEqual(new Set(['undoable-fold']))
    expect(released.expandedIds).toBe(state.expandedIds)
    expect(released.viewOwnerId).toBeNull()
    expect(state.otherViews.size).toBe(gone.length + 3)
  })

  it('doubles the scan threshold with the views a scan keeps', () => {
    const document: Document = { roots: [tree('home')] }
    const kept = ids('kept', MIN_RETAINED_VIEW_SCAN)
    const retention = new ExpansionViewRetention()
    const reachable = views(kept)

    expect(retention.release(reachable, document, () => [{ roots: kept.map((id) => tree(id)) }])).toBe(reachable)

    const belowThreshold = views([...kept, ...ids('gone', MIN_RETAINED_VIEW_SCAN - 1)])

    expect(retention.release(belowThreshold, document, () => [])).toBe(belowThreshold)

    const atThreshold = views([...kept, ...ids('gone', MIN_RETAINED_VIEW_SCAN)])

    expect(owners(retention.release(atThreshold, document, () => []))).toEqual([])
  })
})
