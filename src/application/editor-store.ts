import {
  collectAttachmentIds,
  createInitialDocument,
  deleteLink,
  editNodeContent,
  isHttpUrl,
  isValidLocation,
  locateNode,
  parsePersistedState,
  removeTextRange,
  requireNode,
  type AttachmentId,
  type AttachmentReference,
  type Document,
  type Location,
  type LinkRange,
  type NodeId,
  type PersistedEditorState,
} from '../domain/document'
import type { ClipboardPayload } from '../shared/ipc'
import type { ClipboardWritePayload } from '../shared/ipc'
import { clipboardSelectionTransition, imagePasteTransition, textPasteTransition } from './editor-clipboard-transitions'
import { EditorHistory } from './editor-history'
import {
  ancestorNavigationTransition,
  createSiblingOrFirstChildTransition,
  deleteEmptySelectedTransition,
  deleteSelectedTransition,
  enterTransition,
  leaveTransition,
  moveHorizontalTransition,
  moveNodeTransition,
  moveSelectionTransition,
} from './editor-command-transitions'
import { PersistenceCoordinator } from './persistence-coordinator'
import { countInsertedWords, countPastedWords, SAVE_IDLE_MILLISECONDS, SAVE_WORD_THRESHOLD } from './save-policy'

export type ClipboardValue = ClipboardPayload

export interface EditorServices {
  load(): Promise<unknown | null>
  save(state: PersistedEditorState): Promise<void>
  readClipboard(): Promise<ClipboardValue>
  writeClipboard?: (payload: ClipboardWritePayload) => Promise<void>
  writeAttachment(id: AttachmentId, png: Uint8Array): Promise<void>
  hasAttachment(id: AttachmentId): Promise<boolean>
  cleanupAttachments(referencedIds: AttachmentId[]): Promise<void>
}

export interface Clock {
  setTimeout(callback: () => void, milliseconds: number): unknown
  clearTimeout(handle: unknown): void
}

export interface FocusIntent {
  nodeId: NodeId
  cursor: number
  token: number
}

export type EditorSnapshot =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready'
      document: Document
      location: Location
      focus: FocusIntent
      saveError?: string
      operationError?: string
    }

