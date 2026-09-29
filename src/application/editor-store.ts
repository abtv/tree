import {
  collectAttachmentIds,
  createInitialDocument,
  displayedNodes,
  deleteLink,
  editNodeContent,
  isValidLocation,
  locateNode,
  normalizeVisibleLocation,
  parsePersistedState,
  replaceLinkedText,
  replaceLinkedTextRanges,
  removeTextRange,
  requireNode,
  type AttachmentId,
  type AttachmentReference,
  type Document,
  type LinkedTextEdit,
  type LinkRange,
  type Location,
  type NodeId,
  type TreeNode,
} from '../domain/document'
import { CUT_CONFLICT_ERROR, GENERIC_OPERATION_ERROR } from '../domain/product-messages'
import { clipboardSelectionTransition, imagePasteTransition, textPasteTransition } from './editor-clipboard-transitions'
import {
  ancestorNavigationTransition,
  createFirstChildTransition,
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
  pasteSubtreeTransition,
  type SiblingInsertionPosition,
} from './editor-command-transitions'
import { clipboardIntroducesLink, nodeContent, sameNodeContent } from './editor-content-changes'
import { EditorHistory } from './editor-history'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'
import {
  isPasteIntoSourceDescendant,
  nodeVisualTransition,
  pasteNodeForestTransition,
  type NodeForest,
  type NodeVisualCommand,
} from './editor-node-visual-transitions'
import { EditorSaveScheduler } from './editor-save-scheduler'
import { changeSiteFocus } from './editor-undo-focus'
import { EditorTextSession } from './editor-text-session'
import { systemClock, type Clock, type EditorServices, type FocusIntent } from './editor-store-types'
import type { PersistenceFailureKind } from './persistence-coordinator'
import { countInsertedWords, countPastedWords } from './save-policy'
import {
  applyNodeFold,
  collapseForest,
  COLLAPSED_EXPANSION_STATE,
  expandForest,
  expansionFromIds,
  isNodeExpanded,
  toggleNodeExpansion,
  type ExpansionState,
  type NodeFoldCommand,
} from './expansion-state'
import { buildVisibleRows, type VisibleRow } from './visible-rows'

export type { ClipboardValue, Clock, EditorServices, EditorSnapshot, FocusIntent } from './editor-store-types'
export type { NodeForest, NodeVisualCommand } from './editor-node-visual-transitions'

export class EditorStore {
  private visibleRowsCache:
    { document: Document; parentId: NodeId | null; expansion: ExpansionState; rows: readonly VisibleRow[] } | undefined
  private readonly runtime = new EditorRuntimeState()
  private readonly history = new EditorHistory()
  private readonly pendingAttachmentIds = new Set<AttachmentId>()
  private readonly textSession: EditorTextSession
  private readonly saveScheduler: EditorSaveScheduler
  private readonly pendingEditFinishers = new Set<() => boolean>()
  private pendingClipboardOperation: Promise<void> | undefined
  private readonly pendingEdits = new Set<Promise<void>>()
  // Where the selected row sits in the window lives outside the snapshot: it changes on every scroll
  // frame and no rendered state depends on it. The renderer measures it; the store reads it when it
  // captures state for a save, so every save carries the live value.
  private selectedRowTop: number | undefined
  private restoredSelectedRowTop: number | undefined
  private readSelectedRowTop: (() => number | undefined) | undefined
  public constructor(
    private readonly services: EditorServices,
    private readonly createId: () => string,
    clock: Clock = systemClock,
  ) {
    this.textSession = new EditorTextSession(clock)
    this.saveScheduler = new EditorSaveScheduler(services, clock, {
      currentState: () => {
        const state = this.runtime.snapshot
        if (state.status !== 'ready') return undefined
        const measured = this.readSelectedRowTop?.()
        if (measured !== undefined && Number.isFinite(measured)) this.selectedRowTop = Math.max(0, Math.round(measured))
        const expandedIds = state.expansion.expandedIds
        const selectedRowTop = this.selectedRowTop
        const view = selectedRowTop === undefined ? { expandedIds } : { expandedIds, selectedRowTop }
        return { document: state.document, location: state.location, view }
      },
      referencedAttachmentIds: () => this.referencedAttachmentIds(),
      isPersistenceLocked: () => this.isPersistenceLocked(),
      onPersistenceResult: (error, kind) => this.handlePersistenceResult(error, kind),
    })
  }

  public getSnapshot = this.runtime.getSnapshot

  public subscribe = this.runtime.subscribe

