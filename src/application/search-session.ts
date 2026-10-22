import {
  createSearchExecutor,
  type SearchContext,
  type SearchExecutor,
  type SearchPosition,
  type SearchRequest,
  type SearchResult,
} from './search-executor'

export interface SearchSessionSnapshot {
  readonly confirmed: string
  readonly draft?: string
  readonly visible: boolean
  readonly pending: boolean
  readonly count?: Extract<SearchResult, { kind: 'count' }>
}

/** Memory-only foundation. The editor must replace context before publishing a changed document. */
export class SearchSession {
  private context: SearchContext | undefined
  private snapshot: SearchSessionSnapshot = { confirmed: '', visible: false, pending: false }
  private origin: SearchPosition | undefined
  private previousVisible = false
  private generation = 0
  private countId = 0
  private navigationId = 0
  private cancelCount: (() => void) | undefined
  private cancelNavigation: (() => void) | undefined
  private readonly listeners = new Set<() => void>()

  public constructor(private readonly executor: SearchExecutor = createSearchExecutor()) {}

  public getSnapshot = (): SearchSessionSnapshot => this.snapshot

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public replaceContext(context: SearchContext): void {
    const previous = this.context
    if (
      previous?.document === context.document &&
      previous.revision === context.revision &&
      previous.scopeKey === context.scopeKey &&
      previous.scope === context.scope
    )
      return
    this.invalidate()
    this.context = context
    if (previous?.scopeKey !== context.scopeKey) {
      this.origin = undefined
      this.set({ confirmed: this.snapshot.confirmed, visible: false, pending: false })
    } else {
      const { confirmed, draft, visible } = this.snapshot
      if (!visible && draft === undefined) return
      this.set({ confirmed, ...(draft === undefined ? {} : { draft }), visible, pending: visible })
      if (visible) this.recount()
    }
  }

  public begin(origin: SearchPosition): void {
    this.invalidate()
    this.previousVisible = this.snapshot.visible
    this.origin = origin
    this.set({ confirmed: this.snapshot.confirmed, draft: this.snapshot.confirmed, visible: true, pending: true })
    this.recount()
  }

  public edit(query: string): void {
    if (this.snapshot.draft === undefined) return
    this.invalidate()
    this.set({ confirmed: this.snapshot.confirmed, draft: query, visible: true, pending: true })
    this.recount()
  }

  public cancelDraft(): void {
    if (this.snapshot.draft === undefined) return
    this.invalidate()
    this.origin = undefined
    const visible = this.previousVisible
    this.set({ confirmed: this.snapshot.confirmed, visible, pending: visible })
    if (visible) this.recount()
  }

  /** Caller applies a current destination through the editor's existing focus/reveal owner. */
  public confirm(publish: (result: Extract<SearchResult, { kind: 'navigate' }>) => void): void {
    const origin = this.origin
    const query = this.snapshot.draft || this.snapshot.confirmed
    this.invalidate()
    this.origin = undefined
    this.set({ confirmed: query, visible: query.length > 0, pending: query.length > 0 })
    if (query.length === 0) return
    this.recount()
    if (origin !== undefined) this.navigate(origin, 1, 1, publish)
  }

  public hide(): void {
    this.invalidate()
    this.origin = undefined
    this.set({ confirmed: this.snapshot.confirmed, visible: false, pending: false })
  }

  public interruptNavigation(): void {
    this.navigationId++
    this.cancelNavigation?.()
    this.cancelNavigation = undefined
  }

  /** One pending jump. Repeated UI intents must await application of the preceding destination. */
  public navigate(
    origin: SearchPosition,
    direction: -1 | 1,
    count: number,
    publish: (result: Extract<SearchResult, { kind: 'navigate' }>) => void,
  ): void {
    if (this.context === undefined || this.snapshot.confirmed.length === 0 || this.snapshot.draft !== undefined) return
    if (!this.snapshot.visible) {
      this.set({ confirmed: this.snapshot.confirmed, visible: true, pending: true })
      this.recount()
    }
    this.cancelNavigation?.()
    const id = ++this.navigationId
    const generation = this.generation
    const context = this.context
    const request: SearchRequest = {
      ...context,
      id,
      query: this.snapshot.confirmed,
      operation: { kind: 'navigate', origin, direction, count },
    }
    this.cancelNavigation = this.executor.execute(request, (result) => {
      if (generation !== this.generation || id !== this.navigationId || context !== this.context) return
      this.cancelNavigation = undefined
      if (result.kind === 'navigate') publish(result)
    })
  }

  public dispose(): void {
    this.invalidate()
    this.context = undefined
    this.origin = undefined
    this.listeners.clear()
    this.snapshot = { confirmed: '', visible: false, pending: false }
  }

  private recount(): void {
    const context = this.context
    if (context === undefined) return
    this.cancelCount?.()
    const id = ++this.countId
    const generation = this.generation
    this.cancelCount = this.executor.execute(
      { ...context, id, query: this.snapshot.draft ?? this.snapshot.confirmed, operation: { kind: 'count' } },
      (result) => {
        if (generation !== this.generation || id !== this.countId || context !== this.context) return
        this.cancelCount = undefined
        if (result.kind === 'count') this.set({ ...this.snapshot, count: result, pending: false })
      },
    )
  }

  private invalidate(): void {
    this.generation++
    this.cancelCount?.()
    this.cancelNavigation?.()
    this.cancelCount = undefined
    this.cancelNavigation = undefined
  }

  private set(snapshot: SearchSessionSnapshot): void {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }
}
