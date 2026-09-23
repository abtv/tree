import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  assertDocument,
  attachImage,
  attachmentSummary,
  cloneNode,
  cloneNodeWithNewIds,
  collectAttachmentIds,
  createFirstChild,
  deleteLink,
  deleteNode,
  editNodeContent,
  editNodeText,
  ensureRoot,
  insertSiblingAfter,
  insertSiblingBefore,
  insertSubtreeSibling,
  isValidLocation,
  locateNode,
  moveSibling,
  nodePath,
  parsePersistedState,
  pasteMultilineText,
  pasteText,
  removeTextRange,
  replaceSiblingRange,
  serializeState,
  splitNode,
  validatePersistedState,
  MAX_DOCUMENT_DEPTH,
  type Document,
  type LocatedNode,
  type Location,
  type TreeNode,
} from './document'

interface RawNode {
  text: string
  hasAttachment: boolean
  children: RawNode[]
}

function rawNode(depth: number): fc.Arbitrary<RawNode> {
  if (depth === 0) {
    return fc.record<RawNode>({ text: fc.string(), hasAttachment: fc.boolean(), children: fc.constant<RawNode[]>([]) })
  }
  return fc.record<RawNode>({
    text: fc.string(),
    hasAttachment: fc.boolean(),
    children: fc.array(rawNode(depth - 1), { maxLength: 3 }),
  })
}

const forest = fc.array(rawNode(2), { minLength: 1, maxLength: 4 })

function materialize(rawForest: RawNode[]): Document {
  let counter = 0
  const build = (raw: RawNode): TreeNode => {
    const id = `n${counter++}`
    return {
      id,
      text: raw.text,
      ...(raw.hasAttachment ? { attachment: { id: `a${id}`, mimeType: 'image/png' as const } } : {}),
      children: raw.children.map(build),
    }
  }
  return { roots: rawForest.map(build) }
}

function allNodes(document: Document): TreeNode[] {
  const nodes: TreeNode[] = []
  const visit = (node: TreeNode): void => {
    nodes.push(node)
    node.children.forEach(visit)
  }
  document.roots.forEach(visit)
  return nodes
}

function allIds(document: Document): string[] {
  return allNodes(document).map((node) => node.id)
}

function maxDepth(document: Document): number {
  let maximum = 0
  const stack = document.roots.map((node) => ({ node, depth: 1 }))
  while (stack.length > 0) {
    const entry = stack.pop()!
    maximum = Math.max(maximum, entry.depth)
    entry.node.children.forEach((child) => stack.push({ node: child, depth: entry.depth + 1 }))
  }
  return maximum
}

function subtreeIds(node: TreeNode): string[] {
  const ids: string[] = []
  const visit = (current: TreeNode): void => {
    ids.push(current.id)
    current.children.forEach(visit)
  }
  visit(node)
  return ids
}

function pick(document: Document, seed: number): TreeNode {
  const nodes = allNodes(document)
  return nodes[seed % nodes.length]!
}

function locationFor(document: Document, node: TreeNode): Location {
  const located = locateNode(document, node.id)!
  return { currentParentId: located.parent?.id ?? null, selectedNodeId: node.id }
}

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(length, value))
}

function positionOf(text: string, cursor: number): number {
  const position = clamp(cursor, text.length)
  if (position > 0 && position < text.length) {
    const before = text.charCodeAt(position - 1)
    const after = text.charCodeAt(position)
    if (before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff) {
      return position - 1
    }
  }
  return position
}

interface NormalizedLocation {
  nodeId: string
  parentId: string | null
  siblingIds: string[]
  index: number
  ancestorIds: string[]
}

function normalizeLocation(located: LocatedNode | undefined): NormalizedLocation | undefined {
  if (located === undefined) return undefined
  return {
    nodeId: located.node.id,
    parentId: located.parent?.id ?? null,
    siblingIds: located.siblings.map((node) => node.id),
    index: located.index,
    ancestorIds: located.ancestors.map((node) => node.id),
  }
}

