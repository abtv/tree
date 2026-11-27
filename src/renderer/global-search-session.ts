import type { NodeResult } from '../application/node-result'
import { searchScheduler, type SearchScheduler } from '../application/search-executor'
import { nodeSearchCompletionTerm, type InferredSearchMarker } from '../domain/node-search-query'
import { tagPrefix } from '../domain/tags'
import { moveSuggestionIndex } from './completion-controller'

interface SearchSource {
  /** The list shown for empty input: marked, then starred nodes. */
  initial(): readonly NodeResult[]
  suggestions(query: string, uniqueOnly?: boolean): readonly string[]
  search(query: string, publish: (results: readonly NodeResult[]) => void): () => void
}

type CompletionTerm = NonNullable<ReturnType<typeof nodeSearchCompletionTerm>>

function replaceCompletionTerm(query: string, term: CompletionTerm, name: string): string {
  return `${query.slice(0, term.start)}${term.text[0]}${name}${query.slice(term.end)}`
}

interface ResultPresentation {
  readonly completedQuery: string
  readonly completedMarkerFragments: readonly InferredSearchMarker[] | undefined
}

interface CaretSuggestions {
  readonly completionQuery: string
  readonly suggestions: readonly string[]
}

interface ResolvedQuery extends ResultPresentation {
  readonly effectiveQuery: string
  readonly markerNames: Map<string, string | undefined>
}

interface GlobalSearchSnapshot extends ResultPresentation {
  readonly items: readonly NodeResult[] | undefined
  readonly query: string
  readonly pending: boolean
  readonly selected: number
  readonly selectedPart: 'node' | 'heading'
  readonly suggestions: readonly string[]
  readonly completionQuery: string
  readonly suggestionIndex: number
}

const firstResult = { selected: 0, selectedPart: 'node' } as const

const closed: GlobalSearchSnapshot = {
  items: undefined,
  query: '',
  completedQuery: '',
  completedMarkerFragments: undefined,
  pending: false,
  ...firstResult,
  suggestions: [],
  completionQuery: '',
  suggestionIndex: 0,
}

