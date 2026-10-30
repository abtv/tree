import { locateNode } from '../domain/document'
import type { SearchScope } from '../domain/search-scope'
import type { ReadySnapshot } from './editor-runtime-state'
import { SearchSession } from './search-session'
import type { SearchDestination, SearchPosition, SearchResult } from './search-executor'
import { AgendaRowsCache } from './agenda-rows'

type Navigation = Extract<SearchResult, { kind: 'navigate' }>

/** Memory-only orchestration. Document selection and fold changes remain store commands. */
export class EditorSearch {
  public readonly session = new SearchSession()
  public readonly opened = new Set<string>()
  private state: ReadySnapshot | undefined
  private revision = 0
  private scope: SearchScope = { kind: 'tree', parentId: null }
  private scopeKey = ''
  private generation = 0
  private busy = false
  private applying = false
  private queued: { direction: -1 | 1; count: number; repeats: number }[] = []
  private anchor: SearchDestination | undefined
  private result: Navigation | undefined
  private readonly listeners = new Set<() => void>()

  public constructor(
    private readonly apply: (destination: SearchDestination) => void,
    private readonly agendaRows: AgendaRowsCache,
  ) {
    this.session.subscribe(() => this.listeners.forEach((listener) => listener()))
  }

  public getResult = (): Navigation | undefined => this.result
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public update(state: ReadySnapshot): void {
    const previous = this.state
    this.state = state
    const agenda = state.agenda
    const key =
      agenda === undefined
        ? `tree:${state.location.currentParentId ?? ''}`
        : `agenda:${agenda.scopeParentId ?? ''}:${agenda.focusedDay ?? 'timeline'}`
    const projection = agenda === undefined ? undefined : this.agendaRows.getProjection(state.document, agenda)
    const changedProjection = this.scope.kind === 'agenda' && this.scope.projection !== projection
    const changedScope = key !== this.scopeKey
    const changedDocument = previous?.document !== state.document
    if (
      !this.applying &&
      (previous?.focus !== state.focus || previous?.agenda?.selectedKey !== agenda?.selectedKey) &&
      this.session.getSnapshot().draft === undefined
    )
      this.interruptNavigation()
    if (!changedScope && !changedDocument && !changedProjection) return
    this.cancelNavigation()
    if (changedDocument) this.revision++
    if (changedScope) {
      this.scopeKey = key
      this.opened.clear()
    }
    this.scope =
      agenda === undefined
        ? { kind: 'tree', parentId: state.location.currentParentId }
        : {
            kind: 'agenda',
            projection: projection!,
            ...(agenda.focusedDay === undefined ? {} : { focusedDay: agenda.focusedDay }),
          }
    this.session.replaceContext({ document: state.document, revision: this.revision, scopeKey: key, scope: this.scope })
  }

  public begin(origin: SearchPosition): void {
    this.cancelNavigation()
    this.session.begin(origin)
  }

  public edit(query: string): void {
    this.cancelNavigation()
    this.session.edit(query)
  }

  public cancelDraft(): void {
    if (this.session.getSnapshot().draft === undefined) return
    this.cancelNavigation()
    this.session.cancelDraft()
  }

  public confirm(direction: -1 | 1 = 1): void {
    this.cancelNavigation()
    this.busy = true
    const generation = this.generation
    this.session.confirm((result) => this.publish(result, generation), direction)
    if (!this.session.getSnapshot().visible) this.busy = false
  }

  public hide(): void {
    this.cancelNavigation()
    this.session.hide()
  }

  /** Newer user input takes authority without hiding the confirmed search. */
  public interruptNavigation(): void {
    this.generation++
    this.busy = false
    this.queued = []
    this.anchor = undefined
    this.session.interruptNavigation()
  }

  public navigate(origin: SearchPosition, direction: -1 | 1, count: number): void {
    if (!this.session.getSnapshot().confirmed) return
    if (this.busy) {
      const last = this.queued.at(-1)
      if (last?.direction === direction && last.count === count) last.repeats++
      else this.queued.push({ direction, count, repeats: 1 })
      return
    }
    const anchor = this.anchor
    const position =
      anchor !== undefined &&
      anchor.nodeId === origin.nodeId &&
      anchor.day === origin.day &&
      anchor.caret === origin.offset
        ? { ...anchor, offset: anchor.start }
        : origin
    this.busy = true
    const generation = this.generation
    this.session.navigate(position, direction, count, (result) => this.publish(result, generation))
  }

  /** Explicit manual choices transfer fold ownership away from search. */
  public manualFold(nodeId?: string, recursive = false): void {
    if (nodeId === undefined) this.opened.clear()
    else {
      this.opened.delete(nodeId)
      if (recursive && this.state !== undefined) {
        for (const id of this.opened) {
          if (locateNode(this.state.document, id)?.ancestors.some((node) => node.id === nodeId)) this.opened.delete(id)
        }
      }
    }
  }

  private cancelNavigation(): void {
    this.generation++
    this.busy = false
    this.queued = []
    this.anchor = undefined
    this.result = undefined
  }

  private publish(result: Navigation, generation: number): void {
    if (generation !== this.generation) return
    if (result.destination !== undefined) {
      this.anchor = result.destination
      this.applying = true
      try {
        this.apply(result.destination)
      } finally {
        this.applying = false
      }
    }
    if (generation !== this.generation) return
    this.result = result
    this.busy = false
    this.listeners.forEach((listener) => listener())
    const next = this.queued[0]
    if (next !== undefined && --next.repeats === 0) this.queued.shift()
    const state = this.state
    if (next !== undefined && state !== undefined && result.destination !== undefined) {
      this.navigate({ ...result.destination, offset: result.destination.caret }, next.direction, next.count)
    }
  }
}
