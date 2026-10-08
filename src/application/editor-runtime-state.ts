import { releaseNodeIndex, type NodeId } from '../domain/document'
import type { EditorSnapshot, FocusIntent } from './editor-store-types'
import { reconcileAgenda } from './agenda-state'

export type ReadySnapshot = Extract<EditorSnapshot, { status: 'ready' }>

export class EditorRuntimeState {
  private readonly listeners = new Set<() => void>()
  private structuralVersion = 0
  private focusToken = 0
  public snapshot: EditorSnapshot = { status: 'loading' }

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
    if (state.agenda !== undefined) next.agenda = reconcileAgenda(state.agenda)
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
    this.emit()
  }

  public emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}
