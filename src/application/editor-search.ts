import { locateNode, type Location } from '../domain/document'
import type { SearchScope } from '../domain/search-scope'
import type { ReadySnapshot } from './editor-runtime-state'
import { SearchSession } from './search-session'
import type { SearchDestination, SearchPosition, SearchResult } from './search-executor'
import { agendaAncestorKeys, AgendaRowsCache } from './agenda-rows'
import { focusedAgendaDay, applyAgendaCommand, type AgendaCommand, type AgendaState } from './agenda-state'
import { expandNode, governingViewOwner, isNodeExpanded, type ExpansionState } from './expansion-state'
import type { EditorSnapshot, FocusIntent } from './editor-store-types'

type Navigation = Extract<SearchResult, { kind: 'navigate' }>
type NavigationQueue = { direction: -1 | 1; count: number; repeats: number }[]

type SearchView = { kind: 'tree'; expansion: ExpansionState } | { kind: 'agenda'; agenda: AgendaState }

export type SearchReveal = SearchView & { location: Location; focus: Omit<FocusIntent, 'token'> }

/** Search closes whenever this key changes. */
function scopeKeyOf(state: ReadySnapshot): string {
  const agenda = state.agenda
  return agenda === undefined
    ? `tree:${state.location.currentParentId ?? ''}`
    : `agenda:${agenda.scopeParentId ?? ''}:${agenda.weekStart}:${focusedAgendaDay(agenda) ?? 'timeline'}`
}

/**
 * Closing Find keeps the folds that show the Tree selection. Publication may install a location that
 * the runtime corrects afterwards, so a missing selection keeps nothing instead of throwing.
 */
function selectedPath(state: ReadySnapshot): Set<string> {
  return new Set(locateNode(state.document, state.location.selectedNodeId)?.ancestors.map((node) => node.id) ?? [])
}

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
    const key = scopeKeyOf(state)
    const projection = agenda === undefined ? undefined : this.agendaRows.getProjection(state.document, agenda)
    const changedProjection = this.scope.kind === 'agenda' && this.scope.projection !== projection
    const changedScope = key !== this.scopeKey
    const changedDocument = previous?.document !== state.document
    // In Tree, opened folds belong to the view Find changed. A star change that switches the view closes
    // them before publication; ids left after any other view change, such as a dropped view, are not this
    // view's choices, so ownership ends. Under Agenda, opened folds are Agenda days and branches, which a
    // change of the hidden Tree view leaves alone.
    if (
      previous !== undefined &&
      agenda === undefined &&
      previous.expansion.viewOwnerId !== state.expansion.viewOwnerId
    )
      this.opened.clear()
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
      const agenda = this.closeAgendaFolds(state, state.agenda)
      this.hide()
      return { kind: 'agenda', agenda }
    }
    const expansion = this.closeTreeFolds(state)
    this.hide()
    return expansion === state.expansion ? undefined : { kind: 'tree', expansion }
  }

  /**
   * Ends ownership of Agenda folds, closing those that do not show the selected occurrence. When the folds
   * were opened in the timeline that a newly focused day remembers, that timeline closes them too, keeping
   * its own selection.
   */
  private closeAgendaFolds(state: ReadySnapshot, agenda: AgendaState, inTimelineReturn = false): AgendaState {
    const opened = [...this.opened]
    const collapsed = new Set(agenda.collapsed)
    for (const key of this.takeFoldsToClose(this.selectedAgendaPath(state, agenda))) collapsed.add(key)
    if (!inTimelineReturn || agenda.presentation.kind !== 'focused-day') return { ...agenda, collapsed }
    const timeline = agenda.presentation.timelineReturn
    const returned: AgendaState = { ...agenda, ...timeline, presentation: { kind: 'timeline' } }
    const keep = this.selectedAgendaPath(state, returned)
    const timelineCollapsed = new Set(timeline.collapsed)
    for (const key of opened) if (!keep.has(key)) timelineCollapsed.add(key)
    const timelineReturn = { ...timeline, collapsed: timelineCollapsed }
    return { ...agenda, collapsed, presentation: { ...agenda.presentation, timelineReturn } }
  }

  private selectedAgendaPath(state: ReadySnapshot, agenda: AgendaState): Set<string> {
    const selected = this.agendaRows.get(state.document, agenda).find((row) => row.key === agenda.selectedKey)
    const projection = this.agendaRows.getProjection(state.document, agenda)
    return new Set(selected?.kind === 'node' ? agendaAncestorKeys(projection, selected, agenda) : [])
  }

  /** Ends ownership of Tree folds, closing those that do not show the selected node. */
  private closeTreeFolds(state: ReadySnapshot): ExpansionState {
    const expansion = this.treeFoldsEscapeLeaves(state)
    this.opened.clear()
    return expansion
  }

  /** The one Tree fold policy shared by Escape and saves (§20.2.31): only the selected path stays open. */
  private treeFoldsEscapeLeaves(state: ReadySnapshot): ExpansionState {
    if (this.opened.size === 0) return state.expansion
    const keep = selectedPath(state)
    const expandedIds = new Set(state.expansion.expandedIds)
    for (const id of this.opened) if (!keep.has(id)) expandedIds.delete(id)
    return expandedIds.size === state.expansion.expandedIds.size ? state.expansion : { ...state.expansion, expandedIds }
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
      focus: { nodeId: destination.nodeId, cursor: destination.caret, revealLine: true },
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

  /**
   * Search folds end with their scope or view: a Tree location change, opening Agenda, a star change that
   * switches the expansion view, or a change of Agenda week or focused day. They close as Escape closes
   * them, before the runtime activates the next view, so a view that copies its expansion never inherits
   * them. Closing Agenda discards its folds, and the Tree view kept none of search's.
   */
  public closeFoldsLeavingScope(next: ReadySnapshot, previous: EditorSnapshot): void {
    if (this.opened.size === 0 || previous.status !== 'ready') return
    if (previous.agenda !== undefined) {
      if (next.agenda === undefined || scopeKeyOf(next) === scopeKeyOf(previous)) return
      const focused = previous.agenda.presentation.kind === 'focused-day'
      // Folds search opened in a focused day end with its folds, and update ends their ownership with the
      // scope; the restored timeline keeps its own folds (§23.15).
      if (focused && next.agenda.presentation.kind === 'timeline') return
      // Only focusing a day carries timeline folds into the timeline it returns to.
      next.agenda = this.closeAgendaFolds(next, next.agenda, !focused)
      return
    }
    if (next.expansion.viewOwnerId !== previous.expansion.viewOwnerId) return
    const leaves = next.agenda !== undefined || next.location.currentParentId !== previous.location.currentParentId
    // Only a document change, such as a star, can change the view that governs an unchanged location.
    const switchesView =
      !leaves &&
      next.document !== previous.document &&
      governingViewOwner(next.document, next.location.currentParentId) !== next.expansion.viewOwnerId
    if (!leaves && !switchesView) return
    // Escape in the view being left keeps the path to the selection there, not to where the change leads.
    next.expansion = this.closeTreeFolds({ ...next, location: previous.location })
  }

  /** Tree expansion as a save stores it: search-owned folds stay runtime state, as if Find had closed. */
  public persistentExpansion(state: ReadySnapshot): ExpansionState {
    // Under Agenda, opened folds are Agenda keys; the hidden Tree expansion holds none of search's.
    return state.agenda === undefined ? this.treeFoldsEscapeLeaves(state) : state.expansion
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
