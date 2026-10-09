import { isValidLocation, normalizeVisibleLocation, releaseNodeIndex, type NodeId } from '../domain/document'
import type { EditorSnapshot, FocusIntent } from './editor-store-types'
import { agendaOriginLocation, reconcileAgenda } from './agenda-reconcile'
import { isNodeExpanded } from './expansion-state'

export type ReadySnapshot = Extract<EditorSnapshot, { status: 'ready' }>

export class EditorRuntimeState {
  private readonly listeners = new Set<() => void>()
  private structuralVersion = 0
  private focusToken = 0
  public snapshot: EditorSnapshot = { status: 'loading' }

  public constructor(private readonly onAgendaClosed: () => void = () => undefined) {}

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
        (previous.agenda?.pinnedOccurrence !== undefined && state.agenda.pinnedOccurrence === undefined))
    ) {
      const agenda = reconcileAgenda(state.document, state.agenda)
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
        const active = agenda.activeOccurrence
        // Publication enforces Agenda's active node even when the command already selected that same ID.
        if (active !== undefined)
          next.location = { currentParentId: agenda.scopeParentId, selectedNodeId: active.nodeId }
        else if (!isValidLocation(state.document, { ...next.location, currentParentId: agenda.scopeParentId })) {
          next.location = {
            currentParentId: agenda.scopeParentId,
            selectedNodeId: agenda.scopeParentId ?? state.document.roots[0]!.id,
          }
          next.focus = this.newFocus(next.location.selectedNodeId, 0)
        }
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

  public emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
