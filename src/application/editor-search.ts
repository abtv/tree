import { locateNode, requireNode, type Location } from '../domain/document'
import type { SearchScope } from '../domain/search-scope'
import type { ReadySnapshot } from './editor-runtime-state'
import { SearchSession } from './search-session'
import type { SearchDestination, SearchPosition, SearchResult } from './search-executor'
import { agendaAncestorKeys, AgendaRowsCache } from './agenda-rows'
import { focusedAgendaDay, applyAgendaCommand, type AgendaCommand, type AgendaState } from './agenda-state'
import { expandNode, isNodeExpanded, type ExpansionState } from './expansion-state'
import type { FocusIntent } from './editor-store-types'

type Navigation = Extract<SearchResult, { kind: 'navigate' }>
type NavigationQueue = { direction: -1 | 1; count: number; repeats: number }[]

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
  private navigation: NavigationQueue | undefined
  private applying = false
  private anchor: SearchDestination | undefined
  private result: Navigation | undefined
  private readonly listeners = new Set<() => void>()
  private readonly jumpListeners = new Set<() => void>()

  public constructor(
    private readonly apply: (destination: SearchDestination) => boolean,
    private readonly agendaRows: AgendaRowsCache,
  ) {
    this.session.subscribe(() => this.listeners.forEach((listener) => listener()))
  }

  public getResult = (): Navigation | undefined => this.result
  public onJump(listener: () => void): () => void {
    this.jumpListeners.add(listener)
    return () => this.jumpListeners.delete(listener)
  }

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
        ? `tree:${state.location.currentParentId ?? ''}:${Boolean(state.hideFinishedTasks)}`
        : `agenda:${agenda.scopeParentId ?? ''}:${agenda.weekStart}:${focusedAgendaDay(agenda) ?? 'timeline'}:${Boolean(state.hideFinishedTasks)}`
    const projection = agenda === undefined ? undefined : this.agendaRows.getProjection(state.document, agenda)
    const changedProjection = this.scope.kind === 'agenda' && this.scope.projection !== projection
    const changedScope = key !== this.scopeKey
    const changedDocument = previous?.document !== state.document
    // Opened folds belong to the view Find changed. After a star change switches the active view, the
    // same ids in the new view are the user's choices, so Find no longer closes them.
    if (previous !== undefined && previous.expansion.viewOwnerId !== state.expansion.viewOwnerId) this.opened.clear()
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
        ? {
            kind: 'tree',
            parentId: state.location.currentParentId,
            hideFinishedTasks: Boolean(state.hideFinishedTasks),
          }
        : {
            kind: 'agenda',
            projection: projection!,
            ...(agenda.presentation.kind === 'timeline' ? {} : { focusedDay: agenda.presentation.day }),
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
    if (this.session.getSnapshot().draft === undefined) return
    this.cancelNavigation()
    const queue: NavigationQueue = []
    this.navigation = queue
    this.session.confirm((result) => this.publish(result, queue), direction)
    if (!this.session.getSnapshot().visible && this.navigation === queue) this.navigation = undefined
  }

  public hide(): void {
    this.cancelNavigation()
    this.session.hide()
  }

  public origin(state: ReadySnapshot, offset: number): SearchPosition {
    if (state.agenda !== undefined) {
      const row = this.agendaRows.get(state.document, state.agenda).find((row) => row.key === state.agenda!.selectedKey)
      if (row !== undefined) {
        if (row.kind === 'day' && row.overdue) {
          const first = this.agendaRows.getProjection(state.document, state.agenda)[0]
          return { beforeDay: first?.day ?? row.day, offset: 0 }
        }
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
      const keep = new Set(selected?.kind === 'node' ? agendaAncestorKeys(projection, selected, agenda) : [])
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
      : { kind: 'tree', expansion: { ...state.expansion, expandedIds } }
  }

  /** Resolve a destination and retain ownership only of folds opened to reveal it. */
  public revealView(state: ReadySnapshot, destination: SearchDestination): SearchReveal | undefined {
    if (state.agenda !== undefined && destination.day !== undefined) {
      const agenda = state.agenda
      const occurrence = { nodeId: destination.nodeId, day: destination.day }
      const projection = this.agendaRows.getProjection(state.document, agenda)
      const path = agendaAncestorKeys(projection, occurrence, agenda)
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
        agenda: { ...next, activity: { kind: 'dated', occurrence } },
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
    if (!this.navigation && this.anchor === undefined) return
    this.navigation = undefined
    this.anchor = undefined
    this.session.interruptNavigation()
  }

  public navigate(origin: SearchPosition, direction: -1 | 1, count: number): void {
    const snapshot = this.session.getSnapshot()
    if (!snapshot.confirmed || snapshot.draft !== undefined) return
    if (this.navigation) {
      const last = this.navigation.at(-1)
      if (last?.direction === direction && last.count === count) last.repeats++
      else this.navigation.push({ direction, count, repeats: 1 })
      return
    }
    const queue: NavigationQueue = []
    this.navigation = queue
    this.startJump(origin, direction, count, queue)
  }

  private startJump(origin: SearchPosition, direction: -1 | 1, count: number, queue: NavigationQueue): void {
    const anchor = this.anchor
    const position =
      anchor !== undefined &&
      anchor.nodeId === origin.nodeId &&
      anchor.day === origin.day &&
      anchor.caret === origin.offset
        ? { ...anchor, offset: anchor.start }
        : origin
    this.session.navigate(position, direction, count, (result) => this.publish(result, queue))
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
    this.navigation = undefined
    this.anchor = undefined
    this.result = undefined
  }

  private publish(result: Navigation, queue: NavigationQueue): void {
    if (queue !== this.navigation) return
    if (result.destination !== undefined) {
      this.anchor = result.destination
      this.applying = true
      try {
        // Moving away from a pinned Agenda occurrence can invalidate the ordinal during apply.
        // The editor still needs the actual arrival to finish its Visual or Replace session.
        if (this.apply(result.destination)) this.jumpListeners.forEach((listener) => listener())
      } finally {
        this.applying = false
      }
    }
    if (queue !== this.navigation) return
    this.result = result
    const next = result.destination && queue[0]
    if (next === undefined) this.navigation = undefined
    this.listeners.forEach((listener) => listener())
    if (next && result.destination && queue === this.navigation) {
      if (--next.repeats === 0) queue.shift()
      this.startJump({ ...result.destination, offset: result.destination.caret }, next.direction, next.count, queue)
    }
  }
}
