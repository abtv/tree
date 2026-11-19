import { pinnedAgendaOccurrence, activeAgendaOccurrence } from './agenda-state'
import {
  isValidLocation,
  locateNode,
  normalizeVisibleLocation,
  releaseNodeIndex,
  type NodeId,
} from '../domain/document'
import type { EditorSnapshot, FocusIntent } from './editor-store-types'
import { agendaOriginLocation, reconcileAgenda } from './agenda-reconcile'
import { activateExpansionView, isNodeExpanded } from './expansion-state'
import type { AgendaRowsCache } from './agenda-rows'
import { unfinishedTreeLocation } from './finished-task-location'

export type ReadySnapshot = Extract<EditorSnapshot, { status: 'ready' }>

export class EditorRuntimeState {
  private readonly listeners = new Set<() => void>()
  private structuralVersion = 0
  private focusToken = 0
  public snapshot: EditorSnapshot = { status: 'loading' }

  public constructor(
    private readonly onAgendaClosed: () => void = () => undefined,
    private readonly agendaRowsCache?: AgendaRowsCache,
    private readonly beforePublish: (state: ReadySnapshot) => void = () => undefined,
  ) {}

  public getSnapshot = (): EditorSnapshot => this.snapshot

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public getStructuralVersion(): number {
    return this.structuralVersion
  }

  public newFocus(nodeId: NodeId, cursor: number): FocusIntent {
    this.focusToken += 1
    return { nodeId, cursor, token: this.focusToken }
  }

  public ready(): ReadySnapshot {
    if (this.snapshot.status !== 'ready') throw new Error('The editor is not ready.')
    return this.snapshot
  }

  public replaceReady(state: ReadySnapshot, changedStructure = false): void {
    const previous = this.snapshot
    if (changedStructure) this.structuralVersion += 1
    const next = { ...state, structuralVersion: this.structuralVersion }
    if (
      state.agenda !== undefined &&
      (previous.status !== 'ready' ||
        previous.document !== state.document ||
        previous.agenda === undefined ||
        previous.hideFinishedTasks !== state.hideFinishedTasks ||
        (pinnedAgendaOccurrence(previous.agenda) !== undefined && pinnedAgendaOccurrence(state.agenda) === undefined))
    ) {
      const agenda = reconcileAgenda(
        state.document,
        state.agenda,
        false,
        this.agendaRowsCache,
        previous.status === 'ready' ? previous.document : state.document,
        previous.status === 'ready' ? previous.agenda : undefined,
      )
      if (agenda === undefined) {
        delete next.agenda
        next.location = normalizeVisibleLocation(
          state.document,
          agendaOriginLocation(
            state.document,
            state.agenda,
            previous.status === 'ready' ? previous.document : state.document,
          ),
          (id) => isNodeExpanded(state.expansion, id),
        )
        next.focus = this.newFocus(next.location.selectedNodeId, 0)
      } else {
        next.agenda = agenda
        const active = activeAgendaOccurrence(agenda)
        // Publication enforces Agenda's active node even when the command already selected that same ID.
        if (active !== undefined) {
          next.location = { currentParentId: agenda.scopeParentId, selectedNodeId: active.nodeId }
          if (state.hideFinishedTasks && active.nodeId !== next.focus.nodeId) {
            const node = locateNode(state.document, active.nodeId)!.node
            next.focus = this.newFocus(active.nodeId, Math.min(state.focus.cursor, node.text.length))
          }
        } else if (!isValidLocation(state.document, { ...next.location, currentParentId: agenda.scopeParentId })) {
          next.location = {
            currentParentId: agenda.scopeParentId,
            selectedNodeId: agenda.scopeParentId ?? state.document.roots[0]!.id,
          }
          next.focus = this.newFocus(next.location.selectedNodeId, 0)
        }
      }
    }
    if (next.agenda === undefined) this.showGoverningView(next, previous)
    if (
      next.agenda === undefined &&
      next.hideFinishedTasks &&
      (previous.status !== 'ready' ||
        previous.document !== next.document ||
        previous.location !== next.location ||
        previous.hideFinishedTasks !== next.hideFinishedTasks ||
        previous.agenda !== undefined)
    ) {
      let location = unfinishedTreeLocation(next.document, next.location, next.expansion)
      if (location.currentParentId !== next.location.currentParentId) {
        // Leaving a finished parent can leave its starred view too. The parent the function selects
        // depends only on completion, so a second pass picks the row with the destination's view.
        next.expansion = activateExpansionView(next.expansion, next.document, location.currentParentId)
        location = unfinishedTreeLocation(next.document, next.location, next.expansion)
      }
      if (location !== next.location) {
        const node = locateNode(next.document, location.selectedNodeId)!.node
        next.location = location
        next.focus = this.newFocus(node.id, Math.min(next.focus.cursor, node.text.length))
      }
    }
    // Both branches install the same snapshot; the delete only drops an explicit `operationError: undefined` key.
    if (next.operationError === undefined) {
      this.snapshot = next
    } else {
      delete next.operationError
      this.snapshot = next
    }
    // The status operand only narrows the type: a loading snapshot has no document, so releasing `undefined` is a no-op.
    if (previous.status === 'ready' && previous.document !== this.snapshot.document) {
      releaseNodeIndex(previous.document)
    }
    if (previous.status === 'ready' && previous.agenda !== undefined && next.agenda === undefined) this.onAgendaClosed()
    this.emit()
  }

  /**
   * Tree shows the view of the starred node that governs its location (`docs/PRODUCT.md` §2.4). A
   * location change, a star change, or undo can switch that view; a selection the new view hides moves
   * to its nearest displayed ancestor, with the caret at the beginning. While Agenda is open the Tree
   * view stays as it was.
   */
  private showGoverningView(next: ReadySnapshot, previous: EditorSnapshot): void {
    if (
      previous.status === 'ready' &&
      previous.agenda === undefined &&
      previous.document === next.document &&
      previous.location.currentParentId === next.location.currentParentId &&
      previous.expansion.viewOwnerId === next.expansion.viewOwnerId
    )
      return
    const expansion = activateExpansionView(next.expansion, next.document, next.location.currentParentId)
    if (expansion === next.expansion) return
    next.expansion = expansion
    const location = normalizeVisibleLocation(next.document, next.location, (id) => isNodeExpanded(expansion, id))
    if (location === next.location) return
    next.location = location
    next.focus = this.newFocus(location.selectedNodeId, 0)
  }

  public emit(): void {
    if (this.snapshot.status === 'ready') this.beforePublish(this.snapshot)
    this.listeners.forEach((listener) => listener())
  }
}
