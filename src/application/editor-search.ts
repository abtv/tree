import { locateNode, requireNode, type Location } from '../domain/document'
import type { SearchScope } from '../domain/search-scope'
import type { ReadySnapshot } from './editor-runtime-state'
import { SearchSession } from './search-session'
import type { SearchDestination, SearchPosition, SearchResult } from './search-executor'
import { agendaAncestorKeys, AgendaRowsCache } from './agenda-rows'
import { applyAgendaCommand, type AgendaCommand, type AgendaState } from './agenda-state'
import { expandNode, isNodeExpanded, type ExpansionState } from './expansion-state'
import type { FocusIntent } from './editor-store-types'

type Navigation = Extract<SearchResult, { kind: 'navigate' }>

type SearchView = { kind: 'tree'; expansion: ExpansionState } | { kind: 'agenda'; agenda: AgendaState }

export type SearchReveal = SearchView & { location: Location; focus: Omit<FocusIntent, 'token'> }

/** Owns search navigation and its temporary folds; the store publishes view changes and schedules saves. */
export class EditorSearch {
  public readonly session = new SearchSession()
  private readonly opened = new Set<string>()
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

  public origin(state: ReadySnapshot, offset: number): SearchPosition {
    if (state.agenda !== undefined) {
      const row = this.agendaRows.get(state.document, state.agenda).find((row) => row.key === state.agenda!.selectedKey)
      if (row !== undefined) {
        return row.kind === 'node' ? { nodeId: row.nodeId, day: row.day, offset } : { beforeDay: row.day, offset: 0 }
      }
    }
    return { nodeId: state.location.selectedNodeId, offset }
  }

  /** Release search-owned folds except ancestors needed to keep the current selection visible. */
  public hideView(state: ReadySnapshot): SearchView | undefined {
    if (state.agenda !== undefined) {
      const agenda = state.agenda
      const selected = this.agendaRows.get(state.document, agenda).find((row) => row.key === agenda.selectedKey)
      const projection = this.agendaRows.getProjection(state.document, agenda)
      const keep = new Set(selected?.kind === 'node' ? agendaAncestorKeys(projection, selected) : [])
      const collapsed = new Set(agenda.collapsed)
      for (const key of this.takeFoldsToClose(keep)) collapsed.add(key)
      this.hide()
      return { kind: 'agenda', agenda: { ...agenda, collapsed } }
    }
    const keep = new Set(requireNode(state.document, state.location.selectedNodeId).ancestors.map((node) => node.id))
    const expandedIds = new Set(state.expansion.expandedIds)
    for (const id of this.takeFoldsToClose(keep)) expandedIds.delete(id)
    this.hide()
    return expandedIds.size === state.expansion.expandedIds.size
      ? undefined
      : { kind: 'tree', expansion: { expandedIds } }
  }

  /** Resolve a destination and retain ownership only of folds opened to reveal it. */
  public revealView(state: ReadySnapshot, destination: SearchDestination): SearchReveal | undefined {
    if (state.agenda !== undefined && destination.day !== undefined) {
      const agenda = state.agenda
      const occurrence = { nodeId: destination.nodeId, day: destination.day }
      const projection = this.agendaRows.getProjection(state.document, agenda)
      const path = agendaAncestorKeys(projection, occurrence)
      if (path === undefined) return undefined
      const collapsed = new Set(agenda.collapsed)
      for (const key of path) {
        if (collapsed.delete(key)) this.recordOpenedFold(key)
      }
      const revealed = { ...agenda, collapsed }
      const rows = this.agendaRows.get(state.document, revealed)
      const next = applyAgendaCommand(
        revealed,
        { kind: 'select', key: `node:${destination.day}:${destination.nodeId}`, cursor: destination.caret },
        rows,
      )
      return {
        kind: 'agenda',
        agenda: next,
        location: { ...state.location, selectedNodeId: destination.nodeId },
        focus: { nodeId: destination.nodeId, cursor: destination.caret, revealLine: true },
      }
    }
    const found = locateNode(state.document, destination.nodeId)
    if (found === undefined || state.agenda !== undefined) return undefined
    let expansion = state.expansion
    let inScope = state.location.currentParentId === null
    for (const ancestor of found.ancestors) {
      if (ancestor.id === state.location.currentParentId) {
        inScope = true
        continue
      }
      if (inScope && !isNodeExpanded(expansion, ancestor.id)) {
        this.recordOpenedFold(ancestor.id)
        expansion = expandNode(expansion, ancestor.id)
      }
    }
    return {
      kind: 'tree',
      expansion,
      location: { ...state.location, selectedNodeId: destination.nodeId },
      focus: { nodeId: destination.nodeId, cursor: destination.caret },
    }
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

  public recordOpenedFold(key: string): void {
    this.opened.add(key)
  }

  /** End search ownership, returning only folds that do not contain the current selection. */
  public takeFoldsToClose(keep: ReadonlySet<string>): string[] {
    const close = [...this.opened].filter((key) => !keep.has(key))
    this.opened.clear()
    return close
  }

  public manualAgendaFold(command: Extract<AgendaCommand, { kind: 'fold' | 'toggle-fold' }>): void {
    const all = command.kind === 'fold' && command.operation.endsWith('all')
    if (all) this.opened.clear()
    else this.opened.delete(command.key)
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
