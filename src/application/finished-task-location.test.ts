import { expect, it } from 'vitest'
import { buildNodeIndex, type TreeNode } from '../domain/document'
import { expansionFromIds } from './expansion-state'
import { unfinishedTreeLocation } from './finished-task-location'

function task(id: string, children: readonly TreeNode[] = [], finished = false): TreeNode {
  return { id, text: id, children, ...(finished ? { struckThrough: true } : {}) }
}

it('keeps the nearest unfinished parent and chooses the first visible row after a hidden branch', () => {
  const done = task('done', [task('leaf', [], true)], true)
  const parent = task('parent', [task('before'), done, task('next'), task('later')])
  const document = { roots: [task('higher', [parent, task('outside')])] }
  const location = { currentParentId: 'done', selectedNodeId: 'leaf' }

  const target = unfinishedTreeLocation(document, location, expansionFromIds(['done']))

  expect(target).toEqual({ currentParentId: 'parent', selectedNodeId: 'next' })
})

it.each([
  [[], 'parent'],
  [['parent'], 'visible-child'],
] as const)('chooses the previous row according to expansion %j', (expanded, previous) => {
  const parent = task('parent', [task('visible-child'), task('hidden-child', [], true)])
  const document = { roots: [parent, task('last', [], true)] }
  const location = { currentParentId: null, selectedNodeId: 'last' }

  const target = unfinishedTreeLocation(document, location, expansionFromIds(expanded))

  expect(target).toEqual({ currentParentId: null, selectedNodeId: previous })
})

it('keeps the collapsed unfinished ancestor of a saved selection inside a hidden subtree', () => {
  const parent = task('parent', [task('done', [], true), task('sibling')])
  const document = { roots: [parent, task('other')] }
  const location = { currentParentId: null, selectedNodeId: 'done' }

  const target = unfinishedTreeLocation(document, location, expansionFromIds([]))

  expect(target).toEqual({ currentParentId: null, selectedNodeId: 'parent' })
})

it('keeps the open parent and chooses the next visible child after an inline finished row', () => {
  const parent = task('parent', [task('before'), task('done', [], true), task('next')])
  const document = { roots: [parent, task('outside')] }
  const location = { currentParentId: null, selectedNodeId: 'done' }

  const target = unfinishedTreeLocation(document, location, expansionFromIds(['parent']))

  expect(target).toEqual({ currentParentId: null, selectedNodeId: 'next' })
})

it('retains location identity for a visible selection or the existing anchor of an empty root', () => {
  const finished = { roots: [task('first', [], true), task('second', [], true)] }
  const unfinished = { roots: [task('first'), task('second')] }
  const location = { currentParentId: null, selectedNodeId: 'first' }
  const expansion = expansionFromIds([])

  expect(unfinishedTreeLocation(unfinished, location, expansion)).toBe(location)
  expect(unfinishedTreeLocation(finished, location, expansion)).toBe(location)
})

it('returns to the empty root when the selected heading belongs to the only finished branch', () => {
  const document = { roots: [task('branch', [task('leaf', [], true)], true)] }
  const location = { currentParentId: 'branch', selectedNodeId: 'branch' }

  const target = unfinishedTreeLocation(document, location, expansionFromIds([]))

  expect(target).toEqual({ currentParentId: null, selectedNodeId: 'branch' })
})

// @requirement PRODUCT.md §22.1
it('skips a hidden expanded subtree when looking for the next selectable row', () => {
  const children = Array.from({ length: 1000 }, (_, i) => task(`done-${i}`, [], true))
  let reads = 0
  const branch: TreeNode = {
    ...task('branch', [], true),
    get children() {
      reads++
      return children
    },
  }
  const document = { roots: [task('selected', [], true), branch, task('next')] }
  buildNodeIndex(document)
  reads = 0

  const target = unfinishedTreeLocation(
    document,
    { currentParentId: null, selectedNodeId: 'selected' },
    expansionFromIds(['branch']),
  )

  expect(target).toEqual({ currentParentId: null, selectedNodeId: 'next' })
  expect(reads).toBe(0)
})