  public getVisibleRows(): readonly VisibleRow[] {
    const state = this.runtime.ready()
    const cached = this.visibleRowsCache
    if (
      cached?.document === state.document &&
      cached.parentId === state.location.currentParentId &&
      cached.expansion === state.expansion
    )
      return cached.rows
    const rows = buildVisibleRows(displayedNodes(state.document, state.location.currentParentId), (id) =>
      isNodeExpanded(state.expansion, id),
    )
    this.visibleRowsCache = {
      document: state.document,
      parentId: state.location.currentParentId,
      expansion: state.expansion,
      rows,
    }
    return rows
  }

  /**
   * The selected row's distance from the top of the window when the document was saved, for the
   * renderer to restore at launch (`docs/PRODUCT.md` §16.1).
   */
  public getRestoredSelectedRowTop(): number | undefined {
    return this.restoredSelectedRowTop
  }

  /**
   * Registers the renderer's measurement of the selected row's distance from the top of the window.
   * It is read whenever state is captured for a save; `undefined` keeps the last known value.
   */
  public registerSelectedRowTopReader(read: () => number | undefined): () => void {
    this.readSelectedRowTop = read
    return () => {
      if (this.readSelectedRowTop === read) this.readSelectedRowTop = undefined
    }
  }

  /**
   * The user scrolled the page: a pending change. Unlike a selection change it never postpones an
   * idle save already armed, because scroll events arrive continuously.
   */
  public noteViewportChange(): void {
    if (this.runtime.snapshot.status !== 'ready') return
    this.saveScheduler.markPersistedChangeWithoutDelay()
  }

  public toggleExpansion(nodeId: NodeId): void {
    const state = this.runtime.ready()
    if (nodeId === state.location.currentParentId) return
    const collapsing = isNodeExpanded(state.expansion, nodeId)
    const hidesSelection =
      collapsing &&
      requireNode(state.document, state.location.selectedNodeId).ancestors.some((ancestor) => ancestor.id === nodeId)
    const expansion = toggleNodeExpansion(state.expansion, nodeId)
    if (expansion === state.expansion) return
    this.runtime.replaceReady({
      ...state,
      expansion,
      ...(hidesSelection
        ? { location: { ...state.location, selectedNodeId: nodeId }, focus: this.runtime.newFocus(nodeId, 0) }
        : {}),
    })
    this.markPersistedChange()
  }

  public applyFold(command: NodeFoldCommand | 'close-all' | 'open-all', nodeId?: NodeId): void {
    const state = this.runtime.ready()
    if (command === 'close-all') {
      // At the root level the location holds every node, so closing its folds forgets every choice
      // without walking the document.
      const expansion =
        state.location.currentParentId === null
          ? COLLAPSED_EXPANSION_STATE
          : collapseForest(state.expansion, displayedNodes(state.document, state.location.currentParentId))
      if (expansion === state.expansion) return
      const location = normalizeVisibleLocation(state.document, state.location, (id) => isNodeExpanded(expansion, id))
      this.runtime.replaceReady({
        ...state,
        expansion,
        ...(location.selectedNodeId !== state.location.selectedNodeId
          ? { location, focus: this.runtime.newFocus(location.selectedNodeId, 0) }
          : {}),
      })
      this.markPersistedChange()
      return
    }
    if (command === 'open-all') {
      const expansion = expandForest(state.expansion, displayedNodes(state.document, state.location.currentParentId))
      if (expansion === state.expansion) return
      this.runtime.replaceReady({ ...state, expansion })
      this.markPersistedChange()
      return
    }
    if (nodeId === undefined || nodeId === state.location.currentParentId) return
    const expansion = applyNodeFold(state.expansion, command, requireNode(state.document, nodeId).node)
    if (expansion === state.expansion) return
    this.runtime.replaceReady({ ...state, expansion })
    this.markPersistedChange()
  }

  /**
   * Registers a renderer-local pending-edit finisher. `flushPersistence` invokes registered
   * finishers immediately before it captures state for each save and again after the save
   * completes. A pending edit that lives outside the store — the Vim Replace buffer — is thereby
   * committed into the document and captured by the same flush, and an edit completed while a save
   * is in flight is saved before the flush resolves. A finisher returns true only on the call that
   * committed a change, must be idempotent, and must no-op (returning false) when nothing is
   * pending; the returned flag makes the flush run one more pass so a commit that requested an
   * immediate save is awaited rather than left in flight. Finishers are invoked only while the
   * store is ready and not in the locked save-failure state, because a locked store rejects
   * document changes; a finisher that would be rejected is left pending instead of consuming its
   * edit.
   */
  public registerPendingEditFinisher(finish: () => boolean): () => void {
    this.pendingEditFinishers.add(finish)
    return () => this.pendingEditFinishers.delete(finish)
  }

