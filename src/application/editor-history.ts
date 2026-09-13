import {
  collectAttachmentIds,
  isValidLocation,
  locateNode,
  type AttachmentId,
  type Document,
  type Location,
} from '../domain/document'

export const HISTORY_LIMIT = 200

export type AttachmentIdCollector = (document: Document) => ReadonlySet<AttachmentId>

interface HistoryEntry {
  document: Document
  attachmentIds: ReadonlySet<AttachmentId>
}

export class EditorHistory {
  private readonly past: HistoryEntry[] = []
  private readonly future: HistoryEntry[] = []
  private readonly attachmentCounts = new Map<AttachmentId, number>()

  public constructor(private readonly collectIds: AttachmentIdCollector = collectAttachmentIds) {}

  public begin(document: Document): boolean {
    this.past.push(this.retain(document))
    const evicted = this.past.length > HISTORY_LIMIT
    if (evicted) this.release(this.past.shift()!)
    for (const entry of this.future) this.release(entry)
    this.future.length = 0
    return evicted
  }

  public undo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const previous = this.past.pop()
    if (previous === undefined) return undefined
    this.release(previous)
    this.future.push(this.retain(document))
    if (this.future.length > HISTORY_LIMIT) this.release(this.future.shift()!)
    return { document: previous.document, location: reconcileLocation(previous.document, document, location) }
  }

  public redo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.release(next)
    this.past.push(this.retain(document))
    if (this.past.length > HISTORY_LIMIT) this.release(this.past.shift()!)
    return { document: next.document, location: reconcileLocation(next.document, document, location) }
  }

  public documents(): Iterable<Document> {
    return [...this.past, ...this.future].map((entry) => entry.document)
  }

  public attachmentIds(): Iterable<AttachmentId> {
    return this.attachmentCounts.keys()
  }

  private retain(document: Document): HistoryEntry {
    const entry: HistoryEntry = { document, attachmentIds: this.collectIds(document) }
    for (const id of entry.attachmentIds) {
      this.attachmentCounts.set(id, (this.attachmentCounts.get(id) ?? 0) + 1)
    }
    return entry
  }

  private release(entry: HistoryEntry): void {
    for (const id of entry.attachmentIds) {
      const remaining = (this.attachmentCounts.get(id) ?? 0) - 1
      if (remaining > 0) this.attachmentCounts.set(id, remaining)
      else this.attachmentCounts.delete(id)
    }
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
