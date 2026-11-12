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

type SearchMode =
  | { kind: 'hidden'; confirmed: string }
  | { kind: 'confirmed'; confirmed: string }
  | { kind: 'editing'; confirmed: string; draft: string; origin: SearchPosition; previousVisible: boolean }

type SearchJob = { kind: 'idle' } | { kind: 'running'; cancel: () => void }

/** Memory-only foundation. The editor must replace context before publishing a changed document. */
export class SearchSession {
  private context: SearchContext | undefined
  private snapshot: SearchSessionSnapshot = { confirmed: '', visible: false, pending: false }
  private mode: SearchMode = { kind: 'hidden', confirmed: '' }
  private generation = 0
  private countId = 0
  private navigationId = 0
  private countJob: SearchJob = { kind: 'idle' }
  private navigationJob: SearchJob = { kind: 'idle' }
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
      this.set({ kind: 'hidden', confirmed: this.mode.confirmed }, false)
    } else {
      if (this.mode.kind === 'hidden') return
      this.set(this.mode, true)
      this.recount()
    }
  }

  public begin(origin: SearchPosition): void {
    this.invalidate()
    this.set(
      {
        kind: 'editing',
        confirmed: this.mode.confirmed,
        draft: this.mode.confirmed,
        origin,
        previousVisible: this.mode.kind !== 'hidden',
      },
      true,
    )
    this.recount()
  }

  public edit(query: string): void {
    if (this.mode.kind !== 'editing') return
    this.invalidate()
    this.set({ ...this.mode, draft: query }, true)
    this.recount()
  }

  public cancelDraft(): void {
    if (this.mode.kind !== 'editing') return
    this.invalidate()
    const visible = this.mode.previousVisible
    this.set({ kind: visible ? 'confirmed' : 'hidden', confirmed: this.mode.confirmed }, visible)
    if (visible) this.recount()
  }

  /** Caller applies a current destination through the editor's existing focus/reveal owner. */
  public confirm(publish: (result: Extract<SearchResult, { kind: 'navigate' }>) => void, direction: -1 | 1 = 1): void {
    const origin = this.mode.kind === 'editing' ? this.mode.origin : undefined
    const query = (this.mode.kind === 'editing' ? this.mode.draft : '') || this.mode.confirmed
    this.invalidate()
    this.set({ kind: query.length > 0 ? 'confirmed' : 'hidden', confirmed: query }, query.length > 0)
    if (query.length === 0) return
    this.recount()
    if (origin !== undefined) this.navigate(origin, direction, 1, publish)
  }

  public hide(): void {
    this.invalidate()
    this.set({ kind: 'hidden', confirmed: this.mode.confirmed }, false)
  }

  public interruptNavigation(): void {
    this.navigationId++
    if (this.navigationJob.kind === 'running') this.navigationJob.cancel()
    this.navigationJob = { kind: 'idle' }
  }

  /** One pending jump. Repeated UI intents must await application of the preceding destination. */
  public navigate(
    origin: SearchPosition,
    direction: -1 | 1,
    count: number,
    publish: (result: Extract<SearchResult, { kind: 'navigate' }>) => void,
  ): void {
    if (this.context === undefined || this.mode.confirmed.length === 0 || this.mode.kind === 'editing') return
    if (this.mode.kind === 'hidden') {
      this.set({ kind: 'confirmed', confirmed: this.mode.confirmed }, true)
      this.recount()
    }
    if (this.navigationJob.kind === 'running') this.navigationJob.cancel()
    const id = ++this.navigationId
    const generation = this.generation
    const context = this.context
    const request: SearchRequest = {
      ...context,
      id,
      query: this.snapshot.confirmed,
      operation: { kind: 'navigate', origin, direction, count },
    }
    const cancel = this.executor.execute(request, (result) => {
      if (generation !== this.generation || id !== this.navigationId || context !== this.context) return
      this.navigationJob = { kind: 'idle' }
      if (result.kind === 'navigate') publish(result)
    })
    this.navigationJob = { kind: 'running', cancel }
  }

  public dispose(): void {
    this.invalidate()
    this.context = undefined
    this.mode = { kind: 'hidden', confirmed: '' }
    this.listeners.clear()
    this.snapshot = { confirmed: '', visible: false, pending: false }
  }

  private recount(): void {
    const context = this.context
    if (context === undefined) return
    if (this.countJob.kind === 'running') this.countJob.cancel()
    const id = ++this.countId
    const generation = this.generation
    const cancel = this.executor.execute(
      { ...context, id, query: this.snapshot.draft ?? this.snapshot.confirmed, operation: { kind: 'count' } },
      (result) => {
        if (generation !== this.generation || id !== this.countId || context !== this.context) return
        this.countJob = { kind: 'idle' }
        if (result.kind === 'count') this.set(this.mode, false, result)
      },
    )
    this.countJob = { kind: 'running', cancel }
  }

  private invalidate(): void {
    this.generation++
    if (this.countJob.kind === 'running') this.countJob.cancel()
    if (this.navigationJob.kind === 'running') this.navigationJob.cancel()
    this.countJob = { kind: 'idle' }
    this.navigationJob = { kind: 'idle' }
  }

  private set(mode: SearchMode, pending: boolean, count?: Extract<SearchResult, { kind: 'count' }>): void {
    this.mode = mode
    this.snapshot = {
      confirmed: mode.confirmed,
      ...(mode.kind === 'editing' ? { draft: mode.draft } : {}),
      visible: mode.kind !== 'hidden',
      pending,
      ...(count === undefined ? {} : { count }),
    }
    this.listeners.forEach((listener) => listener())
  }
}
