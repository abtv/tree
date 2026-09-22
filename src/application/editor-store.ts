import {
  collectAttachmentIds,
  createInitialDocument,
  deleteLink,
  editNodeContent,
  isValidLocation,
  locateNode,
  parsePersistedState,
  releaseNodeIndex,
  replaceLinkedText,
  removeTextRange,
  requireNode,
  type AttachmentId,
  type AttachmentReference,
  type Document,
  type LinkRange,
  type Location,
  type NodeId,
} from '../domain/document'
import { CUT_CONFLICT_ERROR, GENERIC_OPERATION_ERROR } from '../domain/product-messages'
import { clipboardSelectionTransition, imagePasteTransition, textPasteTransition } from './editor-clipboard-transitions'
import {
  ancestorNavigationTransition,
  createSiblingTransition,
  createSiblingOrFirstChildTransition,
  deleteEmptySelectedTransition,
  deleteSelectedTransition,
  enterTransition,
  leaveTransition,
  moveHorizontalTransition,
  moveNodeTransition,
  moveSelectionTransition,
  moveSelectionBoundaryTransition,
} from './editor-command-transitions'
import { clipboardIntroducesLink, hasNewLink, nodeContent, sameNodeContent } from './editor-content-changes'
import { EditorHistory } from './editor-history'
import { EditorSaveScheduler } from './editor-save-scheduler'
import { EditorTextSession } from './editor-text-session'
import {
  systemClock,
  type Clock,
  type EditorServices,
  type EditorSnapshot,
  type FocusIntent,
} from './editor-store-types'
import type { PersistenceFailureKind } from './persistence-coordinator'
import { countInsertedWords, countPastedWords } from './save-policy'

export type { ClipboardValue, Clock, EditorServices, EditorSnapshot, FocusIntent } from './editor-store-types'

export class EditorStore {
  private readonly listeners = new Set<() => void>()
  private readonly history = new EditorHistory()
  private readonly pendingAttachmentIds = new Set<AttachmentId>()
  private readonly textSession: EditorTextSession
  private readonly saveScheduler: EditorSaveScheduler
  private snapshot: EditorSnapshot = { status: 'loading' }
  private structuralVersion = 0
  private pendingClipboardOperation: Promise<void> | undefined
  private readonly pendingEdits = new Set<Promise<void>>()
  private focusToken = 0
  public constructor(
    private readonly services: EditorServices,
    private readonly createId: () => string,
    clock: Clock = systemClock,
  ) {
    this.textSession = new EditorTextSession(clock)
    this.saveScheduler = new EditorSaveScheduler(services, clock, {
      currentState: () => (this.snapshot.status === 'ready' ? this.snapshot : undefined),
      referencedAttachmentIds: () => this.referencedAttachmentIds(),
      isPersistenceLocked: () => this.isPersistenceLocked(),
      onPersistenceResult: (error, kind) => this.handlePersistenceResult(error, kind),
    })
  }

  public getSnapshot = (): EditorSnapshot => this.snapshot

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public async flushPersistence(): Promise<void> {
    do {
      await Promise.all(this.pendingEdits)
      if (this.saveScheduler.hasPendingChanges()) this.saveScheduler.requestImmediateSave()
      await this.saveScheduler.flush()
    } while (this.pendingEdits.size > 0 || this.saveScheduler.hasPendingChanges())
  }

  public reportError(error: unknown): void {
    if (this.snapshot.status !== 'ready') return
    this.snapshot = { ...this.snapshot, operationError: messageOf(error) }
    this.emit()
  }

  public requestQuitWithoutSavingPrompt(): void {
    if (this.snapshot.status !== 'ready' || this.snapshot.persistenceLocked !== true) return
    if (this.snapshot.quitWithoutSavingPrompt === true) return
    this.snapshot = { ...this.snapshot, quitWithoutSavingPrompt: true }
    this.emit()
  }

  public dismissQuitWithoutSavingPrompt(): void {
    if (this.snapshot.status !== 'ready' || this.snapshot.quitWithoutSavingPrompt !== true) return
    const next = { ...this.snapshot }
    delete next.quitWithoutSavingPrompt
    this.snapshot = next
    this.emit()
  }

  public async initialize(): Promise<void> {
    try {
      const loaded = await this.services.load()
      if (loaded === null) {
        const rootId = this.createId()
        this.snapshot = {
          status: 'ready',
          document: createInitialDocument(rootId),
          location: { currentParentId: null, selectedNodeId: rootId },
          focus: this.newFocus(rootId, 0),
          structuralVersion: this.structuralVersion,
        }
        this.emit()
        this.saveScheduler.requestSave()
        this.queueAttachmentCleanup()
        return
      }

      const parsed = parsePersistedState(loaded)
      this.snapshot = {
        status: 'ready',
        document: parsed.document,
        location: parsed.location,
        focus: this.newFocus(parsed.location.selectedNodeId, 0),
        structuralVersion: this.structuralVersion,
      }
      this.emit()
      this.queueAttachmentCleanup()
    } catch (error) {
      this.snapshot = { status: 'error', message: messageOf(error) }
      this.emit()
    }
  }