  public async flushPersistence(): Promise<void> {
    let committed: boolean
    do {
      this.finishPendingEdits()
      await Promise.all(this.pendingEdits)
      if (this.saveScheduler.hasPendingChanges()) this.saveScheduler.requestImmediateSave()
      await this.saveScheduler.flush()
      committed = this.finishPendingEdits()
    } while (committed || this.pendingEdits.size > 0 || this.saveScheduler.hasPendingChanges())
  }

  private finishPendingEdits(): boolean {
    if (this.runtime.snapshot.status !== 'ready' || this.isPersistenceLocked()) return false
    let committed = false
    for (const finish of [...this.pendingEditFinishers]) committed = finish() || committed
    return committed
  }

  public reportError(error: unknown): void {
    if (this.runtime.snapshot.status !== 'ready') return
    this.runtime.snapshot = { ...this.runtime.snapshot, operationError: messageOf(error) }
    this.runtime.emit()
  }

  public requestQuitWithoutSavingPrompt(): void {
    if (this.runtime.snapshot.status !== 'ready' || this.runtime.snapshot.persistenceLocked !== true) return
    if (this.runtime.snapshot.quitWithoutSavingPrompt === true) return
    this.runtime.snapshot = { ...this.runtime.snapshot, quitWithoutSavingPrompt: true }
    this.runtime.emit()
  }

  public dismissQuitWithoutSavingPrompt(): void {
    if (this.runtime.snapshot.status !== 'ready' || this.runtime.snapshot.quitWithoutSavingPrompt !== true) return
    const next = { ...this.runtime.snapshot }
    delete next.quitWithoutSavingPrompt
    this.runtime.snapshot = next
    this.runtime.emit()
  }

  public async initialize(): Promise<void> {
    try {
      const loaded = await this.services.load()
      if (loaded === null) {
        const rootId = this.createId()
        this.runtime.snapshot = {
          status: 'ready',
          document: createInitialDocument(rootId),
          location: { currentParentId: null, selectedNodeId: rootId },
          focus: this.runtime.newFocus(rootId, 0),
          structuralVersion: this.runtime.getStructuralVersion(),
          expansion: COLLAPSED_EXPANSION_STATE,
        }
        this.runtime.emit()
        this.saveScheduler.requestSave()
        this.queueAttachmentCleanup()
        return
      }

      const parsed = parsePersistedState(loaded)
      this.selectedRowTop = parsed.view?.selectedRowTop
      this.restoredSelectedRowTop = parsed.view?.selectedRowTop
      const expansion = expansionFromIds(parsed.view?.expandedIds ?? [])
      const location = normalizeVisibleLocation(parsed.document, parsed.location, (id) => isNodeExpanded(expansion, id))
      this.runtime.snapshot = {
        status: 'ready',
        document: parsed.document,
        location,
        focus: this.runtime.newFocus(location.selectedNodeId, 0),
        structuralVersion: this.runtime.getStructuralVersion(),
        expansion,
      }
      this.runtime.emit()
      this.queueAttachmentCleanup()
    } catch (error) {
      this.runtime.snapshot = { status: 'error', message: messageOf(error) }
      this.runtime.emit()
    }
  }

  public selectNode(nodeId: NodeId, cursor: number): void {
    const state = this.runtime.ready()
    if (!isValidLocation(state.document, { ...state.location, selectedNodeId: nodeId })) {
      return
    }
    this.endTextSession()
    this.runtime.replaceReady({
      ...state,
      location: { ...state.location, selectedNodeId: nodeId },
      focus: this.runtime.newFocus(nodeId, cursor),
    })
    this.markPersistedChange()
  }

  public editText(nodeId: NodeId, text: string): void {
    this.editContent(nodeId, text, [], false)
  }

  public editContent(nodeId: NodeId, text: string, links: readonly LinkRange[], createsNewLink: boolean): void {
    const state = this.runtime.ready()
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
    const next = editNodeContent(state.document, nodeId, text, links)
    this.runtime.replaceReady({ ...state, document: next })
    this.noteChange(insertedWords, createsNewLink)
    this.textSession.scheduleBoundary()
    this.textSession.endIfStandalone()
  }

