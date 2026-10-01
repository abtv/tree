import {
  attachmentSummary,
  isValidLocation,
  locateNode,
  type AttachmentId,
  type AttachmentSummary,
  type Document,
  type Location,
} from '../domain/document'

export const HISTORY_LIMIT = 200

export type AttachmentSummaryProvider = (document: Document) => AttachmentSummary

interface HistoryEntry {
  document: Document
  summary: AttachmentSummary
}

export class EditorHistory {
  private readonly past: HistoryEntry[] = []
  private readonly future: HistoryEntry[] = []
  private readonly attachmentCounts = new Map<AttachmentId, number>()
  private readonly summaryRefCounts = new Map<AttachmentSummary, number>()

  public constructor(private readonly summarize: AttachmentSummaryProvider = attachmentSummary) {}

  public begin(document: Document): boolean {
    this.past.push(this.retain(document))
    const evicted = this.past.length > HISTORY_LIMIT
    if (evicted) this.release(this.past.shift()!)
    const discardedRedo = this.future.length > 0
    for (const entry of this.future) this.release(entry)
    this.future.length = 0
    return evicted || discardedRedo
  }

  public undo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const previous = this.past.pop()
    if (previous === undefined) return undefined
    this.release(previous)
    this.future.push(this.retain(document))
    // begin bounds past + future; undo transfers one entry without changing that total.
    // The overflow body is unreachable through the public API, but >= would evict a valid entry.
    if (this.future.length > HISTORY_LIMIT) this.release(this.future.shift()!)
    return { document: previous.document, location: reconcileLocation(previous.document, document, location) }
  }

  public redo(document: Document, location: Location): { document: Document; location: Location } | undefined {
    const next = this.future.pop()
    if (next === undefined) return undefined
    this.release(next)
    this.past.push(this.retain(document))
    // Like undo, redo transfers an entry within the already bounded total.
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
    const summary = this.summarize(document)
    const refs = this.summaryRefCounts.get(summary) ?? 0
    if (refs === 0) {
      for (const id of summary.keys()) {
        this.attachmentCounts.set(id, (this.attachmentCounts.get(id) ?? 0) + 1)
      }
    }
    this.summaryRefCounts.set(summary, refs + 1)
    return { document, summary }
  }

  private release(entry: HistoryEntry): void {
    const refs = (this.summaryRefCounts.get(entry.summary) ?? 0) - 1
    if (refs > 0) {
      this.summaryRefCounts.set(entry.summary, refs)
      return
    }
    this.summaryRefCounts.delete(entry.summary)
    for (const id of entry.summary.keys()) {
      const remaining = (this.attachmentCounts.get(id) ?? 0) - 1
      if (remaining > 0) this.attachmentCounts.set(id, remaining)
      else this.attachmentCounts.delete(id)
    }
  }
}

function reconcileLocation(document: Document, previousDocument: Document, previousLocation: Location): Location {
  if (isValidLocation(document, previousLocation)) return previousLocation

  // A lookup of null also returns undefined because valid node IDs are strings;
  // bypassing this container fast path changes lookup work, not the resulting location.
  const current =
    previousLocation.currentParentId === null
      ? undefined
      : locateNode(previousDocument, previousLocation.currentParentId)
  const candidates =
    // The document container has no node ancestors; its fallback is the first root.
    current === undefined ? [] : [...current.ancestors.map((node) => node.id), current.node.id].reverse()
  for (const candidate of candidates) {
    if (locateNode(document, candidate) !== undefined) {
      return { currentParentId: candidate, selectedNodeId: candidate }
    }
  }
  const root = document.roots[0]
  // Every retained editor document has a root; this error only defends invalid internal snapshots.
  if (root === undefined) throw new Error('An undo state must contain a root node.')
  return { currentParentId: null, selectedNodeId: root.id }
}
