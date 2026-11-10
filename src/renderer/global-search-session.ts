import type { RecentNode } from '../application/recent-nodes'
import { moveSuggestionIndex } from './completion-controller'

interface SearchSource {
  recent(): readonly RecentNode[]
  suggestions(query: string): readonly string[]
  search(query: string, publish: (results: readonly RecentNode[]) => void): () => void
}

interface GlobalSearchSnapshot {
  readonly items: readonly RecentNode[] | undefined
  readonly query: string
  readonly completedQuery: string
  readonly pending: boolean
  readonly selected: number
  readonly suggestions: readonly string[]
  readonly suggestionIndex: number
}

const closed: GlobalSearchSnapshot = {
  items: undefined,
  query: '',
  completedQuery: '',
  pending: false,
  selected: 0,
  suggestions: [],
  suggestionIndex: 0,
}

/** Owns one global Search session; DOM focus and result geometry remain with its adapter. */
export class GlobalSearchSession {
  private snapshot = closed
  private composing = false
  private generation = 0
  private cancelSearch: (() => void) | undefined
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
    this.set({ ...closed, items: this.source.recent() })
  }

  public close(): boolean {
    if (this.snapshot.items === undefined) return false
    this.cancel()
    this.composing = false
    this.set(closed)
    return true
  }

  public edit(query: string, completedTag = false): void {
    if (this.snapshot.items === undefined) return
    this.cancel()
    const generation = this.generation
    this.set({
      ...this.snapshot,
      query,
      selected: 0,
      suggestionIndex: 0,
      suggestions: completedTag || this.composing ? [] : this.source.suggestions(query),
      pending: query !== '',
    })
    if (query === '') {
      this.set({ ...this.snapshot, items: this.source.recent(), completedQuery: query, pending: false })
      return
    }
    this.cancelSearch = this.source.search(query, (items) => {
      if (generation !== this.generation || this.snapshot.items === undefined) return
      this.set({ ...this.snapshot, items, completedQuery: query, pending: false })
    })
  }

  public refresh(): void {
    this.edit(this.snapshot.query)
  }

  public beginComposition(): void {
    this.composing = true
    this.dismissSuggestions()
  }

  public endComposition(query: string): void {
    this.composing = false
    this.edit(query)
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

  public acceptSuggestion(index = this.snapshot.suggestionIndex): void {
    const tag = this.snapshot.suggestions[index]
    if (tag !== undefined) this.edit(`${this.snapshot.query[0]}${tag}`, true)
  }

  public moveResult(direction: -1 | 1): void {
    if (this.snapshot.pending || this.snapshot.items === undefined) return
    this.set({
      ...this.snapshot,
      selected: moveSuggestionIndex(this.snapshot.selected, direction, this.snapshot.items.length),
    })
  }

  /** Close before the adapter finishes buffered edits: that can synchronously refresh the document. */
  public takeResult(index = this.snapshot.selected): string | undefined {
    if (this.snapshot.pending) return undefined
    const item = this.snapshot.items?.[index]
    if (item === undefined) return undefined
    this.close()
    return item.id
  }

  private cancel(): void {
    this.generation++
    this.cancelSearch?.()
    this.cancelSearch = undefined
  }

  private set(snapshot: GlobalSearchSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
}