  public replaceTextRange(nodeId: NodeId, start: number, end: number, text: string): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const node = requireNode(state.document, nodeId).node
    const replacement = replaceLinkedText(node.text, node.links ?? [], start, end, text)
    this.endTextSession()
    this.textSession.markNextEditStandalone()
    this.editContent(nodeId, replacement.text, replacement.links, replacement.createsNewLink)
  }

  /** Apply disjoint edits to one node's text as a single undoable change. */
  public replaceTextRanges(nodeId: NodeId, edits: readonly LinkedTextEdit[]): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const node = requireNode(state.document, nodeId).node
    const replacement = replaceLinkedTextRanges(node.text, node.links ?? [], edits)
    if (replacement.text === node.text) return
    this.endTextSession()
    this.textSession.markNextEditStandalone()
    this.editContent(nodeId, replacement.text, replacement.links, replacement.createsNewLink)
  }

  public deleteLink(nodeId: NodeId, cursor: number): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const linkStart = requireNode(state.document, nodeId).node.links?.find((link) => link.end === cursor)?.start
    if (linkStart === undefined) return false
    const next = deleteLink(state.document, nodeId, cursor)
    if (next === undefined) return false
    this.endTextSession()
    this.applyStructural(next, state.location, this.runtime.newFocus(nodeId, linkStart))
    return true
  }

  public async copy(nodeId: NodeId, start: number, end: number): Promise<boolean> {
    const state = this.runtime.ready()
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
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const transition = clipboardSelectionTransition(state.document, nodeId, start, end)
    if (transition === undefined || this.services.writeClipboard === undefined) return false
    this.endTextSession()
    const expectedContent = nodeContent(requireNode(state.document, nodeId).node)
    const operation = (async (): Promise<void> => {
      await this.services.writeClipboard!(transition.payload)
      if (this.runtime.snapshot.status !== 'ready' || this.runtime.snapshot.location.selectedNodeId !== nodeId) return
      const current = locateNode(this.runtime.snapshot.document, nodeId)?.node
      if (current === undefined) return
      if (!sameNodeContent(current, expectedContent)) {
        this.reportError(new Error(CUT_CONFLICT_ERROR))
        return
      }
      this.applyStructural(
        removeTextRange(this.runtime.snapshot.document, nodeId, transition.from, transition.to),
        this.runtime.snapshot.location,
        this.runtime.newFocus(nodeId, transition.from),
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
    const state = this.runtime.ready()
    const target = moveSelectionTransition(state.document, state.location, this.getVisibleRows(), direction, cursor)
    if (target !== undefined) this.selectNode(target.nodeId, target.cursor)
  }

  public moveSelectionBoundary(boundary: 'first' | 'last' | 'parent', cursor: number, count?: number): void {
    const state = this.runtime.ready()
    const target = moveSelectionBoundaryTransition(
      state.document,
      state.location,
      this.getVisibleRows(),
      boundary,
      cursor,
      count,
    )
    if (target !== undefined) this.selectNode(target.nodeId, target.cursor)
  }

  public moveHorizontal(direction: 'left' | 'right', cursor: number): boolean {
    const state = this.runtime.ready()
    const target = moveHorizontalTransition(state.document, state.location, this.getVisibleRows(), direction, cursor)
    if (target === undefined) return false
    this.selectNode(target.nodeId, target.cursor)
    return true
  }

  public enter(): void {
    const state = this.runtime.ready()
    const transition = enterTransition(state.document, state.location)
    if (transition === undefined) return
    this.endTextSession()
    this.runtime.replaceReady(
      {
        ...state,
        location: transition.location,
        focus: this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
    this.markPersistedChange()
  }

  public leave(): void {
    const state = this.runtime.ready()
    const transition = leaveTransition(state.document, state.location)
    if (transition === undefined) return
    this.endTextSession()
    this.runtime.replaceReady(
      {
        ...state,
        location: transition.location,
        focus: this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
    this.markPersistedChange()
  }

  public navigateToAncestor(parentId: NodeId | null): void {
    const state = this.runtime.ready()
    const transition = ancestorNavigationTransition(state.document, state.location, parentId)
    if (transition === undefined) return
    this.endTextSession()
    this.runtime.replaceReady(
      {
        ...state,
        location: transition.location,
        focus: this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
    this.markPersistedChange()
  }

  public createSiblingOrFirstChild(cursor: number): void {
    const state = this.runtime.ready()
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
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
  }

  public createSibling(position: 'before' | 'after'): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const transition = createSiblingTransition(state.document, state.location, position, this.createId)
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    return true
  }

  public createChild(): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const transition = createFirstChildTransition(state.document, state.location, this.createId)
    if (transition.kind === 'rejected') {
      this.reportError(new Error(transition.message))
      return false
    }
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    return true
  }

  public createSiblingWithText(position: 'before' | 'after', text: string): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const transition = createSiblingTransition(state.document, state.location, position, this.createId)
    const document =
      text === '' ? transition.document : editNodeContent(transition.document, transition.focus.nodeId, text, [])
    this.endTextSession()
    this.applyStructural(document, transition.location, this.runtime.newFocus(transition.focus.nodeId, text.length))
    if (text !== '') this.noteChange(countInsertedWords('', text), false)
  }

  public createChildWithText(text: string): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const transition = createFirstChildTransition(state.document, state.location, this.createId)
    if (transition.kind === 'rejected') {
      this.reportError(new Error(transition.message))
      return
    }
    const document =
      text === '' ? transition.document : editNodeContent(transition.document, transition.focus.nodeId, text, [])
    this.endTextSession()
    this.applyStructural(document, transition.location, this.runtime.newFocus(transition.focus.nodeId, text.length))
    if (text !== '') this.noteChange(countInsertedWords('', text), false)
  }

  public deleteSelected(): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const transition = deleteSelectedTransition(state.document, state.location, this.createId)
    if (transition === undefined) return false
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    this.queueAttachmentCleanup()
    return true
  }

  public pasteSubtree(
    nodeId: NodeId,
    position: SiblingInsertionPosition,
    source: TreeNode,
    sourceIds: readonly NodeId[] = [],
  ): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    if (isPasteIntoSourceDescendant(state.document, nodeId, sourceIds)) {
      this.reportError(new Error('Cannot paste a node into one of its descendants.'))
      return false
    }
    const transition = pasteSubtreeTransition(
      state.document,
      { ...state.location, selectedNodeId: nodeId },
      position,
      source,
      this.createId,
    )
    if (transition.kind === 'rejected') {
      this.reportError(new Error(transition.message))
      return false
    }
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    return true
  }

  public pasteNodeForest(nodeId: NodeId, position: SiblingInsertionPosition, source: NodeForest): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked() || source.nodes.length === 0) return false
    if (isPasteIntoSourceDescendant(state.document, nodeId, source.sourceIds)) {
      this.reportError(new Error('Cannot paste a node into one of its descendants.'))
      return false
    }
    const transition = pasteNodeForestTransition(
      state.document,
      state.location,
      nodeId,
      position,
      source,
      this.createId,
    )
    if (transition.kind === 'rejected') {
      this.reportError(new Error(transition.message))
      return false
    }
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    return true
  }

  public applyNodeVisual(
    command: NodeVisualCommand,
    anchorId: NodeId,
    focusId: NodeId,
    source?: NodeForest,
    insertedText = '',
  ): NodeForest | undefined {
    const state = this.runtime.ready()
    const result = nodeVisualTransition(
      state.document,
      state.location,
      command,
      anchorId,
      focusId,
      source,
      insertedText,
      !this.isPersistenceLocked(),
      this.createId,
    )
    if (result.kind === 'none') return undefined
    if (result.kind === 'rejected') {
      this.reportError(new Error(result.message))
      return undefined
    }
    if (result.kind === 'yank') return result.register
    this.endTextSession()
    this.applyStructural(
      result.transition.document,
      result.transition.location,
      this.runtime.newFocus(result.transition.focus.nodeId, result.transition.focus.cursor),
    )
    if (result.cleanup) this.queueAttachmentCleanup()
    return result.register
  }

  public deleteEmptySelected(): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const transition = deleteEmptySelectedTransition(state.document, state.location)
    if (transition === undefined) return
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    this.queueAttachmentCleanup()
  }

  public moveSelectedTo(insertionIndex: number): void {
    const state = this.runtime.ready()
    this.moveNodeTo(state.location.selectedNodeId, insertionIndex)
  }

  public moveNodeTo(nodeId: NodeId, insertionIndex: number): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const cursor = state.focus.nodeId === nodeId ? state.focus.cursor : 0
    const transition = moveNodeTransition(state.document, state.location, nodeId, insertionIndex, cursor)
    if (transition === undefined) return
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
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
    this.runtime.ready()
    this.endTextSession()
    await this.pendingClipboardOperation
    const clipboard = await this.services.readClipboard()
    if (this.runtime.snapshot.status !== 'ready' || this.runtime.snapshot.location.selectedNodeId !== nodeId) {
      return
    }
    const current = this.runtime.ready()
    if (clipboard.kind === 'image') {
      const attachment: AttachmentReference = { id: this.createId(), mimeType: 'image/png' }
      this.pendingAttachmentIds.add(attachment.id)
      try {
        await this.services.writeAttachment(attachment.id, clipboard.png)
        if (this.runtime.snapshot.status !== 'ready' || this.runtime.snapshot.location.selectedNodeId !== nodeId) {
          return
        }
        const transition = imagePasteTransition(
          this.runtime.snapshot.document,
          this.runtime.snapshot.location,
          nodeId,
          attachment,
          this.createId,
        )
        this.applyStructural(
          transition.document,
          transition.location,
          this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
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
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    this.noteChange(insertedWords, clipboardIntroducesLink(clipboard))
  }

  public undo(): void {
    this.endTextSession()
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const previous = this.history.undo(state.document, state.location)
    if (previous === undefined) return
    this.applyHistoryState(state, previous.document, previous.location)
    this.markPersistedChange()
    this.queueAttachmentCleanup()
  }

  public redo(): void {
    this.endTextSession()
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const next = this.history.redo(state.document, state.location)
    if (next === undefined) return
    this.applyHistoryState(state, next.document, next.location)
    this.markPersistedChange()
    this.queueAttachmentCleanup()
  }

  /**
   * Publish a restored history snapshot with the caret at the start of the change it made, which is
   * where Vim leaves it after undo and redo. `reconciled` is the reconciled prior location, used
   * only when the two snapshots hold no locatable difference.
   */
  private applyHistoryState(state: ReadySnapshot, document: Document, reconciled: Location): void {
    const target = changeSiteFocus(state.document, document, state.location)
    // A change site is always a direct child or the heading of its location. The fallback location
    // was recorded earlier and may select a descendant a collapse has since hidden.
    const location =
      target?.location ?? normalizeVisibleLocation(document, reconciled, (id) => isNodeExpanded(state.expansion, id))
    const focus = target?.focus ?? { nodeId: location.selectedNodeId, cursor: 0 }
    this.runtime.replaceReady(
      { ...state, document, location, focus: this.runtime.newFocus(focus.nodeId, focus.cursor) },
      true,
    )
  }

  private applyStructural(document: Document, location: Location, focus: FocusIntent): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    if (this.history.begin(state.document)) this.queueAttachmentCleanup()
    this.runtime.replaceReady({ ...state, document, location, focus }, true)
    this.markPersistedChange()
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
    if (this.runtime.snapshot.status === 'ready') {
      collectAttachmentIds(this.runtime.snapshot.document).forEach((id) => ids.add(id))
    }
    for (const id of this.history.attachmentIds()) ids.add(id)
    this.pendingAttachmentIds.forEach((id) => ids.add(id))
    return ids
  }

  private handlePersistenceResult(error: unknown | undefined, kind?: PersistenceFailureKind): void {
    if (this.runtime.snapshot.status !== 'ready') return
    if (error === undefined) {
      this.saveScheduler.resetFailures()
      const changed =
        this.runtime.snapshot.saveError !== undefined ||
        this.runtime.snapshot.persistenceLocked === true ||
        this.runtime.snapshot.quitWithoutSavingPrompt === true
      const next = { ...this.runtime.snapshot }
      delete next.saveError
      delete next.persistenceLocked
      delete next.quitWithoutSavingPrompt
      this.runtime.snapshot = next
      if (changed) this.runtime.emit()
      return
    }
    if (kind === 'cleanup') {
      const retry = this.saveScheduler.registerCleanupFailure()
      this.runtime.snapshot = { ...this.runtime.snapshot, saveError: messageOf(error) }
      if (retry) this.saveScheduler.scheduleCleanupRetry()
      this.runtime.emit()
      return
    }
    const retry = this.saveScheduler.registerSaveFailure(kind)
    this.runtime.snapshot = { ...this.runtime.snapshot, saveError: messageOf(error) }
    if (retry) {
      this.saveScheduler.scheduleIdleSave()
    } else {
      this.saveScheduler.cancelSaveTimer()
      this.runtime.snapshot = { ...this.runtime.snapshot, persistenceLocked: true }
      this.saveScheduler.discardPendingSaves()
    }
    this.runtime.emit()
  }

  private isPersistenceLocked(): boolean {
    return this.runtime.snapshot.status === 'ready' && this.runtime.snapshot.persistenceLocked === true
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : GENERIC_OPERATION_ERROR
}
