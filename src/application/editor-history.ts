import { cloneDocument, isValidLocation, locateNode, type Document, type Location } from '../domain/document'

export class EditorHistory {
  private readonly past: Document[] = []
  private readonly future: Document[] = []

  public begin(document: Document): void {
    this.past.push(cloneDocument(document))
    this.future.length = 0
  }

  public undo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const previous = this.past.pop()
    if (previous === undefined) return undefined
    this.future.push(cloneDocument(document))
    return { document: previous, location: reconcileLocation(previous, document, location) }
  }

  public redo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.past.push(cloneDocument(document))
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
