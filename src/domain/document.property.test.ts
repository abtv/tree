import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  assertDocument,
  cloneDocument,
  cloneNode,
  collectAttachmentIds,
  deleteNode,
  isValidLocation,
  insertSiblingBefore,
  locateNode,
  moveSibling,
  nodePath,
  parsePersistedState,
  pasteMultilineText,
  pasteText,
  serializeState,
  splitNode,
  MAX_DOCUMENT_DEPTH,
  type Document,
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

describe('document invariants', () => {
  it('round-trips any valid document and location through serialization', () => {
    fc.assert(
      fc.property(forest, fc.nat(), (rawForest, seed) => {
        const document = materialize(rawForest)
        expect(maxDepth(document)).toBeLessThanOrEqual(MAX_DOCUMENT_DEPTH)
        const node = pick(document, seed)
        const state = serializeState(document, locationFor(document, node))

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
        const duplicate = cloneDocument(document)
        duplicate.roots.push({ ...cloneNode(document.roots[0]!), children: [] })

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
})
