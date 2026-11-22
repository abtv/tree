import {
  attachmentSummary,
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
  toggleMarkNode,
  toggleStrikethrough,
  toggleStarNode,
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
import { readPngDimensions } from '../shared/png-validation'
import { MAX_ATTACHMENT_SIZE_BATCH } from '../shared/attachment-limits'
import { isValidAttachmentDimensions, type AttachmentDimensions } from '../domain/attachment-dimensions'
import {
  attachmentIdsWithoutDimensions,
  attachmentSizeEnrichment,
  type AttachmentSizeMode,
} from '../domain/attachment-size-enrichment'
import { vimForestClipboardContent } from './vim-clipboard-content'
import { clipboardSelectionTransition, imagePasteTransition, textPasteTransition } from './editor-clipboard-transitions'
import {
  ancestorNavigationTransition,
  createFirstChildTransition,
  createSiblingTransition,
  createSiblingOrFirstChildTransition,
  deleteEmptySelectedTransition,
  deletePreviousEmptyTransition,
  joinPreviousTextTransition,
  deleteSelectedTransition,
  deleteSiblingRangeTransition,
  enterTransition,
  enteredNodeLocation,
  leaveTransition,
  moveHorizontalTransition,
  moveNodeToParentTransition,
  moveNodeTransition,
  moveSelectionTransition,
  moveSelectionBoundaryTransition,
  openBelowTransition,
  pasteSubtreeTransition,
  type LocationTransition,
  type SiblingInsertionPosition,
  type StructuralTransition,
} from './editor-command-transitions'
import { clipboardIntroducesLink, nodeContent, sameNodeContent } from './editor-content-changes'
import { EditorHistory } from './editor-history'
import { EditorRuntimeState, type ReadySnapshot } from './editor-runtime-state'
import { EditorSearch } from './editor-search'
import type { SearchDestination, SearchPosition } from './search-executor'
import {
  forwardJoinTransition,
  isPasteIntoSourceDescendant,
  nodeVisualShiftIsAtCurrentParentBoundary,
  nodeVisualJoinTransition,
  nodeVisualShiftTransition,
  nodeVisualTransition,
  pasteNodeForestTransition,
  type NodeForest,
  type NodeVisualCommand,
} from './editor-node-visual-transitions'
import { EditorSaveScheduler, type SaveSchedulerResult } from './editor-save-scheduler'
import { changeSiteFocus } from './editor-undo-focus'
import { EditorTextSession } from './editor-text-session'
import { markedAndStarredNodes } from './starred-nodes'
import { countDocumentNodes } from './node-count'
import { systemClock, type Clock, type EditorServices, type FocusIntent } from './editor-store-types'
import { countInsertedWords, countPastedWords, DEFAULT_SAVE_TIMING, type SaveTiming } from './save-policy'
import {
  applyNodeFold,
  collapseActiveView,
  collapseForest,
  COLLAPSED_EXPANSION_STATE,
  expandForest,
  expandNode,
  expansionFromViews,
  isNodeExpanded,
  savedExpansionViews,
  toggleNodeExpansion,
  type ExpansionState,
  type NodeFoldCommand,
} from './expansion-state'
import { departedViewOwners, releaseViews } from './expansion-view-retention'
import { buildVisibleRows, type VisibleRow } from './visible-rows'
import { AgendaRowsCache, type AgendaRow } from './agenda-rows'
import { AgendaFoldMemory } from './agenda-fold-memory'
import { ReturnPositions } from './return-positions'
import { focusedAgendaDay, applyAgendaCommand, openAgendaState, type AgendaCommand } from './agenda-state'
import { dayNumberOf } from '../domain/calendar-date'
import {
  agendaHistorySelection,
  agendaOriginLocation,
  reconcileAgenda,
  reconcileAgendaSelection,
  selectedAgendaDay,
} from './agenda-reconcile'
import { TagCatalog, type TagMatch } from '../domain/tag-catalog'
import { TAG_PREFIXES, tagPrefix, type TagPrefix } from '../domain/tags'
import { EmojiHistory } from './emoji-history'
import { runNodeSearch } from './node-search'
import type { NodeResult } from './node-result'
import { imageSearchTextEnrichment } from '../domain/image-search-text'
import { ImageToTextQueue } from './image-to-text-queue'

export type { ClipboardValue, Clock, EditorServices, EditorSnapshot, FocusIntent } from './editor-store-types'
export type { NodeForest, NodeVisualCommand } from './editor-node-visual-transitions'

// Long enough to gather the images of one screen as they finish decoding.
const ATTACHMENT_SIZE_BATCH_DELAY_MS = 100

export class EditorStore {
  public readonly emojiHistory: EmojiHistory
  private readonly tags = new Map<TagPrefix, TagCatalog>(TAG_PREFIXES.map((prefix) => [prefix, new TagCatalog(prefix)]))
  private readonly agendaRowsCache = new AgendaRowsCache()
  private readonly agendaFoldMemory = new AgendaFoldMemory()
  private readonly returnPositions = new ReturnPositions()
  private visibleRowsCache:
    | {
        document: Document
        parentId: NodeId | null
        expansion: ExpansionState
        rows: readonly VisibleRow[]
      }
    | undefined
  private readonly searchOwner = new EditorSearch(
    (destination) => this.revealSearchDestination(destination),
    this.agendaRowsCache,
  )
  public readonly search: Pick<
    EditorSearch,
    | 'subscribe'
    | 'onJump'
    | 'getResult'
    | 'begin'
    | 'edit'
    | 'cancelDraft'
    | 'confirm'
    | 'interruptNavigation'
    | 'navigate'
  > & { readonly session: Pick<EditorSearch['session'], 'getSnapshot'> } = this.searchOwner
  private readonly runtime = new EditorRuntimeState(undefined, this.agendaRowsCache, (state) => {
    if (state.agenda === undefined) this.agendaRowsCache.releaseIfStale(state.document)

    this.imageToTextQueue.reconcile(state.document)
    for (const catalog of this.tags.values()) catalog.update(state.document)
    this.searchOwner.update(state)
    // While Agenda is open, the Tree location it returns to is still the user's path.
    const treeLocation = state.agenda?.origin.location ?? state.location
    this.returnPositions.retainPath(state.document, treeLocation.currentParentId)
  })
  // History records only the published document, so departing owners come from the published views.
  private readonly history = new EditorHistory(attachmentSummary, (recorded, replacement) =>
    departedViewOwners(this.runtime.ready().expansion, recorded, replacement),
  )
  private readonly imageToTextQueue = new ImageToTextQueue()
  private readonly pendingAttachmentIds = new Set<AttachmentId>()
  // Decoded image sizes that differ from the stored ones, applied together after a short delay.
  private readonly pendingAttachmentSizes = new Map<AttachmentId, AttachmentDimensions>()
  private attachmentSizeTimer: unknown
  private readonly clock: Clock
  private readonly textSession: EditorTextSession
  private readonly saveScheduler: EditorSaveScheduler
  private readonly pendingEditFinishers = new Set<() => boolean>()
  private pendingClipboardOperation: Promise<void> | undefined
  private readonly pendingEdits = new Set<Promise<void>>()
  private readonly editSeals = new Set<AbortSignal>()
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
    saveTiming: SaveTiming = DEFAULT_SAVE_TIMING,
  ) {
    this.clock = clock
    this.emojiHistory = new EmojiHistory(services.saveEmojiHistory?.bind(services), (error) => this.reportError(error))
    this.textSession = new EditorTextSession(clock)
    this.saveScheduler = new EditorSaveScheduler(
      services,
      clock,
      {
        currentState: () => {
          const state = this.runtime.snapshot
          // Normal callers request saves only after initialization; retain this guard for
          // unavailable state rather than exposing the scheduler's callback publicly.
          if (state.status !== 'ready') return undefined
          const measured = state.agenda === undefined ? this.readSelectedRowTop?.() : undefined
          // Number.isFinite(undefined) is false too; the explicit check narrows the type.
          if (measured !== undefined && Number.isFinite(measured))
            this.selectedRowTop = Math.max(0, Math.round(measured))
          const { expandedIds, starredExpandedIds } = savedExpansionViews(state.expansion)
          const selectedRowTop = this.selectedRowTop
          const agendaFolds = this.agendaFoldMemory.persisted
          const view = {
            expandedIds,
            starredExpandedIds,
            ...(selectedRowTop === undefined ? {} : { selectedRowTop }),
            ...(agendaFolds === undefined ? {} : { agendaFolds }),
          }
          return { document: state.document, location: state.agenda?.origin.location ?? state.location, view }
        },
        referencedAttachmentIds: () => this.referencedAttachmentIds(),
        isPersistenceLocked: () => this.isPersistenceLocked(),
        onPersistenceResult: (result) => this.handlePersistenceResult(result),
      },
      saveTiming,
    )
  }

  public getSnapshot = this.runtime.getSnapshot

  public subscribe = this.runtime.subscribe

  public initialSearchResults(): readonly NodeResult[] {
    const state = this.runtime.ready()
    return markedAndStarredNodes(state.document)
  }

  /** The largest possible Search result count, which sizes the stable result counter. */
  public searchResultCapacity(): number {
    return countDocumentNodes(this.runtime.ready().document)
  }

  public get starTarget(): TreeNode | undefined {
    const state = this.getSnapshot()
    if (state.status !== 'ready' || this.isPersistenceLocked()) return undefined
    const selected =
      state.agenda === undefined ? undefined : this.getAgendaRows().find((row) => row.key === state.agenda?.selectedKey)
    if (state.agenda !== undefined && selected?.kind !== 'node') return undefined
    const id = selected?.kind === 'node' ? selected.nodeId : state.location.selectedNodeId
    return locateNode(state.document, id)?.node
  }

  public toggleStarNode(): boolean {
    const target = this.starTarget
    if (target === undefined) return false
    this.finishPendingEdits()
    this.endTextSession()
    const state = this.runtime.ready()
    this.applyStructural(toggleStarNode(state.document, target.id), state.location, state.focus)
    return true
  }

  /** Marks or unmarks the node `starTarget` names (`docs/PRODUCT.md` §2.7). */
  public toggleMarkNode(): boolean {
    const target = this.starTarget
    if (target === undefined) return false
    this.finishPendingEdits()
    this.endTextSession()
    const state = this.runtime.ready()
    this.applyStructural(toggleMarkNode(state.document, target.id), state.location, state.focus)
    return true
  }

  public searchNodeSuggestions(query: string): readonly string[] {
    const prefix = tagPrefix(query)
    if (prefix === undefined) return []
    const suggestions = this.tags.get(prefix)!.searchSuggestions(query)
    return suggestions.length === 1 && query === `${prefix}${suggestions[0]}` ? [] : suggestions
  }

  public searchNodes(query: string, publish: (results: readonly NodeResult[]) => void): () => void {
    if (query === '') {
      publish([])
      return () => undefined
    }
    const state = this.runtime.ready()
    return runNodeSearch(state.document, query, publish)
  }

  public suggestTags(
    nodeId: NodeId,
    text: string,
    caret: number,
    links: readonly LinkRange[] = [],
  ): TagMatch | undefined {
    for (const catalog of this.tags.values()) {
      const match = catalog.suggest(nodeId, text, caret, links)
      if (match !== undefined) return match
    }
    return undefined
  }

  public openAgenda(cursor?: number): void {
    const state = this.runtime.ready()
    if (state.agenda !== undefined) return
    const measured = this.readSelectedRowTop?.()
    if (measured !== undefined && Number.isFinite(measured)) this.selectedRowTop = Math.max(0, Math.round(measured))
    const date = new Date()
    const today =
      this.services.today?.() ??
      dayNumberOf({
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
      })
    this.endTextSession()
    const agenda = openAgendaState(state.location, cursor ?? state.focus.cursor, today, this.agendaFoldMemory.collapsed)
    this.runtime.replaceReady({ ...state, agenda })
  }

  public closeAgenda(): void {
    const state = this.runtime.ready()
    if (state.agenda === undefined) return
    this.endTextSession()
    const { agenda, ...tree } = state
    // Publication checks the selection against the view that governs this location, which can differ
    // from the view Agenda opened over when Undo changed a star.
    const location = agendaOriginLocation(state.document, agenda)
    this.runtime.replaceReady({
      ...tree,
      location,
      focus: this.runtime.newFocus(
        location.selectedNodeId,
        location.selectedNodeId === agenda.origin.location.selectedNodeId ? agenda.origin.cursor : 0,
      ),
    })
  }

  public getAgendaRows(): readonly AgendaRow[] {
    const state = this.runtime.ready()
    return state.agenda === undefined ? [] : this.agendaRowsCache.get(state.document, state.agenda)
  }

  public applyAgenda(command: AgendaCommand): void {
    const state = this.runtime.ready()
    if (state.agenda === undefined) return
    const rows = this.getAgendaRows()
    if (command.kind === 'select') this.search.cancelDraft()
    if (command.kind === 'toggle-fold' || command.kind === 'fold') {
      this.searchOwner.manualAgendaFold(command)
    }
    const changed = applyAgendaCommand(state.agenda, command, rows)
    if (this.agendaFoldMemory.remember(command, rows, changed)) this.markPersistedChange()
    const changedPresentation = command.kind === 'return-timeline' || command.kind === 'shift-week'
    const nextRows = changedPresentation ? this.agendaRowsCache.get(state.document, changed) : rows
    const agenda = changedPresentation ? reconcileAgendaSelection(changed, nextRows) : changed
    const selected = nextRows.find((row) => row.key === agenda.selectedKey)
    const realSelection =
      selected?.kind === 'node' && (agenda.selectedKey !== state.agenda.selectedKey || command.kind === 'select')
    if (agenda === state.agenda && !realSelection) return
    if (
      agenda.selectedKey !== state.agenda.selectedKey ||
      realSelection ||
      focusedAgendaDay(agenda) !== focusedAgendaDay(state.agenda)
    )
      this.endTextSession()
    this.runtime.replaceReady({
      ...state,
      agenda,
      ...(realSelection
        ? {
            location: { ...state.location, selectedNodeId: selected.nodeId },
            focus: {
              ...this.runtime.newFocus(selected.nodeId, command.kind === 'select' ? (command.cursor ?? 0) : 0),
              ...(command.kind === 'select' && command.revealLine ? { revealLine: true } : {}),
            },
          }
        : {}),
    })
  }

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
    this.searchOwner.manualFold(nodeId)
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
    this.searchOwner.manualFold(command.endsWith('-all') ? undefined : nodeId, command.endsWith('-recursive'))
    const state = this.runtime.ready()
    if (command === 'close-all') {
      // At the root level the location holds every node, so closing its folds forgets every choice of
      // the root view without walking the document. Starred views keep theirs.
      const expansion =
        state.location.currentParentId === null
          ? collapseActiveView(state.expansion)
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
   * finishers immediately before it captures state for each save and again after document and
   * preference writes complete. A pending edit outside the store — the Vim Replace buffer — is thereby
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

  public async flushPersistence(
    options: { cancelImageRecognition?: boolean; sealEditsUntil?: AbortSignal } = {},
  ): Promise<void> {
    // Quit or update takes focus authority even if its first save later fails.
    if (options.sealEditsUntil && !options.sealEditsUntil.aborted) this.search.interruptNavigation()
    const resumeImageRecognition = options.cancelImageRecognition ? this.imageToTextQueue.suspend() : undefined
    try {
      let committed: boolean
      do {
        this.finishPendingEdits()
        await Promise.all(this.pendingEdits)
        // requestImmediateSave returns early without pending changes, so this guard only avoids the call.
        if (this.saveScheduler.hasPendingChanges()) this.saveScheduler.requestImmediateSave('flush')
        await this.saveScheduler.flush()
        await this.emojiHistory.flush()
        // Metadata writes leave editing available. An immediate save started meanwhile has
        // already cleared the dirty flag; drain it, including its failure, before another pass.
        await this.saveScheduler.flush()
        committed = this.finishPendingEdits()
      } while (
        committed ||
        this.pendingEdits.size > 0 ||
        this.saveScheduler.hasPendingChanges() ||
        this.emojiHistory.hasPendingChanges()
      )
      const seal = options.sealEditsUntil
      if (seal && !seal.aborted && !this.editSeals.has(seal)) {
        this.editSeals.add(seal)
        this.search.interruptNavigation()
        seal.addEventListener('abort', () => this.editSeals.delete(seal), { once: true })
      }
    } finally {
      resumeImageRecognition?.()
    }
  }

  private finishPendingEdits(): boolean {
    if (this.runtime.snapshot.status !== 'ready' || this.isPersistenceLocked()) return false
    let committed = false
    for (const finish of [...this.pendingEditFinishers]) committed = finish() || committed
    return committed
  }

  public reportError(error: unknown): void {
    if (this.runtime.snapshot.status === 'loading') return
    this.runtime.snapshot = { ...this.runtime.snapshot, operationError: messageOf(error) }
    this.runtime.emit()
  }

  public get imageToTextAvailable(): boolean {
    return this.services.imageToText !== undefined
  }

  public reindexAllImages(): void {
    if (!this.imageToTextAvailable || this.runtime.snapshot.status !== 'ready') return
    if (this.isPersistenceLocked() || this.imageToTextQueue.suspended) return
    this.imageToTextQueue.enqueueReindex(this.runtime.ready().document)
    void this.runImageToTextQueue()
  }

  private async runImageToTextQueue(): Promise<void> {
    if (!this.imageToTextQueue.start()) return
    try {
      for (let job = this.imageToTextQueue.next(); job !== undefined; job = this.imageToTextQueue.next()) {
        try {
          const paragraphs = await this.services.imageToText!(job.attachmentId)
          if (job.canceled || this.runtime.snapshot.status !== 'ready' || this.isPersistenceLocked()) continue

          const current = this.runtime.ready()
          const enrich = imageSearchTextEnrichment(job.attachmentId, paragraphs.join('\n').slice(0, 1_048_576))
          const enriched = enrich(current.document)
          this.history.enrichAttachments(enrich)
          this.runtime.replaceReady({ ...current, document: enriched })
          this.markPersistedChange()
        } catch {
          // Hidden recognition reports no status: a failure leaves the image usable without search text.
        } finally {
          this.imageToTextQueue.complete(job)
        }
      }
    } finally {
      this.imageToTextQueue.finish()
    }
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
      this.emojiHistory.load(await this.services.loadEmojiHistory?.().catch(() => []))
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
      this.agendaFoldMemory.restore(parsed.view?.agendaFolds)
      // Publication activates the view of the displayed location and checks the selection against it.
      this.runtime.replaceReady({
        status: 'ready',
        document: parsed.document,
        location: parsed.location,
        focus: this.runtime.newFocus(parsed.location.selectedNodeId, 0),
        structuralVersion: this.runtime.getStructuralVersion(),
        expansion: expansionFromViews(
          parsed.view?.expandedIds ?? [],
          Object.entries(parsed.view?.starredExpandedIds ?? {}),
        ),
      })
      this.queueAttachmentCleanup()
      // Startup does not wait for the image headers (`docs/PRODUCT.md` §17).
      void this.backfillAttachmentSizes()
    } catch (error) {
      this.runtime.snapshot = { status: 'error', message: messageOf(error) }
      this.runtime.emit()
    }
  }

  /**
   * Reads the PNG header of every attachment the loaded document stores without a size, in bounded
   * batches, and publishes the sizes once as derived data: no history entry and no save of its own, so
   * the next ordinary save writes them. A failed batch leaves its images without a size until next launch.
   */
  private async backfillAttachmentSizes(): Promise<void> {
    const read = this.services.readAttachmentDimensions
    if (read === undefined) return
    const ids = attachmentIdsWithoutDimensions(this.runtime.ready().document)
    const sizes = new Map<AttachmentId, AttachmentDimensions>()
    for (let start = 0; start < ids.length; start += MAX_ATTACHMENT_SIZE_BATCH) {
      const batch = ids.slice(start, start + MAX_ATTACHMENT_SIZE_BATCH)
      try {
        const results = await read.call(this.services, batch)
        batch.forEach((id, index) => {
          const size = results[index]
          if (size !== null && size !== undefined && isValidAttachmentDimensions(size.width, size.height)) {
            sizes.set(id, { width: size.width, height: size.height })
          }
        })
      } catch {
        // Sizes are derived data; the image still displays and reserves its space once loaded.
      }
    }
    this.applyAttachmentSizes(sizes, 'fill')
  }

  /**
   * Records the natural size of a decoded image when it differs from the stored one (`docs/PRODUCT.md`
   * §17.1). Reports arriving together are applied in one publication, like the header backfill.
   */
  public recordAttachmentDimensions(attachmentId: AttachmentId, width: number, height: number): void {
    if (!isValidAttachmentDimensions(width, height)) return
    this.pendingAttachmentSizes.set(attachmentId, { width, height })
    if (this.attachmentSizeTimer !== undefined) return
    this.attachmentSizeTimer = this.clock.setTimeout(() => {
      this.attachmentSizeTimer = undefined
      const sizes = new Map(this.pendingAttachmentSizes)
      this.pendingAttachmentSizes.clear()
      this.applyAttachmentSizes(sizes, 'replace')
    }, ATTACHMENT_SIZE_BATCH_DELAY_MS)
  }

  private applyAttachmentSizes(sizes: ReadonlyMap<AttachmentId, AttachmentDimensions>, mode: AttachmentSizeMode): void {
    if (sizes.size === 0 || this.runtime.snapshot.status !== 'ready' || this.isPersistenceLocked()) return
    const enrich = attachmentSizeEnrichment(sizes, mode)
    const current = this.runtime.ready()
    const document = enrich(current.document)
    this.history.enrichAttachments(enrich)
    if (document !== current.document) this.runtime.replaceReady({ ...current, document })
  }

  public searchOrigin(offset: number): SearchPosition {
    return this.searchOwner.origin(this.runtime.ready(), offset)
  }

  /** Retire asynchronous search on renderer unmount without changing persisted view state. */
  public disposeSearch(): void {
    this.searchOwner.hide()
  }

  public hideSearch(): void {
    if (this.runtime.snapshot.status !== 'ready') return
    const state = this.runtime.ready()
    const view = this.searchOwner.hideView(state)
    if (view?.kind === 'agenda') this.runtime.replaceReady({ ...state, agenda: view.agenda })
    else if (view?.kind === 'tree') {
      this.runtime.replaceReady({ ...state, expansion: view.expansion })
      this.markPersistedChange()
    }
  }

  private revealSearchDestination(destination: SearchDestination): boolean {
    if (this.editSeals.size > 0) return false
    const state = this.runtime.ready()
    const view = this.searchOwner.revealView(state, destination)
    if (view === undefined) return false
    const focus = { ...view.focus, ...this.runtime.newFocus(view.focus.nodeId, view.focus.cursor) }
    if (view.kind === 'agenda') this.endTextSession()
    this.runtime.replaceReady({
      ...state,
      ...(view.kind === 'tree' ? { expansion: view.expansion } : { agenda: view.agenda }),
      location: view.location,
      focus,
    })
    if (view.kind === 'tree') this.markPersistedChange()
    return this.runtime.ready().focus.token === focus.token
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
    const next = editNodeContent(state.document, nodeId, text, links)
    if (!this.textSession.isActive(nodeId)) {
      // begin replaces the active node and scheduleBoundary clears the old timer;
      // ending here also makes that session transition explicit before history capture.
      this.textSession.end()
      if (this.history.begin(state.document, next)) this.queueAttachmentCleanup()
      this.textSession.begin(nodeId)
    }
    const insertedWords = countInsertedWords(node.text, text)
    this.runtime.replaceReady({ ...state, document: next, expansion: this.retainedViews(state.expansion, next) })
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
      const target = this.clipboardTarget(nodeId)
      if (target === undefined) return
      // A selected node always exists in a ready document: every command and history restore
      // normalizes the location. Reaching this guard would need an inconsistent snapshot, so
      // it is an internal defense and no supported input exercises it.
      const current = locateNode(target.document, nodeId)?.node
      if (current === undefined) return
      if (!sameNodeContent(current, expectedContent)) {
        this.reportError(new Error(CUT_CONFLICT_ERROR))
        return
      }
      this.applyStructural(
        removeTextRange(target.document, nodeId, transition.from, transition.to),
        target.location,
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
    const selected =
      state.agenda === undefined ? undefined : this.getAgendaRows().find((row) => row.key === state.agenda?.selectedKey)
    if (state.agenda !== undefined && selected?.kind !== 'node') return
    const location =
      selected?.kind === 'node' ? { currentParentId: null, selectedNodeId: selected.nodeId } : state.location
    const transition = enterTransition(state.document, location)
    if (transition === undefined) return
    // Agenda's rows are not the list going back shows, so entering from Agenda records no position.
    const rowTop = state.agenda === undefined ? this.readSelectedRowTop?.() : undefined
    // An entry without a measurement must not leave an older position of the same node in place.
    if (rowTop !== undefined && Number.isFinite(rowTop))
      this.returnPositions.remember(location.selectedNodeId, location.currentParentId, rowTop)
    else this.returnPositions.forget(location.selectedNodeId)
    this.endTextSession()
    const tree = { ...state }
    delete tree.agenda
    this.runtime.replaceReady(
      {
        ...tree,
        location: transition.location,
        focus: this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
    this.markPersistedChange()
  }

  /** Shows a node chosen in global Search (`docs/PRODUCT.md` §20.14). */
  public openSearchResult(nodeId: NodeId): void {
    const state = this.runtime.ready()
    const found = locateNode(state.document, nodeId)
    if (found === undefined) return
    const location = found.node.children.length
      ? enteredNodeLocation(found.node)
      : { currentParentId: found.parent?.id ?? null, selectedNodeId: nodeId }
    this.endTextSession()
    this.hideSearch()
    const tree = { ...this.runtime.ready() }
    delete tree.agenda
    this.runtime.replaceReady(
      {
        ...tree,
        location,
        focus: this.runtime.newFocus(location.selectedNodeId, 0),
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
        focus: this.returnFocus(transition),
      },
      true,
    )
    this.markPersistedChange()
  }

  /** Going back returns the entered node's row to where it stood (`docs/PRODUCT.md` §7.1). */
  private returnFocus(transition: LocationTransition): FocusIntent {
    const focus = this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor)
    const { currentParentId, selectedNodeId } = transition.location
    const returnRowTop = this.returnPositions.take(selectedNodeId, currentParentId)
    return returnRowTop === undefined ? focus : { ...focus, returnRowTop }
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
        focus: this.returnFocus(transition),
      },
      true,
    )
    this.markPersistedChange()
  }

  public createSiblingOrFirstChild(cursor: number): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return
    const transition = createSiblingOrFirstChildTransition(
      state.document,
      state.location,
      cursor,
      this.createId,
      isNodeExpanded(state.expansion, state.location.selectedNodeId),
    )
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
    state: { document: Document; location: Location; expansion: ExpansionState },
    position: 'before' | 'after',
  ): StructuralTransition & { expandId?: NodeId } {
    return position === 'after'
      ? openBelowTransition(
          state.document,
          state.location,
          this.createId,
          isNodeExpanded(state.expansion, state.location.selectedNodeId),
        )
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
   * Vim `p` follows `o` (`docs/PRODUCT.md` §20.2.13): an expanded branch receives first children;
   * a folded branch receives a sibling after it. `P` keeps the sibling-before insertion.
   */
  private putTarget(
    document: Document,
    nodeId: NodeId,
    position: SiblingInsertionPosition,
    expansion: ExpansionState,
  ): { nodeId: NodeId; position: SiblingInsertionPosition; expandId: NodeId | undefined } {
    const firstChild =
      position === 'after' && isNodeExpanded(expansion, nodeId)
        ? requireNode(document, nodeId).node.children[0]
        : undefined
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
    if (requestedId === state.location.currentParentId) {
      return this.pasteNodeForest(requestedId, requestedPosition, { nodes: [source], sourceIds })
    }
    const { nodeId, position, expandId } = this.putTarget(
      state.document,
      requestedId,
      requestedPosition,
      state.expansion,
    )
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
    const heading = requestedId === state.location.currentParentId
    if (heading && requestedPosition === 'before') return false
    const { nodeId, position, expandId } = heading
      ? { nodeId: requestedId, position: requestedPosition, expandId: undefined }
      : this.putTarget(state.document, requestedId, requestedPosition, state.expansion)
    if (
      (heading && source.sourceIds.includes(requestedId)) ||
      isPasteIntoSourceDescendant(state.document, nodeId, source.sourceIds)
    ) {
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
   * Whole-node or character Visual `>` / `<` (`docs/PRODUCT.md` §20.2.23): moves the sibling range
   * between `anchorId` and `focusId` `count` levels as one undoable command. Tab may opt into
   * keeping an outdent within the current parent; the default retains Vim `<` behavior. Returns
   * whether it changed the document; an impossible request changes nothing and a depth failure is
   * reported.
   */
  public shiftNodeVisual(
    direction: 'in' | 'out',
    anchorId: NodeId,
    focusId: NodeId,
    count = 1,
    cursor?: number,
    confineOutdentToCurrentParent = false,
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
      confineOutdentToCurrentParent,
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

  /** Whether the Tab shortcut's location boundary permits shifting this range outward. */
  public canShiftNodeVisualOutWithinCurrentParent(anchorId: NodeId, focusId: NodeId): boolean {
    const state = this.runtime.ready()
    return !nodeVisualShiftIsAtCurrentParentBoundary(state.document, state.location, anchorId, focusId)
  }

  /**
   * Normal `J` / `gJ` (`docs/PRODUCT.md` §20.2.14) joins the selected node with the following
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
   * `Cmd+Enter` (`docs/PRODUCT.md` §2.5): toggles the strikethrough of the sibling range between
   * `anchorId` and `focusId` — one node when they are equal, including the current-parent heading —
   * as one undoable command. Selection stays in place unless completion removes the Overdue row;
   * then its nearest remaining neighbor receives the supplied caret offset. The ordinary pending-change
   * policy saves the change. Returns whether it changed the document.
   */
  public toggleStrikethrough(anchorId: NodeId, focusId: NodeId, cursor?: number): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    const document = toggleStrikethrough(state.document, anchorId, focusId)
    if (document === undefined) return false
    const rows = state.agenda === undefined ? [] : this.getAgendaRows()
    const selected = rows.find((row) => row.key === state.agenda?.selectedKey)
    const group = selected?.kind === 'node' ? selected.groupKey : undefined
    const index =
      group === undefined
        ? -1
        : rows
            .filter((row) => row.kind === 'node' && row.groupKey === group)
            .findIndex((row) => row.key === selected?.key)
    this.endTextSession()
    this.applyStructural(document, state.location, state.focus)
    if (index >= 0) {
      const remaining = this.getAgendaRows()
      if (!remaining.some((row) => row.key === selected?.key)) {
        const siblings = remaining.filter((row) => row.kind === 'node' && row.groupKey === group)
        const next = siblings[Math.min(index, siblings.length - 1)]
        if (next !== undefined)
          this.applyAgenda({
            kind: 'select',
            key: next.key,
            cursor: cursor ?? state.agenda?.selectionCursor ?? state.focus.cursor,
          })
      }
    }
    return true
  }

  public backspaceAtStart(cursor: number): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked() || state.agenda !== undefined) return false
    const transition =
      deletePreviousEmptyTransition(state.document, state.location, cursor, (id) =>
        state.expansion.expandedIds.has(id),
      ) ?? joinPreviousTextTransition(state.document, state.location, cursor)
    if (transition === undefined) return false
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    return true
  }

  public deleteEmptySelected(): void {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked() || state.agenda !== undefined) return
    const transition = deleteEmptySelectedTransition(state.document, state.location, (id) =>
      state.expansion.expandedIds.has(id),
    )
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

  public async paste(nodeId: NodeId, cursor: number, readClipboard?: EditorServices['readClipboard']): Promise<void> {
    if (this.isPersistenceLocked()) return
    await this.trackEdit(this.pasteFromClipboard(nodeId, cursor, readClipboard))
  }

  private async trackEdit(operation: Promise<void>): Promise<void> {
    this.pendingEdits.add(operation)
    if (this.pendingEdits.size === 1) this.services.onPendingEditsChanged?.(true)
    try {
      await operation
    } finally {
      this.pendingEdits.delete(operation)
      if (this.pendingEdits.size === 0) this.services.onPendingEditsChanged?.(false)
    }
  }

  private clipboardTarget(nodeId: NodeId): ReadySnapshot | undefined {
    const state = this.runtime.snapshot
    if (state.status !== 'ready' || state.location.selectedNodeId !== nodeId) return
    const agenda = state.agenda
    if (agenda !== undefined) {
      // Synthetic Agenda rows retain the last real node in location; only the selected row
      // determines whether an asynchronous edit still targets the user's selection.
      const selected = this.agendaRowsCache.get(state.document, agenda).find((row) => row.key === agenda.selectedKey)
      if (selected?.kind !== 'node' || selected.nodeId !== nodeId) return
    }
    return state
  }

  private async pasteFromClipboard(
    nodeId: NodeId,
    cursor: number,
    readClipboard?: EditorServices['readClipboard'],
  ): Promise<void> {
    this.runtime.ready()
    this.endTextSession()
    await this.pendingClipboardOperation
    if (this.isPersistenceLocked()) return
    const clipboard = await (readClipboard === undefined ? this.services.readClipboard() : readClipboard())
    const current = this.clipboardTarget(nodeId)
    if (current === undefined || this.isPersistenceLocked()) return
    if (clipboard.kind === 'image') {
      if (current.agenda !== undefined && requireNode(current.document, nodeId).node.attachment !== undefined) return
      // The stored size lets the image reserve its space before its bytes load (`docs/PRODUCT.md` §17.1).
      const attachment: AttachmentReference = {
        id: this.createId(),
        mimeType: 'image/png',
        ...readPngDimensions(clipboard.png),
      }
      this.pendingAttachmentIds.add(attachment.id)
      try {
        await this.services.writeAttachment(attachment.id, clipboard.png)
        const latest = this.clipboardTarget(nodeId)
        if (latest === undefined || this.isPersistenceLocked()) return
        // Another paste can attach an image while this write is pending.
        if (latest.agenda !== undefined && requireNode(latest.document, nodeId).node.attachment !== undefined) return
        const transition = imagePasteTransition(latest.document, latest.location, nodeId, attachment, this.createId)
        const applied = this.applyStructural(
          transition.document,
          transition.location,
          this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
        )
        if (!applied) return
        this.requestImmediateSave()
        if (this.imageToTextAvailable && this.imageToTextQueue.enqueueIndex(transition.focus.nodeId, attachment.id)) {
          void this.runImageToTextQueue()
        }
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
    const transition = textPasteTransition(
      current.document,
      current.location,
      nodeId,
      cursor,
      clipboard,
      (count) => Array.from({ length: count }, () => this.createId()),
      current.agenda !== undefined,
    )
    const node = requireNode(current.document, nodeId).node
    const position = Math.max(0, Math.min(cursor, node.text.length))
    // At position 0 the index -1 also reads as undefined, so the position guard only documents intent.
    const insertedWords = countPastedWords(clipboard.text, position > 0 ? node.text[position - 1] : undefined)
    const applied = this.applyStructural(
      transition.document,
      transition.location,
      this.runtime.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
    if (applied) this.noteChange(insertedWords, clipboardIntroducesLink(clipboard))
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
    const expansion = this.retainedViews(state.expansion, document)
    if (state.agenda !== undefined) {
      const restored = reconcileAgenda(document, state.agenda, true, this.agendaRowsCache, state.document)
      if (restored !== undefined) {
        const target = changeSiteFocus(state.document, document, state.location, () => true)
        const agenda =
          target === undefined
            ? restored
            : agendaHistorySelection(
                document,
                restored,
                target.focus.nodeId,
                selectedAgendaDay(state.agenda.selectedKey) ?? state.agenda.today,
                this.agendaRowsCache,
              )
        const selected = this.agendaRowsCache.get(document, agenda).find((row) => row.key === agenda.selectedKey)
        const hasTarget = selected?.kind === 'node' && selected.nodeId === target?.focus.nodeId
        const selectedNodeId = selected?.kind === 'node' ? selected.nodeId : state.location.selectedNodeId
        const location =
          locateNode(document, selectedNodeId) === undefined
            ? { currentParentId: agenda.scopeParentId, selectedNodeId: agenda.scopeParentId ?? document.roots[0]!.id }
            : { currentParentId: agenda.scopeParentId, selectedNodeId }
        this.runtime.replaceReady(
          {
            ...state,
            document,
            expansion,
            agenda,
            location,
            focus: hasTarget
              ? this.runtime.newFocus(target!.focus.nodeId, target!.focus.cursor)
              : location.selectedNodeId === state.focus.nodeId
                ? state.focus
                : this.runtime.newFocus(location.selectedNodeId, 0),
          },
          true,
        )
        return
      }
    }
    const target = changeSiteFocus(state.document, document, state.location, (id) =>
      isNodeExpanded(state.expansion, id),
    )
    // A change site is a visible row or the heading of its location. The fallback location
    // was recorded earlier and may select a descendant a collapse has since hidden.
    const location =
      target?.location ?? normalizeVisibleLocation(document, reconciled, (id) => isNodeExpanded(state.expansion, id))
    const focus = target?.focus ?? { nodeId: location.selectedNodeId, cursor: 0 }
    this.runtime.replaceReady(
      { ...state, document, expansion, location, focus: this.runtime.newFocus(focus.nodeId, focus.cursor) },
      true,
    )
  }

  private applyStructural(
    document: Document,
    location: Location,
    focus: FocusIntent,
    expansion: ExpansionState = this.runtime.ready().expansion,
  ): boolean {
    const state = this.runtime.ready()
    if (this.isPersistenceLocked()) return false
    if (this.history.begin(state.document, document)) this.queueAttachmentCleanup()
    this.runtime.replaceReady(
      { ...state, document, location, focus, expansion: this.retainedViews(expansion, document) },
      true,
    )
    this.markPersistedChange()
    return true
  }

  /**
   * Drops the views of nodes that neither `document` nor any undo or redo snapshot contains
   * (`docs/PRODUCT.md` §§2.4, 22.1).
   */
  private retainedViews(expansion: ExpansionState, document: Document): ExpansionState {
    return releaseViews(expansion, document, this.history.takeReleasedViewOwners())
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

  private handlePersistenceResult(result: SaveSchedulerResult): void {
    // Results arrive only for a state the coordinator captured while ready, and a store never leaves
    // ready, so this guard is an internal defense.
    if (this.runtime.snapshot.status !== 'ready') return
    if (result.status === 'success') {
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
    this.runtime.snapshot = {
      ...this.runtime.snapshot,
      saveError: messageOf(result.error),
      ...(result.lock ? { persistenceLocked: true } : {}),
    }
    this.runtime.emit()
  }

  private isPersistenceLocked(): boolean {
    // Only a ready snapshot has persistenceLocked, so the status check is redundant.
    return (
      this.editSeals.size > 0 ||
      (this.runtime.snapshot.status === 'ready' && this.runtime.snapshot.persistenceLocked === true)
    )
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : GENERIC_OPERATION_ERROR
}