function locateNodeReference(document: Document, id: string): NormalizedLocation | undefined {
  const parents = new Map<TreeNode, TreeNode | null>()
  const stack: TreeNode[] = []
  for (let index = document.roots.length - 1; index >= 0; index -= 1) {
    const node = document.roots[index]!
    parents.set(node, null)
    stack.push(node)
  }
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.id === id) {
      const parent = parents.get(node) ?? null
      const siblings = parent === null ? document.roots : parent.children
      const ancestors: string[] = []
      let current = parent
      while (current !== null) {
        ancestors.push(current.id)
        current = parents.get(current) ?? null
      }
      ancestors.reverse()
      return {
        nodeId: node.id,
        parentId: parent?.id ?? null,
        siblingIds: siblings.map((sibling) => sibling.id),
        index: siblings.indexOf(node),
        ancestorIds: ancestors,
      }
    }
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]!
      parents.set(child, node)
      stack.push(child)
    }
  }
  return undefined
}

describe('document invariants', () => {
  it('round-trips any valid document and location through serialization', () => {
    fc.assert(
      fc.property(forest, fc.nat(), (rawForest, seed) => {
        const document = materialize(rawForest)
        expect(maxDepth(document)).toBeLessThanOrEqual(MAX_DOCUMENT_DEPTH)
        const node = pick(document, seed)
        const state = serializeState(document, locationFor(document, node))

        expect(state.document).toBe(document)
        expect(validatePersistedState(state)).toBe(state)
        expect(parsePersistedState(JSON.parse(JSON.stringify(state)))).toEqual(state)
      }),
    )
  })

  it('splitNode reconstructs the text and keeps the image and children on the original', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.integer({ min: -2, max: 40 }), (rawForest, seed, cursor) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        const before = locateNode(document, node.id)!.node

        const result = splitNode(document, node.id, cursor, 'split-node')
        const located = locateNode(result, node.id)!
        const created = located.siblings[located.index + 1]!
        const position = positionOf(before.text, cursor)

        expect(located.node.text + created.text).toBe(before.text)
        expect(located.node.text).toBe(before.text.slice(0, position))
        expect(created.text).toBe(before.text.slice(position))
        expect(created.attachment).toBeUndefined()
        expect(located.node.attachment).toEqual(before.attachment)
        expect(located.node.children).toEqual(before.children)
      }),
    )
  })

  it('insertSiblingBefore preserves the selected node and places one empty sibling before it', () => {
    fc.assert(
      fc.property(forest, fc.nat(), (rawForest, seed) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        const before = locateNode(document, node.id)!

        const result = insertSiblingBefore(document, node.id, 'inserted')
        const located = locateNode(result, node.id)!
        const created = located.siblings[located.index - 1]

        expect(created).toEqual({ id: 'inserted', text: '', children: [] })
        expect(located.node).toEqual(before.node)
        expect(allIds(result)).toContain('inserted')
        expect(subtreeIds(located.node)).toEqual(subtreeIds(before.node))
      }),
    )
  })

  it('pasteText inserts at the clamped cursor and leaves every other node intact', () => {
    fc.assert(
      fc.property(
        forest,
        fc.nat(),
        fc.integer({ min: -2, max: 40 }),
        fc.string(),
        (rawForest, seed, cursor, insert) => {
          const document = materialize(rawForest)
          const node = pick(document, seed)
          const before = locateNode(document, node.id)!.node

          const result = pasteText(document, node.id, cursor, insert)
          const after = locateNode(result, node.id)!.node
          const position = positionOf(before.text, cursor)

          expect(after.text).toBe(before.text.slice(0, position) + insert + before.text.slice(position))
          expect(allIds(result)).toEqual(allIds(document))
        },
      ),
    )
  })

  it('keeps a pasted HTTP link range aligned with its URL text', () => {
    fc.assert(
      fc.property(fc.integer({ min: -10, max: 10 }), (cursor) => {
        const document = { roots: [{ id: 'root', text: 'prefix', children: [] }] }
        const result = pasteText(document, 'root', cursor, 'https://example.com')
        const node = result.roots[0]!
        const link = node.links?.[0]
        expect(link).toBeDefined()
        expect(node.text.slice(link!.start, link!.end)).toBe(link!.url)
      }),
    )
  })

  it('pasteMultilineText inserts the lines and moves the image to the final node', () => {
    fc.assert(
      fc.property(
        forest,
        fc.nat(),
        fc.integer({ min: -2, max: 40 }),
        fc.array(fc.string(), { minLength: 2, maxLength: 4 }),
        (rawForest, seed, cursor, lines) => {
          const document = materialize(rawForest)
          const node = pick(document, seed)
          const before = locateNode(document, node.id)!.node
          const position = positionOf(before.text, cursor)
          const suffix = before.text.slice(position)
          const ids = lines.slice(1).map((_, index) => `pasted-${index}`)

          const result = pasteMultilineText(document, node.id, cursor, lines, ids)
          const located = locateNode(result, node.id)!
          const created = located.siblings.slice(located.index + 1, located.index + 1 + ids.length)

          expect(located.node.text).toBe(before.text.slice(0, position) + lines[0])
          expect(located.node.attachment).toBeUndefined()
          expect(created.map((entry) => entry.id)).toEqual(ids)
          expect(created.map((entry) => entry.text)).toEqual(
            lines.slice(1).map((line, index) => (index === lines.length - 2 ? line + suffix : line)),
          )
          expect(created.at(-1)!.attachment).toEqual(before.attachment)
        },
      ),
    )
  })

  it('moveSibling permutes siblings and preserves subtrees and ids', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.integer({ min: -2, max: 20 }), (rawForest, seed, destination) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        const located = locateNode(document, node.id)!

        const result = moveSibling(document, node.id, destination)
        const moved = locateNode(result, node.id)!

        expect(
          moved.siblings
            .map((entry) => entry.id)
            .slice()
            .sort(),
        ).toEqual(
          located.siblings
            .map((entry) => entry.id)
            .slice()
            .sort(),
        )
        expect(moved.node.children).toEqual(located.node.children)
        expect(allIds(result).slice().sort()).toEqual(allIds(document).slice().sort())
      }),
    )
  })

  it('moveSibling to the current index is a no-op', () => {
    fc.assert(
      fc.property(forest, fc.nat(), (rawForest, seed) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        const index = locateNode(document, node.id)!.index

        const result = moveSibling(document, node.id, index)

        expect(allIds(result)).toEqual(allIds(document))
      }),
    )
  })

  it('deleteNode removes exactly the selected subtree', () => {
    fc.assert(
      fc.property(forest, fc.nat(), (rawForest, seed) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        const removed = subtreeIds(node)

        const result = deleteNode(document, node.id)
        const remaining = allIds(result)

        expect(remaining.length).toBe(allIds(document).length - removed.length)
        for (const id of removed) {
          expect(remaining).not.toContain(id)
        }
      }),
    )
  })

  it('locates every node with a path ending at it and a valid location', () => {
    fc.assert(
      fc.property(forest, (rawForest) => {
        const document = materialize(rawForest)
        const nodes = allNodes(document)

        for (const node of nodes) {
          const located = locateNode(document, node.id)!
          expect(located.node.id).toBe(node.id)
          expect(nodePath(document, node.id).at(-1)!.id).toBe(node.id)
          expect(nodePath(document, node.id).length).toBe(located.ancestors.length + 1)
          expect(isValidLocation(document, locationFor(document, node))).toBe(true)
        }

        expect(collectAttachmentIds(document).size).toBe(nodes.filter((node) => node.attachment !== undefined).length)
      }),
    )
  })

  it('rejects duplicate node ids', () => {
    fc.assert(
      fc.property(forest, (rawForest) => {
        const document = materialize(rawForest)
        const duplicate: Document = {
          roots: [...document.roots, { ...cloneNode(document.roots[0]!), children: [] }],
        }

        expect(() => assertDocument(duplicate)).toThrow('unique')
      }),
    )
  })

  it('rejects a location that does not match the tree', () => {
    fc.assert(
      fc.property(forest, fc.nat(), (rawForest, seed) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)

        expect(() => serializeState(document, { currentParentId: 'missing', selectedNodeId: node.id })).toThrow()
      }),
    )
  })

  it('does not mutate its input document for any operation', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.integer({ min: -2, max: 40 }), fc.string(), (rawForest, seed, cursor, text) => {
        const document = materialize(rawForest)
        const before = JSON.parse(JSON.stringify(document)) as Document
        const node = pick(document, seed)

        editNodeText(document, node.id, text)
        editNodeContent(document, node.id, text, [])
        deleteLink(document, node.id, cursor)
        removeTextRange(document, node.id, cursor, cursor + 1)
        insertSiblingAfter(document, node.id, 'new-after')
        insertSiblingBefore(document, node.id, 'new-before')
        createFirstChild(document, node.id, 'new-child')
        splitNode(document, node.id, cursor, 'new-split')
        deleteNode(document, node.id)
        moveSibling(document, node.id, cursor)
        pasteText(document, node.id, cursor, text)
        pasteMultilineText(document, node.id, cursor, [text, text], ['pasted-node'])
        attachImage(document, node.id, { id: 'new-attachment', mimeType: 'image/png' })
        ensureRoot(document, 'new-root')

        expect(JSON.parse(JSON.stringify(document))).toEqual(before)
      }),
    )
  })

  it('shares every node outside the edited path by reference', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.integer({ min: -2, max: 40 }), fc.string(), (rawForest, seed, cursor, text) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        let copiedId = 0
        const located = locateNode(document, node.id)!
        const path = new Set<string>([...located.ancestors.map((ancestor) => ancestor.id), node.id])
        const before = new Map(allNodes(document).map((entry) => [entry.id, entry]))
        const results: Document[] = [
          editNodeText(document, node.id, text),
          editNodeContent(document, node.id, text, []),
          deleteLink(document, node.id, cursor) ?? document,
          removeTextRange(document, node.id, cursor, cursor + 1),
          insertSiblingAfter(document, node.id, 'new-after'),
          insertSiblingBefore(document, node.id, 'new-before'),
          insertSubtreeSibling(document, node.id, 'after', node, () => `copy-${copiedId++}`),
          replaceSiblingRange(document, node.id, 1, [cloneNodeWithNewIds(node, () => `range-${copiedId++}`)]),
          createFirstChild(document, node.id, 'new-child'),
          splitNode(document, node.id, cursor, 'new-split'),
          deleteNode(document, node.id),
          moveSibling(document, node.id, cursor),
          pasteText(document, node.id, cursor, text),
          pasteMultilineText(document, node.id, cursor, [text, text], ['pasted-node']),
          attachImage(document, node.id, { id: 'new-attachment', mimeType: 'image/png' }),
          ensureRoot(document, 'new-root'),
        ]
        for (const result of results) {
          for (const candidate of allNodes(result)) {
            if (path.has(candidate.id)) continue
            const original = before.get(candidate.id)
            if (original === undefined) continue
            expect(candidate).toBe(original)
          }
        }
      }),
      { numRuns: 25 },
    )
  })

  it('reports exactly the referenced attachment ids after any operation', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.integer({ min: -2, max: 40 }), fc.string(), (rawForest, seed, cursor, text) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        const reference = (target: Document): string[] =>
          [
            ...new Set(
              allNodes(target)
                .map((entry) => entry.attachment?.id)
                .filter((id): id is string => id !== undefined),
            ),
          ].sort()
        const results: Document[] = [
          editNodeText(document, node.id, text),
          editNodeContent(document, node.id, text, []),
          deleteLink(document, node.id, cursor) ?? document,
          removeTextRange(document, node.id, cursor, cursor + 1),
          insertSiblingAfter(document, node.id, 'new-after'),
          insertSiblingAfter(document, node.id, 'new-after-image', '', {
            id: 'inserted-attachment',
            mimeType: 'image/png',
          }),
          insertSiblingBefore(document, node.id, 'new-before'),
          createFirstChild(document, node.id, 'new-child'),
          splitNode(document, node.id, cursor, 'new-split'),
          deleteNode(document, node.id),
          moveSibling(document, node.id, cursor),
          pasteText(document, node.id, cursor, text),
          pasteMultilineText(document, node.id, cursor, [text, text], ['pasted-node']),
          attachImage(document, node.id, { id: 'new-attachment', mimeType: 'image/png' }),
          ensureRoot(document, 'new-root'),
        ]
        for (const result of results) {
          expect([...collectAttachmentIds(result)].sort()).toEqual(reference(result))
        }
      }),
      { numRuns: 25 },
    )
  })

  it('reports the exact attachment multiplicity after any operation', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.integer({ min: -2, max: 40 }), fc.string(), (rawForest, seed, cursor, text) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        let copiedId = 0
        const reference = (target: Document): [string, number][] =>
          [
            ...allNodes(target).reduce((counts, entry) => {
              const id = entry.attachment?.id
              if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1)
              return counts
            }, new Map<string, number>()),
          ].sort()
        const results: Document[] = [
          editNodeText(document, node.id, text),
          editNodeContent(document, node.id, text, []),
          deleteLink(document, node.id, cursor) ?? document,
          removeTextRange(document, node.id, cursor, cursor + 1),
          insertSiblingAfter(document, node.id, 'new-after'),
          insertSiblingAfter(document, node.id, 'new-after-image', '', {
            id: 'inserted-attachment',
            mimeType: 'image/png',
          }),
          insertSiblingBefore(document, node.id, 'new-before'),
          insertSubtreeSibling(document, node.id, 'after', node, () => `copy-${copiedId++}`),
          createFirstChild(document, node.id, 'new-child'),
          splitNode(document, node.id, cursor, 'new-split'),
          deleteNode(document, node.id),
          moveSibling(document, node.id, cursor),
          pasteText(document, node.id, cursor, text),
          pasteMultilineText(document, node.id, cursor, [text, text], ['pasted-node']),
          attachImage(document, node.id, { id: 'new-attachment', mimeType: 'image/png' }),
          ensureRoot(document, 'new-root'),
        ]
        for (const result of results) {
          expect([...attachmentSummary(result).entries()].sort()).toEqual(reference(result))
        }
      }),
      { numRuns: 25 },
    )
  })

  it('replaces a sibling interval atomically while preserving unaffected node identity and order', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.nat(), (rawForest, startSeed, countSeed) => {
        const document = materialize(rawForest)
        const start = startSeed % document.roots.length
        const count = 1 + (countSeed % (document.roots.length - start))
        const replacement: TreeNode = { id: 'replacement', text: 'new', children: [] }
        const next = replaceSiblingRange(document, document.roots[start]!.id, count, [replacement])
        expect(next.roots.map((node) => node.id)).toEqual([
          ...document.roots.slice(0, start).map((node) => node.id),
          'replacement',
          ...document.roots.slice(start + count).map((node) => node.id),
        ])
        for (const node of document.roots.slice(0, start)) expect(next.roots).toContain(node)
        for (const node of document.roots.slice(start + count)) expect(next.roots).toContain(node)
        expect(allIds(next).length).toBe(new Set(allIds(next)).size)
        assertDocument(next)
      }),
      { numRuns: 50 },
    )
  })

  it('preserves duplicate attachment references within a document', () => {
    const document: Document = {
      roots: [
        {
          id: 'root',
          text: '',
          children: [
            { id: 'a', text: '', attachment: { id: 'shared', mimeType: 'image/png' }, children: [] },
            { id: 'b', text: '', attachment: { id: 'shared', mimeType: 'image/png' }, children: [] },
          ],
        },
      ],
    }

    expect(attachmentSummary(document).get('shared')).toBe(2)
    const withoutA = deleteNode(document, 'a')
    expect(attachmentSummary(withoutA).get('shared')).toBe(1)
    expect(attachmentSummary(deleteNode(withoutA, 'b')).has('shared')).toBe(false)
  })

  it('locates every node exactly like a full-traversal reference', () => {
    fc.assert(
      fc.property(forest, (rawForest) => {
        const document = materialize(rawForest)
        for (const node of allNodes(document)) {
          expect(normalizeLocation(locateNode(document, node.id))).toEqual(locateNodeReference(document, node.id))
        }
        expect(locateNode(document, 'not-a-node')).toBeUndefined()
        expect(locateNodeReference(document, 'not-a-node')).toBeUndefined()
      }),
    )
  })

  it('locates every node exactly like the reference after any operation', () => {
    fc.assert(
      fc.property(forest, fc.nat(), fc.integer({ min: -2, max: 40 }), fc.string(), (rawForest, seed, cursor, text) => {
        const document = materialize(rawForest)
        const node = pick(document, seed)
        const results: Document[] = [
          editNodeText(document, node.id, text),
          editNodeContent(document, node.id, text, []),
          deleteLink(document, node.id, cursor) ?? document,
          removeTextRange(document, node.id, cursor, cursor + 1),
          insertSiblingAfter(document, node.id, 'new-after'),
          insertSiblingBefore(document, node.id, 'new-before'),
          createFirstChild(document, node.id, 'new-child'),
          splitNode(document, node.id, cursor, 'new-split'),
          deleteNode(document, node.id),
          moveSibling(document, node.id, cursor),
          pasteText(document, node.id, cursor, text),
          pasteMultilineText(document, node.id, cursor, [text, text], ['pasted-node']),
          attachImage(document, node.id, { id: 'new-attachment', mimeType: 'image/png' }),
          ensureRoot(document, 'new-root'),
        ]
        for (const result of results) {
          for (const candidate of allNodes(result)) {
            expect(normalizeLocation(locateNode(result, candidate.id))).toEqual(
              locateNodeReference(result, candidate.id),
            )
          }
          expect(locateNode(result, 'not-a-node')).toBeUndefined()
        }
      }),
      { numRuns: 25 },
    )
  })
})
