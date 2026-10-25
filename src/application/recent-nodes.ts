import { type Document, type TreeNode } from '../domain/document'

export const RECENT_NODE_LIMIT = 100
export const RECENT_NODE_RESULTS = 8

export interface RecentNode {
  readonly id: string
  readonly text: string
  readonly path: string | null
}

export function normalizeRecentNodes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(
    0,
    RECENT_NODE_LIMIT,
  )
}

/** Bounded MRU state, independent of document history and UI selection. */
export class RecentNodes {
  private ids: readonly string[] = []
  private document: Document | undefined
  private results: readonly RecentNode[] = []
  private readonly paths = new Map<string, readonly { id: string; index: number }[]>()

  public constructor(private readonly changed: () => void = () => undefined) {}

  public load(value: unknown, document: Document): void {
    this.ids = normalizeRecentNodes(value)
    this.update(document)
  }

  public getIds = (): readonly string[] => this.ids
  public getResults = (): readonly RecentNode[] => this.results

  public recordChange(before: Document, after: Document, id: string): void {
    const oldNode = this.find(before, id)?.at(-1)
    const newNode = this.find(after, id)?.at(-1)
    if (
      newNode !== undefined &&
      (oldNode === undefined ||
        oldNode.text !== newNode.text ||
        oldNode.attachment !== newNode.attachment ||
        oldNode.struckThrough !== newNode.struckThrough ||
        oldNode.links !== newNode.links)
    )
      this.remember(id, after)
    else this.update(after)
  }

  private find(document: Document, id: string): readonly TreeNode[] | undefined {
    const cached = this.paths.get(id)
    if (cached !== undefined) {
      const nodes: TreeNode[] = []
      let siblings = document.roots
      for (const entry of cached) {
        const node = siblings[entry.index]
        if (node?.id !== entry.id) break
        nodes.push(node)
        siblings = node.children
      }
      if (nodes.length === cached.length) return nodes
    }
    // A changed sibling slot is uncommon. Search without building a whole-document hash index;
    // only the bounded MRU paths are retained, never a second copy of the document's index.
    const nodes: TreeNode[] = []
    const path: { id: string; index: number }[] = []
    const visit = (siblings: readonly TreeNode[]): boolean => {
      for (let index = 0; index < siblings.length; index++) {
        const node = siblings[index]!
        if (node.id !== id && node.children.length === 0) continue
        nodes.push(node)
        path.push({ id: node.id, index })
        if (node.id === id || visit(node.children)) return true
        nodes.pop()
        path.pop()
      }
      return false
    }
    if (!visit(document.roots)) return undefined
    this.paths.set(id, path)
    return nodes
  }

  public remember(id: string, document: Document): void {
    if (this.ids[0] !== id) {
      this.ids = [id, ...this.ids.filter((entry) => entry !== id)].slice(0, RECENT_NODE_LIMIT)
      this.document = undefined
      this.changed()
    }
    this.update(document)
  }

  public update(document: Document): void {
    if (this.document === document) return
    this.document = document
    const results: RecentNode[] = []
    const missing = new Set<string>()
    for (const id of this.ids) {
      const found = this.find(document, id)
      if (found === undefined) {
        missing.add(id)
        continue
      }
      results.push({
        id,
        text: label(found.at(-1)!),
        path: found.length === 1 ? null : found.slice(0, -1).map(label).join(' › '),
      })
      if (results.length === RECENT_NODE_RESULTS) break
    }
    if (missing.size > 0) {
      this.ids = this.ids.filter((id) => !missing.has(id))
      this.changed()
    }
    this.results = results
    const retained = new Set(this.ids)
    for (const id of this.paths.keys()) if (!retained.has(id)) this.paths.delete(id)
  }
}

export function label(node: TreeNode): string {
  const text = node.text.slice(0, 160).replace(/\s+/g, ' ').trim()
  return text || (node.attachment === undefined ? 'Empty node' : 'Image')
}