const systemClock: Clock = {
  setTimeout: (callback, milliseconds) => globalThis.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export class EditorStore {
  private readonly listeners = new Set<() => void>()
  private readonly history = new EditorHistory()
  private readonly pendingAttachmentIds = new Set<AttachmentId>()
  private readonly persistence: PersistenceCoordinator
  private snapshot: EditorSnapshot = { status: 'loading' }
  private activeTextNodeId: NodeId | undefined
  private textTimer: unknown
  private saveTimer: unknown
  private changesPending = false
  private insertedWordsWatermark = 0
  private savedWordsWatermark = 0
  private pendingSaveWatermark: number | undefined
  private standaloneNextTextEdit = false
  private pendingClipboardOperation: Promise<void> | undefined
  private readonly pendingEdits = new Set<Promise<void>>()
  private focusToken = 0
  public constructor(
    private readonly services: EditorServices,
    private readonly createId: () => string,
    private readonly clock: Clock = systemClock,
  ) {
    this.persistence = new PersistenceCoordinator(services, {
      currentState: () => (this.snapshot.status === 'ready' ? this.snapshot : undefined),
      referencedAttachmentIds: () => this.referencedAttachmentIds(),
      hasPendingDocumentChanges: () => this.changesPending,
      onSaveCaptured: () => this.handleSaveCaptured(),
      onDocumentSaved: () => this.handleDocumentSaved(),
      onResult: (error) => this.handlePersistenceResult(error),
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
      if (this.changesPending) this.requestPolicySave()
      await this.persistence.flush()
    } while (this.pendingEdits.size > 0)
  }

  public reportError(error: unknown): void {
    if (this.snapshot.status !== 'ready') return
    this.snapshot = { ...this.snapshot, operationError: messageOf(error) }
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
        }
        this.emit()
        this.persistence.requestSave()
        this.queueAttachmentCleanup()
        return
      }

      const parsed = parsePersistedState(loaded)
      const missingAttachmentId = await this.findMissingAttachmentId(parsed.document)
      if (missingAttachmentId !== undefined) {
        throw new Error(`Attachment ${missingAttachmentId} is missing from local storage.`)
      }
      this.snapshot = {
        status: 'ready',
        document: parsed.document,
        location: parsed.location,
        focus: this.newFocus(parsed.location.selectedNodeId, 0),
      }
      this.emit()
      this.queueAttachmentCleanup()
    } catch (error) {
      this.snapshot = { status: 'error', message: messageOf(error) }
      this.emit()
    }
  }

  private async findMissingAttachmentId(document: Document): Promise<AttachmentId | undefined> {
    const ids = [...collectAttachmentIds(document)]
    const present = await Promise.all(ids.map((id) => this.services.hasAttachment(id)))
    return ids.find((_, index) => !present[index])
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

  public editContent(nodeId: NodeId, text: string, links: LinkRange[]): void {
    const state = this.ready()
    const node = requireNode(state.document, nodeId).node
    if (node.text === text) {
      return
    }
    if (this.activeTextNodeId !== nodeId) {
      this.endTextSession()
      if (this.history.begin(state.document)) this.queueAttachmentCleanup()
      this.activeTextNodeId = nodeId
    }
    const insertedWords = countInsertedWords(node.text, text)
    const linkInserted = hasNewLink(node.links, links)
    const next = editNodeContent(state.document, nodeId, text, links)
    this.replaceReady({ ...state, document: next })
    this.noteChange(insertedWords, linkInserted)
    this.scheduleTextBoundary()
    if (this.standaloneNextTextEdit) {
      this.standaloneNextTextEdit = false
      this.endTextSession()
    }
  }

  public deleteLink(nodeId: NodeId, cursor: number): boolean {
    const state = this.ready()
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
        this.reportError(new Error(CUT_CONFLICT_MESSAGE))
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
    this.activeTextNodeId = undefined
    if (this.textTimer !== undefined) {
      this.clock.clearTimeout(this.textTimer)
      this.textTimer = undefined
    }
  }

  public markNextTextEditStandalone(): void {
    this.endTextSession()
    this.standaloneNextTextEdit = true
  }

  public moveSelection(direction: 'up' | 'down', cursor: number): void {
    const state = this.ready()
    const target = moveSelectionTransition(state.document, state.location, direction, cursor)
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
    this.replaceReady({
      ...state,
      location: transition.location,
      focus: this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    })
    this.markPersistedChange()
  }

  public leave(): void {
    const state = this.ready()
    const transition = leaveTransition(state.document, state.location)
    if (transition === undefined) return
    this.endTextSession()
    this.replaceReady({
      ...state,
      location: transition.location,
      focus: this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    })
    this.markPersistedChange()
  }

  public navigateToAncestor(parentId: NodeId | null): void {
    const state = this.ready()
    const transition = ancestorNavigationTransition(state.document, state.location, parentId)
    if (transition === undefined) return
    this.endTextSession()
    this.replaceReady({
      ...state,
      location: transition.location,
      focus: this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    })
    this.markPersistedChange()
  }

  public createSiblingOrFirstChild(cursor: number): void {
    const state = this.ready()
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

  public deleteSelected(): void {
    const state = this.ready()
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
    const transition = moveNodeTransition(state.document, state.location, nodeId, insertionIndex)
    if (transition === undefined) return
    this.endTextSession()
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
  }

  public async paste(nodeId: NodeId, cursor: number): Promise<void> {
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
    const previous = this.history.undo(state.document, state.location)
    if (previous === undefined) return
    this.replaceReady({
      ...state,
      document: previous.document,
      location: previous.location,
      focus: this.newFocus(previous.location.selectedNodeId, 0),
    })
    this.markPersistedChange()
    this.queueAttachmentCleanup()
  }

  public redo(): void {
    this.endTextSession()
    const state = this.ready()
    const next = this.history.redo(state.document, state.location)
    if (next === undefined) return
    this.replaceReady({
      ...state,
      document: next.document,
      location: next.location,
      focus: this.newFocus(next.location.selectedNodeId, 0),
    })
    this.markPersistedChange()
    this.queueAttachmentCleanup()
  }

  private applyStructural(document: Document, location: Location, focus: FocusIntent): void {
    const state = this.ready()
    if (this.history.begin(state.document)) this.queueAttachmentCleanup()
    this.replaceReady({ ...state, document, location, focus })
    this.markPersistedChange()
  }

  private scheduleTextBoundary(): void {
    if (this.textTimer !== undefined) {
      this.clock.clearTimeout(this.textTimer)
    }
    this.textTimer = this.clock.setTimeout(() => this.endTextSession(), 5_000)
  }

  private replaceReady(state: Extract<EditorSnapshot, { status: 'ready' }>): void {
    this.snapshot = state.operationError === undefined ? state : { ...state, operationError: undefined }
    this.emit()
  }

  private markPersistedChange(): void {
    this.changesPending = true
    this.scheduleIdleSave()
  }

  private noteChange(insertedWords: number, saveImmediately: boolean): void {
    if (insertedWords > 0) {
      this.insertedWordsWatermark += insertedWords
      if (this.insertedWordsWatermark - this.savedWordsWatermark >= SAVE_WORD_THRESHOLD) saveImmediately = true
    }
    this.markPersistedChange()
    if (saveImmediately) this.requestPolicySave()
  }

  private requestImmediateSave(): void {
    this.requestPolicySave()
  }

  private requestPolicySave(): void {
    if (!this.changesPending) return
    if (this.saveTimer !== undefined) {
      this.clock.clearTimeout(this.saveTimer)
      this.saveTimer = undefined
    }
    this.changesPending = false
    this.persistence.requestSave()
  }

  private scheduleIdleSave(): void {
    if (this.saveTimer !== undefined) this.clock.clearTimeout(this.saveTimer)
    this.saveTimer = this.clock.setTimeout(() => {
      this.saveTimer = undefined
      this.requestPolicySave()
    }, SAVE_IDLE_MILLISECONDS)
  }

  private queueAttachmentCleanup(): void {
    this.persistence.requestAttachmentCleanup()
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

  private handleSaveCaptured(): void {
    this.pendingSaveWatermark = this.insertedWordsWatermark
  }

  private handleDocumentSaved(): void {
    if (this.pendingSaveWatermark === undefined) return
    this.savedWordsWatermark = Math.max(this.savedWordsWatermark, this.pendingSaveWatermark)
    this.pendingSaveWatermark = undefined
  }

  private handlePersistenceResult(error: unknown | undefined): void {
    if (this.snapshot.status !== 'ready') return
    if (error === undefined) {
      if (this.snapshot.saveError === undefined) return
      this.snapshot = { ...this.snapshot, saveError: undefined }
    } else {
      this.snapshot = { ...this.snapshot, saveError: messageOf(error) }
      this.changesPending = true
      this.scheduleIdleSave()
    }
    this.emit()
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

const CUT_CONFLICT_MESSAGE = 'The cut could not finish because the text changed.'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The editor could not complete the requested operation.'
}

interface NodeContent {
  text: string
  links: LinkRange[]
}

function nodeContent(node: { text: string; links?: LinkRange[] }): NodeContent {
  return { text: node.text, links: (node.links ?? []).map((link) => ({ ...link })) }
}

function sameNodeContent(node: { text: string; links?: LinkRange[] }, expected: NodeContent): boolean {
  if (node.text !== expected.text) return false
  const links = node.links ?? []
  return (
    links.length === expected.links.length &&
    links.every((link, index) => {
      const other = expected.links[index]
      return other !== undefined && link.start === other.start && link.end === other.end && link.url === other.url
    })
  )
}

function hasNewLink(existing: LinkRange[] | undefined, next: LinkRange[]): boolean {
  const remaining = new Map<string, number>()
  for (const link of existing ?? []) {
    remaining.set(link.url, (remaining.get(link.url) ?? 0) + 1)
  }
  for (const link of next) {
    const count = remaining.get(link.url) ?? 0
    if (count === 0) return true
    remaining.set(link.url, count - 1)
  }
  return false
}

function clipboardIntroducesLink(clipboard: Extract<ClipboardPayload, { kind: 'text' }>): boolean {
  if (clipboard.links !== undefined && clipboard.links.length > 0) return true
  return clipboard.text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .some((line) => isHttpUrl(line))
}
