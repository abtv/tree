import type { NodeResult } from '../application/node-result'
import { nodeSearchCompletionTerm } from '../domain/node-search-query'
import { moveSuggestionIndex } from './completion-controller'

interface SearchSource {
  /** The list shown for empty input: marked, then starred nodes. */
  initial(): readonly NodeResult[]
  suggestions(query: string): readonly string[]
  search(query: string, publish: (results: readonly NodeResult[]) => void): () => void
}

interface GlobalSearchSnapshot {
  readonly items: readonly NodeResult[] | undefined
  readonly query: string
  readonly completedQuery: string
  readonly pending: boolean
  readonly selected: number
  readonly selectedPart: 'node' | 'heading'
  readonly suggestions: readonly string[]
  readonly completionQuery: string
  readonly suggestionIndex: number
}

const closed: GlobalSearchSnapshot = {
  items: undefined,
  query: '',
  completedQuery: '',
  pending: false,
  selected: 0,
  selectedPart: 'node',
  suggestions: [],
  completionQuery: '',
  suggestionIndex: 0,
}

export function startsSearchGroup(items: readonly NodeResult[], index: number): boolean {
  const item = items[index]!
  const previous = items[index - 1]
  return item.path !== previous?.path || item.parentId !== previous?.parentId
}

export function hasGroupHeading(items: readonly NodeResult[], index: number): boolean {
  return items[index]!.path !== null && startsSearchGroup(items, index)
}

/** Owns one global Search session; DOM focus and result geometry remain with its adapter. */
export class GlobalSearchSession {
  private snapshot = closed
  private composing = false
  private completionAccepted = false
  private selectionStart = 0
  private selectionEnd = 0
  private request: { cancel?: () => void } | undefined
  private readonly listeners = new Set<() => void>()

  public constructor(private readonly source: SearchSource) {}

  public getSnapshot = (): GlobalSearchSnapshot => this.snapshot

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public open(): void {
    this.cancel()
    this.composing = false
    this.completionAccepted = false
    this.selectionStart = 0
    this.selectionEnd = 0
    this.set({ ...closed, items: this.source.initial() })
  }

  public close(): boolean {
    if (this.snapshot.items === undefined) return false
    this.cancel()
    this.composing = false
    this.set(closed)
    return true
  }

  public edit(query: string, completedTag = false, selectionStart = query.length, selectionEnd = selectionStart): void {
    if (this.snapshot.items === undefined) return
    this.cancel()
    this.completionAccepted = completedTag
    this.selectionStart = selectionStart
    this.selectionEnd = selectionEnd
    if (query === '') {
      this.set({ ...closed, items: this.source.initial() })
      return
    }

    const completion = selectionStart === selectionEnd ? nodeSearchCompletionTerm(query, selectionStart) : undefined
    const request: NonNullable<typeof this.request> = {}
    this.request = request
    this.set({
      ...this.snapshot,
      query,
      selected: 0,
      selectedPart: 'node',
      suggestionIndex: 0,
      completionQuery: completion?.text ?? '',
      suggestions:
        completedTag || this.composing || completion === undefined ? [] : this.source.suggestions(completion.text),
      pending: true,
    })
    // Snapshot subscribers can close or replace the request during either publication.
    if (this.request !== request) return
    const cancel = this.source.search(query, (items) => {
      if (this.request !== request) return
      this.set({ ...this.snapshot, items, completedQuery: query, pending: false })
    })
    if (this.request === request) request.cancel = cancel
    else cancel()
  }

  public refresh(): void {
    this.edit(this.snapshot.query, this.completionAccepted, this.selectionStart, this.selectionEnd)
  }

  public updateSelection(start: number, end = start): void {
    if (this.snapshot.items === undefined || (start === this.selectionStart && end === this.selectionEnd)) return
    this.completionAccepted = false
    this.selectionStart = start
    this.selectionEnd = end
    const completion = start === end ? nodeSearchCompletionTerm(this.snapshot.query, start) : undefined
    this.set({
      ...this.snapshot,
      completionQuery: completion?.text ?? '',
      suggestionIndex: 0,
      suggestions: this.composing || completion === undefined ? [] : this.source.suggestions(completion.text),
    })
  }

  public beginComposition(): void {
    this.composing = true
    this.dismissSuggestions()
  }

  public endComposition(query: string, selectionStart = query.length, selectionEnd = selectionStart): void {
    this.composing = false
    this.edit(query, false, selectionStart, selectionEnd)
  }

  public dismissSuggestions(): void {
    this.set({ ...this.snapshot, suggestions: [] })
  }

  public moveSuggestion(direction: -1 | 1): void {
    this.set({
      ...this.snapshot,
      suggestionIndex: moveSuggestionIndex(this.snapshot.suggestionIndex, direction, this.snapshot.suggestions.length),
    })
  }

  public acceptSuggestion(index = this.snapshot.suggestionIndex): number | undefined {
    const tag = this.snapshot.suggestions[index]
    const completion = nodeSearchCompletionTerm(this.snapshot.query, this.selectionStart)
    if (tag !== undefined && completion !== undefined) {
      const replacement = `${completion.text[0]}${tag}`
      const caret = completion.start + replacement.length
      this.edit(
        `${this.snapshot.query.slice(0, completion.start)}${replacement}${this.snapshot.query.slice(completion.end)}`,
        true,
        caret,
      )
      return caret
    }
  }

  public moveResult(direction: -1 | 1): void {
    const { items, selected, selectedPart, pending } = this.snapshot
    if (pending || !items?.length) return
    if (direction === 1 && selectedPart === 'heading') {
      this.set({ ...this.snapshot, selectedPart: 'node' })
      return
    }
    if (direction === -1 && selectedPart === 'node' && hasGroupHeading(items, selected)) {
      this.set({ ...this.snapshot, selectedPart: 'heading' })
      return
    }
    const next = moveSuggestionIndex(selected, direction, items.length)
    this.set({
      ...this.snapshot,
      selected: next,
      selectedPart: direction === 1 && hasGroupHeading(items, next) ? 'heading' : 'node',
    })
  }

  /** Close before the adapter finishes buffered edits: that can synchronously refresh the document. */
  public takeResult(index = this.snapshot.selected, part = this.snapshot.selectedPart): string | undefined {
    if (this.snapshot.pending) return undefined
    const item = this.snapshot.items?.[index]
    const target = part === 'heading' ? item?.parentId : item?.id
    if (target === undefined) return undefined
    this.close()
    return target
  }

  private cancel(): void {
    const request = this.request
    this.request = undefined
    request?.cancel?.()
  }

  private set(snapshot: GlobalSearchSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
}