  public selectNode(nodeId: NodeId, cursor: number): void {
    const state = this.ready()
    if (!isValidLocation(state.document, { ...state.location, selectedNodeId: nodeId })) {
      return
    }
    this.endTextSession()
    this.replaceReady({
      ...state,
      location: { ...state.location, selectedNodeId: nodeId },
      focus: this.newFocus(nodeId, cursor),
    })
    this.markPersistedChange()
  }

  public editText(nodeId: NodeId, text: string): void {
    this.editContent(nodeId, text, [])
  }

  public editContent(nodeId: NodeId, text: string, links: readonly LinkRange[]): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const node = requireNode(state.document, nodeId).node
    if (node.text === text) {
      return
    }
    if (!this.textSession.isActive(nodeId)) {
      this.textSession.end()
      if (this.history.begin(state.document)) this.queueAttachmentCleanup()
      this.textSession.begin(nodeId)
    }
    const insertedWords = countInsertedWords(node.text, text)
    const linkInserted = hasNewLink(node.links, links)
    const next = editNodeContent(state.document, nodeId, text, links)
    this.replaceReady({ ...state, document: next })
    this.noteChange(insertedWords, linkInserted)
    this.textSession.scheduleBoundary()
    this.textSession.endIfStandalone()
  }

  public replaceTextRange(nodeId: NodeId, start: number, end: number, text: string): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const node = requireNode(state.document, nodeId).node
    const replacement = replaceLinkedText(node.text, node.links ?? [], start, end, text)
    this.endTextSession()
    if (this.history.begin(state.document)) this.queueAttachmentCleanup()
    this.textSession.markNextEditStandalone()
    this.editContent(nodeId, replacement.text, replacement.links)
  }

  public deleteLink(nodeId: NodeId, cursor: number): boolean {
    const state = this.ready()
    if (this.isPersistenceLocked()) return false
    const linkStart = requireNode(state.document, nodeId).node.links?.find((link) => link.end === cursor)?.start
    if (linkStart === undefined) return false
    const next = deleteLink(state.document, nodeId, cursor)
    if (next === undefined) return false
    this.endTextSession()
    this.applyStructural(next, state.location, this.newFocus(nodeId, linkStart))
    return true
  }

  public async copy(nodeId: NodeId, start: number, end: number): Promise<boolean> {
    const state = this.ready()
    const transition = clipboardSelectionTransition(state.document, nodeId, start, end)
    if (transition === undefined || this.services.writeClipboard === undefined) return false
    const operation = this.services.writeClipboard(transition.payload)
    this.pendingClipboardOperation = operation
    try {
      await operation
      return true
    } finally {
      if (this.pendingClipboardOperation === operation) this.pendingClipboardOperation = undefined
    }
  }

  public async cut(nodeId: NodeId, start: number, end: number): Promise<boolean> {
    const state = this.ready()
    if (this.isPersistenceLocked()) return false
    const transition = clipboardSelectionTransition(state.document, nodeId, start, end)
    if (transition === undefined || this.services.writeClipboard === undefined) return false
    this.endTextSession()
    const expectedContent = nodeContent(requireNode(state.document, nodeId).node)
    const operation = (async (): Promise<void> => {
      await this.services.writeClipboard!(transition.payload)
      if (this.snapshot.status !== 'ready' || this.snapshot.location.selectedNodeId !== nodeId) return
      const current = locateNode(this.snapshot.document, nodeId)?.node
      if (current === undefined) return
      if (!sameNodeContent(current, expectedContent)) {
        this.reportError(new Error(CUT_CONFLICT_ERROR))
        return
      }
      this.applyStructural(
        removeTextRange(this.snapshot.document, nodeId, transition.from, transition.to),
        this.snapshot.location,
        this.newFocus(nodeId, transition.from),
      )
    })()
    this.pendingClipboardOperation = operation
    try {
      await this.trackEdit(operation)
      return true
    } finally {
      if (this.pendingClipboardOperation === operation) this.pendingClipboardOperation = undefined
    }
  }

  public endTextSession(): void {
    this.textSession.end()
  }

  public markNextTextEditStandalone(): void {
    this.textSession.markNextEditStandalone()
  }

  public moveSelection(direction: 'up' | 'down', cursor: number): void {
    const state = this.ready()
    const target = moveSelectionTransition(state.document, state.location, direction, cursor)
    if (target !== undefined) this.selectNode(target.nodeId, target.cursor)
  }

  public moveSelectionBoundary(boundary: 'first' | 'last', cursor: number): void {
    const state = this.ready()
    const target = moveSelectionBoundaryTransition(state.document, state.location, boundary, cursor)
    if (target !== undefined) this.selectNode(target.nodeId, target.cursor)
  }

  public moveHorizontal(direction: 'left' | 'right', cursor: number): boolean {
    const state = this.ready()
    const target = moveHorizontalTransition(state.document, state.location, direction, cursor)
    if (target === undefined) return false
    this.selectNode(target.nodeId, target.cursor)
    return true
  }

  public enter(): void {
    const state = this.ready()
    const transition = enterTransition(state.document, state.location)
    if (transition === undefined) return
    this.endTextSession()
    this.replaceReady(
      {
        ...state,
        location: transition.location,
        focus: this.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
    this.markPersistedChange()
  }

  public leave(): void {
    const state = this.ready()
    const transition = leaveTransition(state.document, state.location)
    if (transition === undefined) return
    this.endTextSession()
    this.replaceReady(
      {
        ...state,
        location: transition.location,
        focus: this.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
    this.markPersistedChange()
  }

  public navigateToAncestor(parentId: NodeId | null): void {
    const state = this.ready()
    const transition = ancestorNavigationTransition(state.document, state.location, parentId)
    if (transition === undefined) return
    this.endTextSession()
    this.replaceReady(
      {
        ...state,
        location: transition.location,
        focus: this.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
    this.markPersistedChange()
  }

  public createSiblingOrFirstChild(cursor: number): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const transition = createSiblingOrFirstChildTransition(state.document, state.location, cursor, this.createId)
    if (transition.kind === 'rejected') {
      this.reportError(new Error(transition.message))
      return
    }
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
  }

  public createSibling(position: 'before' | 'after'): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const transition = createSiblingTransition(state.document, state.location, position, this.createId)
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
  }

  public deleteSelected(): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    this.endTextSession()
    const transition = deleteSelectedTransition(state.document, state.location, this.createId)
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    this.queueAttachmentCleanup()
  }

  public deleteEmptySelected(): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const transition = deleteEmptySelectedTransition(state.document, state.location)
    if (transition === undefined) return
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    this.queueAttachmentCleanup()
  }

  public moveSelectedTo(insertionIndex: number): void {
    const state = this.ready()
    this.moveNodeTo(state.location.selectedNodeId, insertionIndex)
  }

  public moveNodeTo(nodeId: NodeId, insertionIndex: number): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const cursor = state.focus.nodeId === nodeId ? state.focus.cursor : 0
    const transition = moveNodeTransition(state.document, state.location, nodeId, insertionIndex, cursor)
    if (transition === undefined) return
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
  }

  public async paste(nodeId: NodeId, cursor: number): Promise<void> {
    if (this.isPersistenceLocked()) return
    await this.trackEdit(this.pasteFromClipboard(nodeId, cursor))
  }

  private async trackEdit(operation: Promise<void>): Promise<void> {
    this.pendingEdits.add(operation)
    try {
      await operation
    } finally {
      this.pendingEdits.delete(operation)
    }
  }

  private async pasteFromClipboard(nodeId: NodeId, cursor: number): Promise<void> {
    this.ready()
    this.endTextSession()
    await this.pendingClipboardOperation
    const clipboard = await this.services.readClipboard()
    if (this.snapshot.status !== 'ready' || this.snapshot.location.selectedNodeId !== nodeId) {
      return
    }
    const current = this.ready()
    if (clipboard.kind === 'image') {
      const attachment: AttachmentReference = { id: this.createId(), mimeType: 'image/png' }
      this.pendingAttachmentIds.add(attachment.id)
      try {
        await this.services.writeAttachment(attachment.id, clipboard.png)
        if (this.snapshot.status !== 'ready' || this.snapshot.location.selectedNodeId !== nodeId) {
          return
        }
        const transition = imagePasteTransition(
          this.snapshot.document,
          this.snapshot.location,
          nodeId,
          attachment,
          this.createId,
        )
        this.applyStructural(
          transition.document,
          transition.location,
          this.newFocus(transition.focus.nodeId, transition.focus.cursor),
        )
        this.requestImmediateSave()
      } finally {
        this.pendingAttachmentIds.delete(attachment.id)
        this.queueAttachmentCleanup()
      }
      return
    }

    const transition = textPasteTransition(current.document, current.location, nodeId, cursor, clipboard, (count) =>
      Array.from({ length: count }, () => this.createId()),
    )
    const node = requireNode(current.document, nodeId).node
    const position = Math.max(0, Math.min(cursor, node.text.length))
    const insertedWords = countPastedWords(clipboard.text, position > 0 ? node.text[position - 1] : undefined)
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    this.noteChange(insertedWords, clipboardIntroducesLink(clipboard))
  }

  public undo(): void {
    this.endTextSession()
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const previous = this.history.undo(state.document, state.location)
    if (previous === undefined) return
    this.replaceReady(
      {
        ...state,
        document: previous.document,
        location: previous.location,
        focus: this.newFocus(previous.location.selectedNodeId, 0),
      },
      true,
    )
    this.markPersistedChange()
    this.queueAttachmentCleanup()
  }

  public redo(): void {
    this.endTextSession()
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    const next = this.history.redo(state.document, state.location)
    if (next === undefined) return
    this.replaceReady(
      {
        ...state,
        document: next.document,
        location: next.location,
        focus: this.newFocus(next.location.selectedNodeId, 0),
      },
      true,
    )
    this.markPersistedChange()
    this.queueAttachmentCleanup()
  }

  private applyStructural(document: Document, location: Location, focus: FocusIntent): void {
    const state = this.ready()
    if (this.isPersistenceLocked()) return
    if (this.history.begin(state.document)) this.queueAttachmentCleanup()
    this.replaceReady({ ...state, document, location, focus }, true)
    this.markPersistedChange()
  }

  private replaceReady(state: Extract<EditorSnapshot, { status: 'ready' }>, changedStructure = false): void {
    const previous = this.snapshot
    if (changedStructure) this.structuralVersion += 1
    const next = { ...state, structuralVersion: this.structuralVersion }
    if (next.operationError === undefined) {
      this.snapshot = next
    } else {
      delete next.operationError
      this.snapshot = next
    }
    if (previous.status === 'ready' && previous.document !== this.snapshot.document) {
      releaseNodeIndex(previous.document)
    }
    this.emit()
  }

  private markPersistedChange(): void {
    this.saveScheduler.markPersistedChange()
  }

  private noteChange(insertedWords: number, saveImmediately: boolean): void {
    this.saveScheduler.noteChange(insertedWords, saveImmediately)
  }

  private requestImmediateSave(): void {
    this.saveScheduler.requestImmediateSave()
  }

  private queueAttachmentCleanup(): void {
    this.saveScheduler.requestAttachmentCleanup()
  }

  private referencedAttachmentIds(): Set<AttachmentId> {
    const ids = new Set<AttachmentId>()
    if (this.snapshot.status === 'ready') {
      collectAttachmentIds(this.snapshot.document).forEach((id) => ids.add(id))
    }
    for (const id of this.history.attachmentIds()) ids.add(id)
    this.pendingAttachmentIds.forEach((id) => ids.add(id))
    return ids
  }

  private handlePersistenceResult(error: unknown | undefined, kind?: PersistenceFailureKind): void {
    if (this.snapshot.status !== 'ready') return
    if (error === undefined) {
      this.saveScheduler.resetFailures()
      const changed =
        this.snapshot.saveError !== undefined ||
        this.snapshot.persistenceLocked === true ||
        this.snapshot.quitWithoutSavingPrompt === true
      const next = { ...this.snapshot }
      delete next.saveError
      delete next.persistenceLocked
      delete next.quitWithoutSavingPrompt
      this.snapshot = next
      if (changed) this.emit()
      return
    }
    if (kind === 'cleanup') {
      const retry = this.saveScheduler.registerCleanupFailure()
      this.snapshot = { ...this.snapshot, saveError: messageOf(error) }
      if (retry) this.saveScheduler.scheduleCleanupRetry()
      this.emit()
      return
    }
    const retry = this.saveScheduler.registerSaveFailure(kind)
    this.snapshot = { ...this.snapshot, saveError: messageOf(error) }
    if (retry) {
      this.saveScheduler.scheduleIdleSave()
    } else {
      this.saveScheduler.cancelSaveTimer()
      this.snapshot = { ...this.snapshot, persistenceLocked: true }
      this.saveScheduler.discardPendingSaves()
    }
    this.emit()
  }

  private isPersistenceLocked(): boolean {
    return this.snapshot.status === 'ready' && this.snapshot.persistenceLocked === true
  }

  private newFocus(nodeId: NodeId, cursor: number): FocusIntent {
    this.focusToken += 1
    return { nodeId, cursor, token: this.focusToken }
  }

  private ready(): Extract<EditorSnapshot, { status: 'ready' }> {
    if (this.snapshot.status !== 'ready') {
      throw new Error('The editor is not ready.')
    }
    return this.snapshot
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener())
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : GENERIC_OPERATION_ERROR
}
