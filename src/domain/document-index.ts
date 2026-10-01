import type { Document, LocatedNode, NodeId, NodeIndex, TreeNode } from './document-types'

interface IndexInfo {
  parent: NodeIndex
  siblingIndex: ReadonlyMap<NodeId, number>
}

const indexCache = new WeakMap<Document, IndexInfo>()

function buildIndexInfo(document: Document): IndexInfo {
  const parent = new Map<NodeId, NodeId | null>()
  const siblingIndex = new Map<NodeId, number>()
  const stack: TreeNode[] = []
  for (let index = document.roots.length - 1; index >= 0; index -= 1) {
    const root = document.roots[index]!
    parent.set(root.id, null)
    siblingIndex.set(root.id, index)
    stack.push(root)
  }
  while (stack.length > 0) {
    const node = stack.pop()!
    for (let index = node.children.length - 1; index >= 0; index -= 1) {
      const child = node.children[index]!
      parent.set(child.id, node.id)
      siblingIndex.set(child.id, index)
      stack.push(child)
    }
  }
  return { parent, siblingIndex }
}

function indexInfoFor(document: Document): IndexInfo {
  const cached = indexCache.get(document)
  if (cached !== undefined) return cached
  const info = buildIndexInfo(document)
  indexCache.set(document, info)
  return info
}

export function buildNodeIndex(document: Document): NodeIndex {
  return indexInfoFor(document).parent
}

export function shareIndex(from: Document, to: Document): void {
  indexCache.set(to, indexInfoFor(from))
}

export function releaseNodeIndex(document: Document): void {
  indexCache.delete(document)
}

export function locateNode(document: Document, id: NodeId): LocatedNode | undefined {
  const index = indexInfoFor(document)
  // Without this fast rejection a missing ID still returns undefined at the node guard below.
  if (!index.parent.has(id)) return undefined

  const pathIds: NodeId[] = []
  let cursor: NodeId | null | undefined = id
  // The initial ID is a string and every subsequent cursor uses ?? null, never undefined.
  while (cursor !== null && cursor !== undefined) {
    pathIds.push(cursor)
    cursor = index.parent.get(cursor) ?? null
  }
  pathIds.reverse()

  const ancestors: TreeNode[] = []
  let parent: TreeNode | null = null
  // An inclusive upper bound is equivalent: the final valid iteration returns before it.
  for (let position = 0; position < pathIds.length; position += 1) {
    const pathId = pathIds[position]!
    const siblings: readonly TreeNode[] = parent === null ? document.roots : parent.children
    const siblingIndex = index.siblingIndex.get(pathId)
    // These guards defend against an inconsistent derived index. With immutable input and
    // the index built/shared only for identical tree membership, each path ID has its slot.
    // Missing IDs are rejected above; reading siblings[undefined] also yields undefined.
    const node = siblingIndex === undefined ? undefined : siblings[siblingIndex]
    if (node === undefined || node.id !== pathId) return undefined
    if (position === pathIds.length - 1) {
      return { node, parent, siblings, index: siblingIndex!, ancestors }
    }
    ancestors.push(node)
    parent = node
  }

  return undefined
}

export function requireNode(document: Document, id: NodeId): LocatedNode {
  const located = locateNode(document, id)
  if (located === undefined) {
    throw new Error(`Node ${id} does not exist.`)
  }
  return located
}
