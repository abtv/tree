import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isValidLocation, locateNode, type Document, type TreeNode } from '../domain/document'
import { changeSiteFocus, locateChangeSite } from './editor-undo-focus'

/** A small tree whose node ids are unique and stable, so mutations can address a node by id. */
const treeArbitrary = (): fc.Arbitrary<Document> => {
  const leaf = (path: string): fc.Arbitrary<TreeNode> =>
    fc.record({ text: fc.string({ maxLength: 6 }) }).map(({ text }) => ({ id: path, text, children: [] }))
  const branch = (path: string, depth: number): fc.Arbitrary<TreeNode> =>
    depth === 0
      ? leaf(path)
      : fc
          .tuple(
            fc.string({ maxLength: 6 }),
            fc.array(
              fc.nat({ max: 2 }).chain((kind) => branch(`${path}-${kind}`, depth - 1)),
              { maxLength: 3 },
            ),
          )
          .map(([text, children]) => ({
            id: path,
            text,
            children: children.filter((child, index, all) => all.findIndex((c) => c.id === child.id) === index),
          }))
  return fc
    .array(
      fc.nat({ max: 2 }).chain((kind) => branch(`r${kind}`, 2)),
      { minLength: 1, maxLength: 3 },
    )
    .map((roots) => ({ roots: roots.filter((root, index, all) => all.findIndex((r) => r.id === root.id) === index) }))
}

function allNodes(document: Document): TreeNode[] {
  const collected: TreeNode[] = []
  const walk = (nodes: readonly TreeNode[]): void => {
    for (const node of nodes) {
      collected.push(node)
      walk(node.children)
    }
  }
  walk(document.roots)
  return collected
}

function mapNode(document: Document, id: string, change: (node: TreeNode) => TreeNode | undefined): Document {
  const rewrite = (nodes: readonly TreeNode[]): TreeNode[] =>
    nodes.flatMap((node) => {
      if (node.id === id) {
        const replaced = change(node)
        return replaced === undefined ? [] : [replaced]
      }
      const children = rewrite(node.children)
      return children === node.children ? [node] : [{ ...node, children }]
    })
  return { roots: rewrite(document.roots) }
}

const anyNodeId = (document: Document): fc.Arbitrary<string> => fc.constantFrom(...allNodes(document).map((n) => n.id))

describe('undo focus invariants', () => {
  it('reports no change site for a reference-identical document', () => {
    fc.assert(
      fc.property(treeArbitrary(), (document) => {
        expect(locateChangeSite(document, document)).toBeUndefined()
      }),
    )
  })

  it('always reports a valid, displayable location whose focus is the selected node', () => {
    fc.assert(
      fc.property(
        treeArbitrary().chain((document) =>
          fc.tuple(
            fc.constant(document),
            anyNodeId(document),
            fc.string({ maxLength: 6 }),
            fc.boolean(),
            fc.constantFrom<'text' | 'remove' | 'insert'>('text', 'remove', 'insert'),
            fc.boolean(),
          ),
        ),
        ([document, id, text, undoDirection, kind, everythingExpanded]) => {
          const mutated =
            kind === 'text'
              ? mapNode(document, id, (node) => ({ ...node, text }))
              : kind === 'remove'
                ? mapNode(document, id, () => undefined)
                : mapNode(document, id, (node) => ({
                    ...node,
                    children: [{ id: `${node.id}-new`, text, children: [] }, ...node.children],
                  }))
          const before = undoDirection ? document : mutated
          const after = undoDirection ? mutated : document
          const current = { currentParentId: null, selectedNodeId: document.roots[0]!.id }
          const target = changeSiteFocus(before, after, current, () => everythingExpanded)
          if (target === undefined) return
          expect(isValidLocation(after, target.location)).toBe(true)
          // Every row is visible from the top-level location, so no change site needs navigation.
          if (everythingExpanded) expect(target.location.currentParentId).toBeNull()
          expect(target.focus.nodeId).toBe(target.location.selectedNodeId)
          expect(target.focus.cursor).toBeGreaterThanOrEqual(0)
          const node = locateNode(after, target.focus.nodeId)
          expect(node).toBeDefined()
          expect(target.focus.cursor).toBeLessThanOrEqual(node!.node.text.length)
        },
      ),
    )
  })

  it('locates a single text change at exactly its first differing character', () => {
    fc.assert(
      fc.property(
        treeArbitrary().chain((document) =>
          fc.tuple(fc.constant(document), anyNodeId(document), fc.string({ maxLength: 6 })),
        ),
        ([document, id, text]) => {
          const original = allNodes(document).find((node) => node.id === id)!
          if (original.text === text) return
          const mutated = mapNode(document, id, (node) => ({ ...node, text }))
          const site = locateChangeSite(document, mutated)
          expect(site).toBeDefined()
          expect(site!.nodeId).toBe(id)
          let offset = 0
          while (offset < original.text.length && offset < text.length && original.text[offset] === text[offset])
            offset += 1
          expect(site!.cursor).toBe(offset)
        },
      ),
    )
  })

  it('locates an inserted node at exactly that node, and a removed node at a former neighbor or its parent', () => {
    fc.assert(
      fc.property(
        treeArbitrary().chain((document) =>
          fc.tuple(fc.constant(document), anyNodeId(document), fc.string({ maxLength: 6 })),
        ),
        ([document, id, text]) => {
          const withChild = mapNode(document, id, (node) => ({
            ...node,
            children: [...node.children, { id: `${node.id}-new`, text, children: [] }],
          }))
          expect(locateChangeSite(document, withChild)).toMatchObject({ nodeId: `${id}-new`, cursor: 0 })

          const located = locateNode(document, id)!
          const removed = mapNode(document, id, () => undefined)
          const site = locateChangeSite(document, removed)
          if (site === undefined) {
            expect(document.roots).toHaveLength(1)
            expect(located.parent).toBeNull()
            return
          }
          const siblings = located.siblings
          const permitted = [
            siblings[located.index + 1]?.id,
            siblings[located.index - 1]?.id,
            located.parent?.id,
          ].filter((value): value is string => value !== undefined)
          expect(permitted).toContain(site.nodeId)
          expect(site.cursor).toBe(0)
        },
      ),
    )
  })
})
