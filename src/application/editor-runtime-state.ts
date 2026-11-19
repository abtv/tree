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
import { unfinishedParentId, unfinishedTreeLocation } from './finished-task-location'

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
        // Returning to Tree checks the selection against the view of this location below.
        next.location = agendaOriginLocation(
          state.document,
          state.agenda,
          previous.status === 'ready' ? previous.document : state.document,
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
    if (next.agenda === undefined) this.showTreeLocation(next, previous)
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
   * Settles the displayed Tree location and the view of the starred node that governs it
   * (`docs/PRODUCT.md` §2.4). With finished tasks hidden, a hidden selection moves to the next
   * unfinished row (§2.5). That relocation can leave the current parent; its destination depends only on
   * completion, so the view is activated for the final location, and a location Tree never displays
   * creates no view. On a return to Tree, or when the view changes, a selection the view hides moves to
   * its nearest displayed ancestor with the caret at the beginning. While Agenda is open the Tree view
   * stays as it was.
   */
  private showTreeLocation(next: ReadySnapshot, previous: EditorSnapshot): void {
    // Undefined when Tree was not displayed: the editor was loading or Agenda was open.
    const previousTree = previous.status === 'ready' && previous.agenda === undefined ? previous : undefined
    const relocates =
      next.hideFinishedTasks === true &&
      (previousTree === undefined ||
        previousTree.document !== next.document ||
        previousTree.location !== next.location ||
        previousTree.hideFinishedTasks !== next.hideFinishedTasks)
    if (
      previousTree !== undefined &&
      !relocates &&
      previousTree.document === next.document &&
      previousTree.location.currentParentId === next.location.currentParentId &&
      previousTree.expansion.viewOwnerId === next.expansion.viewOwnerId
    )
      return

    const parentId = relocates ? unfinishedParentId(next.document, next.location) : next.location.currentParentId
    const expansion = activateExpansionView(next.expansion, next.document, parentId)
    const switched = expansion !== next.expansion
    next.expansion = expansion

    // A relocation that leaves the current parent chooses its row in the destination below.
    if ((previousTree === undefined || switched) && parentId === next.location.currentParentId) {
      const location = normalizeVisibleLocation(next.document, next.location, (id) => isNodeExpanded(expansion, id))
      if (location !== next.location) {
        next.location = location
        next.focus = this.newFocus(location.selectedNodeId, 0)
      }
    }

    if (!relocates) return
    const location = unfinishedTreeLocation(next.document, next.location, expansion)
    if (location === next.location) return
    const node = locateNode(next.document, location.selectedNodeId)!.node
    next.location = location
    next.focus = this.newFocus(node.id, Math.min(next.focus.cursor, node.text.length))
  }

  public emit(): void {
    if (this.snapshot.status === 'ready') this.beforePublish(this.snapshot)
    this.listeners.forEach((listener) => listener())
  }
}
