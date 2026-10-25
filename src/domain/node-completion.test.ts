import { describe, expect, it } from 'vitest'
import {
  createFirstChild,
  deleteNode,
  editNodeText,
  joinSiblingRange,
  moveSubtree,
  parsePersistedState,
  replaceSiblingRange,
  requireNode,
  shiftSiblingRange,
  toggleStrikethrough,
  type Document,
  type TreeNode,
} from './document'

const leaf = (id: string, complete = false): TreeNode => ({
  id,
  text: id,
  ...(complete ? { struckThrough: true as const } : {}),
  children: [],
})

function branch(id: string, children: TreeNode[]): TreeNode {
  return {
    ...leaf(
      id,
      children.every((child) => child.struckThrough),
    ),
    children,
  }
}

function flags(document: Document): Array<[string, boolean]> {
  const visit = (node: TreeNode): Array<[string, boolean]> => [
    [node.id, node.struckThrough === true],
    ...node.children.flatMap(visit),
  ]
  return document.roots.flatMap(visit)
}

// @requirement PRODUCT.md §2.5
describe('hierarchical completion', () => {
  it('completes a mixed subtree and its ancestors, then reopens every descendant', () => {
    const document = { roots: [branch('root', [branch('task', [leaf('done', true), leaf('open')])])] }

    const complete = toggleStrikethrough(document, 'task', 'task')!
    const reopened = toggleStrikethrough(complete, 'task', 'task')!

    expect(flags(complete)).toEqual([
      ['root', true],
      ['task', true],
      ['done', true],
      ['open', true],
    ])
    expect(flags(reopened)).toEqual([
      ['root', false],
      ['task', false],
      ['done', false],
      ['open', false],
    ])
    expect(requireNode(document, 'done').node.struckThrough).toBe(true)
    expect(requireNode(document, 'open').node.struckThrough).toBeUndefined()
  })

  it('recalculates ancestors when the last incomplete leaf is toggled', () => {
    const document = { roots: [branch('root', [leaf('done', true), branch('task', [leaf('open')])])] }

    const complete = toggleStrikethrough(document, 'open', 'open')!

    expect(flags(complete).every(([, done]) => done)).toBe(true)
    expect(complete.roots[0]!.children[0]).toBe(document.roots[0]!.children[0])
  })

  it('uses one completion target for a reverse Visual sibling range', () => {
    const document = { roots: [branch('a', [leaf('a1', true)]), branch('b', [leaf('b1')]), leaf('other')] }

    const complete = toggleStrikethrough(document, 'b', 'a')!

    expect(flags(complete)).toEqual([
      ['a', true],
      ['a1', true],
      ['b', true],
      ['b1', true],
      ['other', false],
    ])
    expect(complete.roots[2]).toBe(document.roots[2])
  })

  it.each([false, true])('keeps completion %s when the last child is removed', (done) => {
    const document = { roots: [branch('root', [branch('task', [leaf('last', done)])])] }

    const removed = deleteNode(document, 'last')

    expect(flags(removed)).toEqual([
      ['root', done],
      ['task', done],
    ])
    expect(requireNode(removed, 'task').node.children).toEqual([])
  })

  it('reopens ancestors on creation and completes them when the incomplete child is removed', () => {
    const document = { roots: [branch('root', [branch('task', [leaf('done', true)])])] }

    const added = createFirstChild(document, 'task', 'new')
    const removed = deleteNode(added, 'new')

    expect(flags(added)).toEqual([
      ['root', false],
      ['task', false],
      ['new', false],
      ['done', true],
    ])
    expect(removed).toEqual(document)
  })

  it('updates both move paths and their common ancestor without changing the moved subtree', () => {
    const moving = leaf('open')
    const document = {
      roots: [branch('root', [branch('a', [leaf('done', true), moving]), branch('b', [leaf('b1', true)])])],
    }

    const result = moveSubtree(document, 'open', 'b', 1)

    expect(result.kind).toBe('moved')
    if (result.kind !== 'moved') throw new Error('Expected move')
    expect(flags(result.document)).toEqual([
      ['root', false],
      ['a', true],
      ['done', true],
      ['b', false],
      ['b1', true],
      ['open', false],
    ])
    expect(requireNode(result.document, 'open').node).toBe(moving)
  })

  it('recalculates shifted, joined, and replaced parent nodes', () => {
    const document = { roots: [branch('a', [leaf('a1', true)]), branch('b', [leaf('b1')])] }

    const shifted = shiftSiblingRange(document, 'b', 1, 'in')
    const joined = joinSiblingRange(document, 'a', 2, false)
    const replaced = replaceSiblingRange(document, 'b1', 1, [leaf('new', true)])

    if (shifted.kind !== 'moved' || joined.kind !== 'joined') throw new Error('Expected structural changes')
    expect(shifted.document.roots[0]!.struckThrough).toBeUndefined()
    expect(joined.document.roots[0]!.struckThrough).toBeUndefined()
    expect(replaced.roots[1]!.struckThrough).toBe(true)

    const out = shiftSiblingRange(shifted.document, 'b', 1, 'out')

    if (out.kind !== 'moved') throw new Error('Expected outdent')
    expect(out.document).toEqual(document)
  })

  it('loads old parent flags from leaf states without changing the input or metadata', () => {
    const done = { ...leaf('done', true), attachment: { id: 'image', mimeType: 'image/png' as const } }
    const input = {
      version: 4,
      document: {
        roots: [
          { ...leaf('parent', true), children: [leaf('open')] },
          { ...leaf('other'), children: [done] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
      view: { expandedIds: [] },
    }

    const parsed = parsePersistedState(input)

    expect(flags(parsed.document)).toEqual([
      ['parent', false],
      ['open', false],
      ['other', true],
      ['done', true],
    ])
    expect(requireNode(parsed.document, 'done').node.attachment).toEqual(done.attachment)
    expect(input.document.roots[0]!.struckThrough).toBe(true)
    expect(input.document.roots[1]!.struckThrough).toBeUndefined()
  })

  it('does not inspect sibling completion or off-path descendants while typing', () => {
    let reads = 0
    const peers: TreeNode[] = Array.from({ length: 10_000 }, (_, index) => ({
      id: `peer-${index}`,
      text: 'peer',
      children: [],
      get struckThrough() {
        reads += 1
        return true as const
      },
    }))
    const document = { roots: [branch('root', [leaf('typing', true), ...peers])] }
    requireNode(document, 'typing')
    reads = 0

    const edited = editNodeText(document, 'typing', 'new text')

    expect(reads).toBe(0)
    expect(edited.roots[0]!.struckThrough).toBe(true)
    expect(edited.roots[0]!.children[1]).toBe(peers[0])
  })

  it('completes a large selected subtree without traversing an unrelated subtree', () => {
    let reads = 0
    const children = Array.from({ length: 10_000 }, (_, index) => leaf(`other-${index}`))
    const unrelated: TreeNode = {
      id: 'other',
      text: 'other',
      get children() {
        reads += 1
        return children
      },
    }
    const document = {
      roots: [
        branch(
          'task',
          Array.from({ length: 10_000 }, (_, index) => leaf(`step-${index}`)),
        ),
        unrelated,
      ],
    }
    requireNode(document, 'task')
    reads = 0

    const result = toggleStrikethrough(document, 'task', 'task')!

    expect(result.roots[0]!.struckThrough).toBe(true)
    expect(result.roots[0]!.children.every((child) => child.struckThrough)).toBe(true)
    expect(result.roots[1]).toBe(unrelated)
    // Attachment accounting may initialize its existing document summary on first use.
    const initializedReads = reads

    toggleStrikethrough(result, 'task', 'task')

    expect(reads).toBe(initializedReads)
  })
})