// One uncached term can scan a complete catalog. Yield between small groups of lookups.
const markerLookupsPerSlice = 4

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
  private markerNames = new Map<string, string | undefined>()
  private cancelPreparation: (() => void) | undefined
  private request: { query: string; presentation: ResultPresentation; cancel?: () => void } | undefined
  private readonly listeners = new Set<() => void>()

  public constructor(
    private readonly source: SearchSource,
    private readonly scheduler: SearchScheduler = searchScheduler,
  ) {}

  public getSnapshot = (): GlobalSearchSnapshot => this.snapshot

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public open(): void {
    this.cancel()
    this.markerNames.clear()
    this.composing = false
    this.completionAccepted = false
    this.selectionStart = 0
    this.selectionEnd = 0
    this.set({ ...closed, items: this.source.initial() })
  }

  public close(): boolean {
    if (this.snapshot.items === undefined) return false
    this.cancel()
    this.markerNames.clear()
    this.composing = false
    this.set(closed)
    return true
  }

  public edit(query: string, completedTag = false, selectionStart = query.length, selectionEnd = selectionStart): void {
    if (this.snapshot.items === undefined) return
    this.completionAccepted = completedTag
    this.selectionStart = selectionStart
    this.selectionEnd = selectionEnd
    if (query === '') {
      this.cancel()
      this.markerNames.clear()
      this.set({ ...closed, items: this.source.initial() })
      return
    }

    this.updateQuery(query, 'edit')
  }

  public refresh(): void {
    const { items, query } = this.snapshot
    if (items === undefined) return
    if (query === '') this.edit(query)
    else this.updateQuery(query, 'refresh')
  }

  public updateSelection(start: number, end = start): void {
    const { items, query } = this.snapshot
    if (items === undefined || query === '' || (start === this.selectionStart && end === this.selectionEnd)) return
    this.completionAccepted = false
    this.selectionStart = start
    this.selectionEnd = end
    this.set({ ...this.snapshot, ...this.suggestionsAtCaret(query), suggestionIndex: 0 })
  }

  public beginComposition(): void {
    this.composing = true
    this.dismissSuggestions()
  }

  public isComposing(): boolean {
    return this.composing
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
      const caret = completion.start + 1 + tag.length
      this.edit(replaceCompletionTerm(this.snapshot.query, completion, tag), true, caret)
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

  private suggestionsAtCaret(query: string): CaretSuggestions {
    const completion =
      this.selectionStart === this.selectionEnd ? nodeSearchCompletionTerm(query, this.selectionStart) : undefined
    const suggestions =
      this.completionAccepted || this.composing || completion === undefined
        ? []
        : this.source.suggestions(completion.text)
    return { completionQuery: completion?.text ?? '', suggestions }
  }

  private *resolveMarkers(query: string, caret: CaretSuggestions): Generator<undefined, ResolvedQuery> {
    const nextNames = new Map<string, string | undefined>()
    const inferred: InferredSearchMarker[] = []
    const terms = new Set<string>()
    const composing = this.composing
    const completionAccepted = this.completionAccepted
    const previousNames = this.markerNames
    let lookups = 0
    for (const [term] of query.matchAll(/\S+/gu)) {
      const prefix = tagPrefix(term)
      if (prefix === undefined || composing) {
        terms.add(term)
        continue
      }
      if (nextNames.has(term)) continue
      let name = previousNames.get(term)
      if (!previousNames.has(term)) {
        if (lookups === markerLookupsPerSlice) {
          lookups = 0
          yield undefined
        }
        const matches =
          !completionAccepted && caret.completionQuery === term
            ? caret.suggestions
            : this.source.suggestions(term, true)
        lookups++
        if (matches.length === 1) name = matches[0]
      }
      nextNames.set(term, name)
      const resolved = name === undefined ? term : `${prefix}${name}`
      if (name !== undefined && resolved !== term) inferred.push({ fragment: term, name })
      terms.add(resolved)
    }
    return {
      effectiveQuery: [...terms].join(' '),
      markerNames: nextNames,
      completedQuery: query,
      completedMarkerFragments: inferred.length > 0 ? inferred : undefined,
    }
  }

  private updateQuery(query: string, change: 'edit' | 'refresh'): void {
    this.stopPreparation()
    if (change === 'refresh') this.markerNames.clear()
    const completion = this.suggestionsAtCaret(query)
    const next = {
      ...this.snapshot,
      ...completion,
      query,
      suggestionIndex: 0,
    }

    const preparation = this.resolveMarkers(query, completion)
    const first = preparation.next()
    if (first.done) {
      this.searchPrepared(next, first.value, change)
      return
    }

    this.cancel()
    let cancelSlice: (() => void) | undefined
    const cancel = (): void => cancelSlice?.()
    this.cancelPreparation = cancel
    const run = (): void => {
      if (this.cancelPreparation !== cancel) return
      const step = preparation.next()
      if (!step.done) {
        cancelSlice = this.scheduler.schedule(run)
        return
      }
      this.cancelPreparation = undefined
      this.searchPrepared(this.snapshot, step.value, change)
    }
    this.set({ ...next, pending: true })
    if (this.cancelPreparation === cancel) cancelSlice = this.scheduler.schedule(run)
  }

  private searchPrepared(next: GlobalSearchSnapshot, resolved: ResolvedQuery, change: 'edit' | 'refresh'): void {
    const { effectiveQuery, markerNames, ...presentation } = resolved
    this.markerNames = markerNames
    if (change !== 'refresh' && this.request?.query === effectiveQuery) {
      this.request.presentation = presentation
      const replacesPresentation = !next.pending && next.completedQuery !== presentation.completedQuery
      this.set({ ...next, ...(!next.pending && presentation), ...(replacesPresentation && firstResult) })
      return
    }

    this.cancel()
    const request: NonNullable<typeof this.request> = { query: effectiveQuery, presentation }
    this.request = request
    this.set({ ...next, pending: true })
    // Snapshot subscribers can close or replace the request during either publication.
    if (this.request !== request) return
    const cancel = this.source.search(effectiveQuery, (items) => {
      if (this.request !== request) return
      this.set({ ...this.snapshot, items, ...request.presentation, ...firstResult, pending: false })
    })
    if (this.request === request) request.cancel = cancel
    else cancel()
  }

  private stopPreparation(): void {
    const cancel = this.cancelPreparation
    this.cancelPreparation = undefined
    cancel?.()
  }

  private cancel(): void {
    this.stopPreparation()
    const request = this.request
    this.request = undefined
    request?.cancel?.()
  }

  private set(snapshot: GlobalSearchSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
}
