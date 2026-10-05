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
  toggleStrikethrough,
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
import type { ClipboardContent } from '../shared/ipc'
import { vimForestClipboardContent } from './vim-clipboard-content'
import { clipboardSelectionTransition, imagePasteTransition, textPasteTransition } from './editor-clipboard-transitions'
import {
  ancestorNavigationTransition,
  createFirstChildTransition,
  createSiblingTransition,
  createSiblingOrFirstChildTransition,
  deleteEmptySelectedTransition,
  deleteSelectedTransition,
  deleteSiblingRangeTransition,
  enterTransition,
  leaveTransition,
  moveHorizontalTransition,
  moveNodeToParentTransition,
  moveNodeTransition,
  moveSelectionTransition,
  moveSelectionBoundaryTransition,
  openBelowTransition,
  pasteSubtreeTransition,
  type SiblingInsertionPosition,
  type StructuralTransition,
} from './editor-command-transitions'
import { clipboardIntroducesLink, nodeContent, sameNodeContent } from './editor-content-changes'
import { EditorHistory } from './editor-history'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'
import {
  forwardJoinTransition,
  isPasteIntoSourceDescendant,
  nodeVisualJoinTransition,
  nodeVisualShiftTransition,
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
  expandNode,
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
        // Normal callers request saves only after initialization; retain this guard for
        // unavailable state rather than exposing the scheduler's callback publicly.
        if (state.status !== 'ready') return undefined
        const measured = this.readSelectedRowTop?.()
        // Number.isFinite(undefined) is false too; the explicit check narrows the type.
        if (measured !== undefined && Number.isFinite(measured)) this.selectedRowTop = Math.max(0, Math.round(measured))
        const expandedIds = state.expansion.expandedIds
        const selectedRowTop = this.selectedRowTop
        // JSON persistence omits an undefined position even if the key is present.
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
    const rows = buildVisibleRows(
      displayedNodes(state.document, state.location.currentParentId),
      (id) => isNodeExpanded(state.expansion, id),
      state.location.currentParentId,
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
    // A toggle currently always changes identity; keep the no-change guard consistent
    // with the other fold operations if the expansion helper acquires a no-op case.
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
      // Every fold in this location is now closed. Returning false for every
      // expansion query yields the same selection; choices outside it cannot hide rows here.
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
      // requestImmediateSave returns early without pending changes, so this guard only avoids the call.
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

  // The ready checks in the two prompt methods are redundant: only a ready snapshot can carry
  // persistenceLocked or quitWithoutSavingPrompt, so the flag checks alone return for any other status.
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
      // parsePersistedState always supplies a view, so the optional access and the empty-list
      // fallback below are defenses for the optional type only; no supported input reaches them.
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
    // A malformed entry in place of the empty list is dropped by normalization, so it is equivalent.
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
      // begin replaces the active node and scheduleBoundary clears the old timer;
      // ending here also makes that session transition explicit before history capture.
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

  /** Returns false when the persistence lock rejected the edit, so callers can leave the register alone. */
  public replaceTextRange(nodeId: NodeId, start: number, end: number, text: string): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const node = requireNode(state.document, nodeId).node
    // With no stored links, reconciliation rejects malformed fallback entries as well
    // as an empty array; only normalized ranges can survive into the document.
    const replacement = replaceLinkedText(node.text, node.links ?? [], start, end, text)
    // markNextEditStandalone also ends the session. Both calls express the boundary;
    // removing only this end call does not change the resulting history.
    this.endTextSession()
    this.textSession.markNextEditStandalone()
    this.editContent(nodeId, replacement.text, replacement.links, replacement.createsNewLink)
    return true
  }

  /** Apply disjoint edits to one node's text as a single undoable change. */
  public replaceTextRanges(nodeId: NodeId, edits: readonly LinkedTextEdit[]): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const node = requireNode(state.document, nodeId).node
    // Like the single-range path, an absent link list produces no retained ranges
    // even if a fallback entry fails normalization.
    const replacement = replaceLinkedTextRanges(node.text, node.links ?? [], edits)
    if (replacement.text === node.text) return
    // markNextEditStandalone ends the session too; the no-change guard above must
    // keep ongoing direct typing grouped instead of introducing this boundary.
    this.endTextSession()
    this.textSession.markNextEditStandalone()
    this.editContent(nodeId, replacement.text, replacement.links, replacement.createsNewLink)
  }

  public deleteLink(nodeId: NodeId, cursor: number): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const linkStart = requireNode(state.document, nodeId).node.links?.find((link) => link.end === cursor)?.start
    // Without this early return, deleteLink's identical lookup returns undefined
    // and the next guard still reports false without publishing a change.
    if (linkStart === undefined) return false
    const next = deleteLink(state.document, nodeId, cursor)
    // The synchronous lookup above and deleteLink use the same link-end predicate
    // on the same immutable document. Undefined is therefore an internal defense.
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

  public async copyVimContent(content: ClipboardContent | undefined): Promise<boolean> {
    if (content === undefined || this.services.writeClipboardContent === undefined) return false
    const operation = this.services.writeClipboardContent(content)
    this.pendingClipboardOperation = operation
    try {
      await operation
      return true
    } finally {
      if (this.pendingClipboardOperation === operation) this.pendingClipboardOperation = undefined
    }
  }

  public copyVimForest(nodes: readonly TreeNode[]): Promise<boolean> {
    return this.copyVimContent(vimForestClipboardContent(nodes))
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
      // A selected node always exists in a ready document: every command and history restore
      // normalizes the location. Reaching this guard would need an inconsistent snapshot, so
      // it is an internal defense and no supported input exercises it.
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
    // Structural commands close typing explicitly. For commands that focus a fresh ID
    // (creation/put) or remove the edited ID (deletion), the next supported typing
    // event also begins a new session: its node differs, and selection ends typing.
    // Case conversion and reordering retain IDs, so their explicit boundary matters.
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
    const transition = this.openTransition(state, position)
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
      this.expansionAfterOpen(state.expansion, transition),
    )
    return true
  }

  private openTransition(
    state: { document: Document; location: Location },
    position: 'before' | 'after',
  ): StructuralTransition & { expandId?: NodeId } {
    return position === 'after'
      ? openBelowTransition(state.document, state.location, this.createId)
      : createSiblingTransition(state.document, state.location, position, this.createId)
  }

  private expansionAfterOpen(expansion: ExpansionState, transition: { expandId?: NodeId }): ExpansionState {
    return transition.expandId === undefined ? expansion : expandNode(expansion, transition.expandId)
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
    const transition = this.openTransition(state, position)
    // Editing the freshly created empty node to empty text is an identity operation;
    // malformed default link entries are discarded by domain normalization.
    const document =
      text === '' ? transition.document : editNodeContent(transition.document, transition.focus.nodeId, text, [])
    this.endTextSession()
    this.applyStructural(
      document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, text.length),
      this.expansionAfterOpen(state.expansion, transition),
    )
    // For empty text, noteChange(0, false) only repeats applyStructural's pending idle save.
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
    // As for sibling creation, editing the fresh empty node to empty text is an identity;
    // normalization also drops malformed default link entries.
    const document =
      text === '' ? transition.document : editNodeContent(transition.document, transition.focus.nodeId, text, [])
    this.endTextSession()
    this.applyStructural(document, transition.location, this.runtime.newFocus(transition.focus.nodeId, text.length))
    // Empty text adds no words; applyStructural already marks the change pending.
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

  /**
   * Counted `dd`: removes the selected node and up to `count - 1` following siblings as one undoable
   * command. Returns the removed subtrees, or `undefined` when nothing changed (locked, or the
   * current-parent heading is selected), so the caller publishes the register only on success.
   */
  public deleteSiblingRange(count: number): readonly TreeNode[] | undefined {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return undefined
    const result = deleteSiblingRangeTransition(state.document, state.location, count, this.createId)
    if (result === undefined) return undefined
    const { transition, removed } = result
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    this.queueAttachmentCleanup()
    return removed
  }

  /**
   * Vim `p` (`docs/PRODUCT.md` §20.2): on a node with children, "after" puts the content before its
   * first child, like `o`, and `expandId` names the node whose fold must open to show it. `P` keeps
   * the plain sibling-before insertion.
   */
  private putTarget(
    document: Document,
    nodeId: NodeId,
    position: SiblingInsertionPosition,
  ): { nodeId: NodeId; position: SiblingInsertionPosition; expandId: NodeId | undefined } {
    const firstChild = position === 'after' ? requireNode(document, nodeId).node.children[0] : undefined
    return firstChild === undefined
      ? { nodeId, position, expandId: undefined }
      : { nodeId: firstChild.id, position: 'before', expandId: nodeId }
  }

  private expansionAfterPut(expansion: ExpansionState, expandId: NodeId | undefined): ExpansionState {
    return expandId === undefined ? expansion : expandNode(expansion, expandId)
  }

  public pasteSubtree(
    requestedId: NodeId,
    requestedPosition: SiblingInsertionPosition,
    source: TreeNode,
    sourceIds: readonly NodeId[] = [],
  ): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    // A sibling of the current-parent heading would sit outside the displayed location.
    if (requestedId === state.location.currentParentId) return false
    const { nodeId, position, expandId } = this.putTarget(state.document, requestedId, requestedPosition)
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
      this.expansionAfterPut(state.expansion, expandId),
    )
    return true
  }

  public pasteNodeForest(
    requestedId: NodeId,
    requestedPosition: SiblingInsertionPosition,
    source: NodeForest,
    repeat = 1,
    selectAfter = false,
  ): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked() || source.nodes.length === 0) return false
    if (requestedId === state.location.currentParentId) return false
    const { nodeId, position, expandId } = this.putTarget(state.document, requestedId, requestedPosition)
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
      repeat,
      selectAfter,
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
      this.expansionAfterPut(state.expansion, expandId),
    )
    return true
  }

  public applyNodeVisual(
    command: NodeVisualCommand,
    anchorId: NodeId,
    focusId: NodeId,
    source?: NodeForest,
    insertedText = '',
    repeat = 1,
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
      repeat,
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

  /**
   * Whole-node or character Visual `>` / `<` (`docs/PRODUCT.md` §20.2.1): moves the sibling range
   * between `anchorId` and `focusId` `count` levels as one undoable command. Returns whether it
   * changed the document; an impossible request changes nothing and a depth failure is reported.
   */
  public shiftNodeVisual(
    direction: 'in' | 'out',
    anchorId: NodeId,
    focusId: NodeId,
    count = 1,
    cursor?: number,
  ): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const result = nodeVisualShiftTransition(
      state.document,
      state.location,
      direction,
      anchorId,
      focusId,
      count,
      cursor ?? (state.focus.nodeId === state.location.selectedNodeId ? state.focus.cursor : 0),
    )
    if (result.kind === 'none') return false
    if (result.kind === 'rejected') {
      this.reportError(new Error(result.message))
      return false
    }
    this.endTextSession()
    const expansion = result.expandIds.reduce(expandNode, state.expansion)
    this.applyStructural(
      result.transition.document,
      result.transition.location,
      this.runtime.newFocus(result.transition.focus.nodeId, result.transition.focus.cursor),
      expansion,
    )
    return true
  }

  /**
   * Normal `J` / `gJ` (`docs/PRODUCT.md` §20.2.1 T6) joins the selected node with the following
   * siblings, and whole-node Visual `J` / `gJ` joins the range between `range.anchorId` and
   * `range.focusId`. Either is one undoable command; returns whether it changed the document. A
   * range with two attached nodes is reported and changes nothing.
   */
  public joinNodes(target: { count: number } | { anchorId: NodeId; focusId: NodeId }, spaced: boolean): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const result =
      'count' in target
        ? forwardJoinTransition(state.document, state.location, state.location.selectedNodeId, target.count, spaced)
        : nodeVisualJoinTransition(state.document, state.location, target.anchorId, target.focusId, spaced)
    if (result.kind === 'none') return false
    if (result.kind === 'rejected') {
      this.reportError(new Error(result.message))
      return false
    }
    this.endTextSession()
    this.applyStructural(
      result.transition.document,
      result.transition.location,
      this.runtime.newFocus(result.transition.focus.nodeId, result.transition.focus.cursor),
    )
    return true
  }

  /**
   * `Cmd+Y` (`docs/PRODUCT.md` §2.5): toggles the strikethrough of the sibling range between
   * `anchorId` and `focusId` — one node when they are equal, including the current-parent heading —
   * as one undoable command. The location and the caret stay where they are, and the change is saved
   * by the ordinary pending-change policy. Returns whether it changed the document.
   */
  public toggleStrikethrough(anchorId: NodeId, focusId: NodeId): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const document = toggleStrikethrough(state.document, anchorId, focusId)
    if (document === undefined) return false
    this.endTextSession()
    this.applyStructural(document, state.location, state.focus)
    return true
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
    // applyStructural also blocks publication while locked, but this early guard avoids
    // building and allocating a reordered document before reaching that second guard.
    // Keep both guards: a locked command must avoid transition work as well as publication.
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

  /**
   * Moves a node with its subtree under another parent, or to the document root with `parentId`
   * `null`, at `index` among that parent's children counted without the moved node. It is one
   * undoable, pending-save change that opens the receiving fold and selects the moved node; the
   * displayed location follows only when the node leaves it. Returns whether it changed the
   * document: a destination inside the moved subtree or the current place changes nothing, and a
   * subtree that would pass the maximum depth is reported.
   */
  public moveNodeToParent(nodeId: NodeId, parentId: NodeId | null, index: number): boolean {
    const state = this.runtime.ready()
    // Keep the early guard: a locked command must avoid building a moved document, not only publishing it.
    if (this.isPersistenceLocked()) return false
    const cursor = state.focus.nodeId === nodeId ? state.focus.cursor : 0
    const result = moveNodeToParentTransition(state.document, state.location, nodeId, parentId, index, cursor)
    if (result.kind === 'none') return false
    if (result.kind === 'rejected') {
      this.reportError(new Error(result.message))
      return false
    }
    this.endTextSession()
    const expansion = result.expandIds.reduce(expandNode, state.expansion)
    this.applyStructural(
      result.transition.document,
      result.transition.location,
      this.runtime.newFocus(result.transition.focus.nodeId, result.transition.focus.cursor),
      expansion,
    )
    return true
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

    // Link ranges must be non-empty and lie inside the text, so empty text with a nonempty link
    // list is not a supported clipboard value; the list check is equivalent to the empty-list check.
    if (clipboard.text === '' && (clipboard.links === undefined || clipboard.links.length === 0)) {
      return
    }
    const transition = textPasteTransition(current.document, current.location, nodeId, cursor, clipboard, (count) =>
      Array.from({ length: count }, () => this.createId()),
    )
    const node = requireNode(current.document, nodeId).node
    const position = Math.max(0, Math.min(cursor, node.text.length))
    // At position 0 the index -1 also reads as undefined, so the position guard only documents intent.
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
    // A redo entry exists only after an undo, which ended the session, and any edit that could
    // restart one first begins a history entry that discards the redo branch. The session is
    // therefore already closed here; the call states the boundary and removing it changes nothing.
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
    const target = changeSiteFocus(state.document, document, state.location, (id) =>
      isNodeExpanded(state.expansion, id),
    )
    // A change site is a visible row or the heading of its location. The fallback location
    // was recorded earlier and may select a descendant a collapse has since hidden.
    const location =
      target?.location ?? normalizeVisibleLocation(document, reconciled, (id) => isNodeExpanded(state.expansion, id))
    const focus = target?.focus ?? { nodeId: location.selectedNodeId, cursor: 0 }
    this.runtime.replaceReady(
      { ...state, document, location, focus: this.runtime.newFocus(focus.nodeId, focus.cursor) },
      true,
    )
  }

  private applyStructural(
    document: Document,
    location: Location,
    focus: FocusIntent,
    expansion: ExpansionState = this.runtime.ready().expansion,
  ): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    if (this.history.begin(state.document)) this.queueAttachmentCleanup()
    this.runtime.replaceReady({ ...state, document, location, focus, expansion }, true)
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
    // The coordinator asks for referenced IDs only after it captured a ready state, and a store never
    // leaves ready, so the else branch is an internal defense.
    if (this.runtime.snapshot.status === 'ready') {
      collectAttachmentIds(this.runtime.snapshot.document).forEach((id) => ids.add(id))
    }
    for (const id of this.history.attachmentIds()) ids.add(id)
    this.pendingAttachmentIds.forEach((id) => ids.add(id))
    return ids
  }

  private handlePersistenceResult(error: unknown | undefined, kind?: PersistenceFailureKind): void {
    // Results arrive only for a state the coordinator captured while ready, and a store never leaves
    // ready, so this guard is an internal defense.
    if (this.runtime.snapshot.status !== 'ready') return
    if (error === undefined) {
      this.saveScheduler.resetFailures()
      // Locking and the quit prompt both follow a failure that set saveError, and only this success
      // path clears any of the three, so the saveError check alone decides whether to publish.
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
    // Only a ready snapshot has persistenceLocked, so the status check is redundant.
    return this.runtime.snapshot.status === 'ready' && this.runtime.snapshot.persistenceLocked === true
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : GENERIC_OPERATION_ERROR
}
