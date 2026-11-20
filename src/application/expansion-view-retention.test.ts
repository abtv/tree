import { describe, expect, it } from 'vitest'
import { editNodeText, type Document, type NodeId, type TreeNode } from '../domain/document'
import { COLLAPSED_EXPANSION_STATE, expansionFromViews, type ExpansionState } from './expansion-state'
import { departedViewOwners, releaseViews } from './expansion-view-retention'

function tree(id: string, children: TreeNode[] = []): TreeNode {
  return { id, text: id, children }
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

const document: Document = { roots: [tree('present', [tree('nested')]), tree('active')] }

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §22.1
describe('departedViewOwners', () => {
  it('lists the owners of active and inactive views that leave the document', () => {
    const state = { ...views(['present', 'nested', 'gone']), viewOwnerId: 'active' }
    const replacement: Document = { roots: [tree('present')] }

    expect([...departedViewOwners(state, document, replacement)].sort()).toEqual(['active', 'nested'])
  })

  it('lists no owner when the documents share their node index or no view has an owner', () => {
    const state = views(['present', 'nested'])

    expect(departedViewOwners(state, document, editNodeText(document, 'nested', 'edited'))).toEqual([])
    expect(departedViewOwners(COLLAPSED_EXPANSION_STATE, document, { roots: [tree('other')] })).toEqual([])
  })
})

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §22.1
describe('releaseViews', () => {
  it('drops only the released views whose node the document lacks', () => {
    const state = views(['present', 'released', 'held'])

    const released = releaseViews(state, document, ['present', 'released', 'unknown'])

    expect(owners(released)).toEqual(['held', 'present'])
    expect(released.otherViews.get('held')).toEqual(new Set(['held-fold']))
    expect(released.expandedIds).toBe(state.expandedIds)
    expect(released.viewOwnerId).toBeNull()
    expect(state.otherViews.size).toBe(3)
  })

  it('replaces an unreachable active view with the root view', () => {
    const state: ExpansionState = {
      expandedIds: new Set(['gone-fold']),
      viewOwnerId: 'gone',
      otherViews: new Map([
        [null, new Set(['root-fold'])],
        ['present', new Set(['present-fold'])],
      ]),
    }

    const released = releaseViews(state, document, ['gone'])

    expect(released.viewOwnerId).toBeNull()
    expect(released.expandedIds).toEqual(new Set(['root-fold']))
    expect(owners(released)).toEqual(['present'])
  })

  it('returns the same state when no released view can be dropped', () => {
    const state = views(['present', 'held'])

    expect(releaseViews(state, document, [])).toBe(state)
    expect(releaseViews(state, document, ['present', 'unknown'])).toBe(state)
  })
})
