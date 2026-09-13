import { isValidLocation, locateNode, type Document, type Location } from '../domain/document'

export const HISTORY_LIMIT = 200

export class EditorHistory {
  private readonly past: Document[] = []
  private readonly future: Document[] = []

  public begin(document: Document): boolean {
    this.past.push(document)
    const evicted = this.past.length > HISTORY_LIMIT
    if (evicted) this.past.shift()
    this.future.length = 0
    return evicted
  }

  public undo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const previous = this.past.pop()
    if (previous === undefined) return undefined
    this.future.push(document)
    if (this.future.length > HISTORY_LIMIT) this.future.shift()
    return { document: previous, location: reconcileLocation(previous, document, location) }
  }

  public redo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.past.push(document)
    if (this.past.length > HISTORY_LIMIT) this.past.shift()
    return { document: next, location: reconcileLocation(next, document, location) }
  }

  public documents(): Iterable<Document> {
    return [...this.past, ...this.future]
  }
}

function reconcileLocation(document: Document, previousDocument: Document, previousLocation: Location): Location {
  if (isValidLocation(document, previousLocation)) return previousLocation

  const current =
    previousLocation.currentParentId === null
      ? undefined
      : locateNode(previousDocument, previousLocation.currentParentId)
  const candidates =
    current === undefined ? [] : [...current.ancestors.map((node) => node.id), current.node.id].reverse()
  for (const candidate of candidates) {
    if (locateNode(document, candidate) !== undefined) {
      return { currentParentId: candidate, selectedNodeId: candidate }
    }
  }
  const root = document.roots[0]
  if (root === undefined) throw new Error('An undo state must contain a root node.')
  return { currentParentId: null, selectedNodeId: root.id }
}
