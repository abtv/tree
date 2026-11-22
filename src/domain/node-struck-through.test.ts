import { describe, expect, it } from 'vitest'
import { withStruckThrough } from './node-struck-through'
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

const node = (id: string, struck = false, children: TreeNode[] = []): TreeNode => ({
  id,
  text: id,
  ...(struck ? { struckThrough: true as const } : {}),
  children,
})

function flags(document: Document): Array<[string, boolean]> {
  const visit = (entry: TreeNode): Array<[string, boolean]> => [
    [entry.id, entry.struckThrough === true],
    ...entry.children.flatMap(visit),
  ]
  return document.roots.flatMap(visit)
}

// @requirement PRODUCT.md §2.5
describe('independent strikethrough', () => {
  it('returns the same node when the state is unchanged and omits a normal flag', () => {
    const normal = node('normal')
    const struck = node('struck', true)

    expect(withStruckThrough(normal, false)).toBe(normal)
    expect(withStruckThrough(struck, true)).toBe(struck)
    expect(withStruckThrough(normal, true)).toEqual({ ...normal, struckThrough: true })
    expect(withStruckThrough(struck, false)).toEqual({ id: 'struck', text: 'struck', children: [] })
  })

  it('toggles a leaf without changing its parent or ancestors', () => {
    const document = { roots: [node('root', false, [node('parent', false, [node('leaf')])])] }

    const struck = toggleStrikethrough(document, 'leaf', 'leaf')!
    const restored = toggleStrikethrough(struck, 'leaf', 'leaf')!

    expect(flags(struck)).toEqual([
      ['root', false],
      ['parent', false],
      ['leaf', true],
    ])
    expect(restored).toEqual(document)
  })

  it('toggles a parent without changing its children and keeps its subtree shared', () => {
    const children = [node('done', true), node('open')]
    const document = { roots: [node('root', false, [node('task', false, children)])] }

    const struck = toggleStrikethrough(document, 'task', 'task')!
    const restored = toggleStrikethrough(struck, 'task', 'task')!

    expect(flags(struck)).toEqual([
      ['root', false],
      ['task', true],
      ['done', true],
      ['open', false],
    ])
    expect(requireNode(struck, 'task').node.children).toBe(children)
    expect(restored).toEqual(document)
  })

  it('uses one target for a reverse Visual sibling range and leaves descendants alone', () => {
    const document = {
      roots: [node('a', true, [node('a1')]), node('b', false, [node('b1', true)]), node('other')],
    }

    const struck = toggleStrikethrough(document, 'b', 'a')!
    const restored = toggleStrikethrough(struck, 'a', 'b')!

    expect(flags(struck)).toEqual([
      ['a', true],
      ['a1', false],
      ['b', true],
      ['b1', true],
      ['other', false],
    ])
    expect(struck.roots[0]).toBe(document.roots[0])
    expect(struck.roots[2]).toBe(document.roots[2])
    expect(flags(restored)).toEqual([
      ['a', false],
      ['a1', false],
      ['b', false],
      ['b1', true],
      ['other', false],
    ])
  })

  it.each([false, true])('keeps a parent %s when its children are added, removed, or all struck', (struck) => {
    const document = { roots: [node('root', struck, [node('task', struck, [node('last', !struck)])])] }

    const added = createFirstChild(document, 'task', 'new')
    const removed = deleteNode(document, 'last')
    const toggled = toggleStrikethrough(document, 'last', 'last')!

    for (const result of [added, removed, toggled]) {
      expect(requireNode(result, 'root').node.struckThrough === true).toBe(struck)
      expect(requireNode(result, 'task').node.struckThrough === true).toBe(struck)
    }
    expect(requireNode(added, 'new').node).not.toHaveProperty('struckThrough')
  })

  it('moves a subtree without changing either parent or the moved nodes', () => {
    const moving = node('open')
    const document = {
      roots: [
        node('root', false, [node('a', false, [node('done', true), moving]), node('b', true, [node('b1', true)])]),
      ],
    }

    const result = moveSubtree(document, 'open', 'b', 1)

    if (result.kind !== 'moved') throw new Error('Expected move')
    expect(flags(result.document)).toEqual([
      ['root', false],
      ['a', false],
      ['done', true],
      ['b', true],
      ['b1', true],
      ['open', false],
    ])
    expect(requireNode(result.document, 'open').node).toBe(moving)
  })

  it('keeps the states of shifted, joined, and replaced nodes and their parents', () => {
    const document = { roots: [node('a', false, [node('a1', true)]), node('b', true, [node('b1')])] }

    const shifted = shiftSiblingRange(document, 'b', 1, 'in')
    const joined = joinSiblingRange(document, 'a', 2, false)
    const replaced = replaceSiblingRange(document, 'b1', 1, [node('new', true)])

    if (shifted.kind !== 'moved' || joined.kind !== 'joined') throw new Error('Expected structural changes')
    expect(flags(shifted.document)).toEqual([
      ['a', false],
      ['a1', true],
      ['b', true],
      ['b1', false],
    ])
    expect(flags(joined.document)).toEqual([
      ['a', false],
      ['a1', true],
      ['b1', false],
    ])
    expect(flags(replaced)).toEqual([
      ['a', false],
      ['a1', true],
      ['b', true],
      ['new', true],
    ])

    const out = shiftSiblingRange(shifted.document, 'b', 1, 'out')

    if (out.kind !== 'moved') throw new Error('Expected outdent')
    expect(out.document).toEqual(document)
  })

  it('loads every saved parent and child flag unchanged', () => {
    const done = { ...node('done', true), attachment: { id: 'image', mimeType: 'image/png' as const } }
    const input = {
      version: 4,
      document: {
        roots: [node('parent', true, [node('open')]), node('other', false, [done])],
      },
      location: { currentParentId: null, selectedNodeId: 'parent' },
      view: { expandedIds: [] },
    }

    const parsed = parsePersistedState(input)

    expect(flags(parsed.document)).toEqual([
      ['parent', true],
      ['open', false],
      ['other', false],
      ['done', true],
    ])
    expect(requireNode(parsed.document, 'done').node.attachment).toEqual(done.attachment)
  })

  it('does not inspect sibling or descendant states while typing or toggling', () => {
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
    const document = {
      roots: [node('root', true, [node('middle', true, [node('parent', false, [node('typing')]), ...peers])])],
    }
    requireNode(document, 'typing')
    reads = 0

    const edited = editNodeText(document, 'typing', 'new text')
    const toggled = toggleStrikethrough(document, 'parent', 'parent')!

    expect(reads).toBe(0)
    expect(edited.roots[0]!.struckThrough).toBe(true)
    expect(requireNode(toggled, 'parent').node.struckThrough).toBe(true)
    expect(requireNode(toggled, 'middle').node.children[1]).toBe(peers[0])
  })
})
