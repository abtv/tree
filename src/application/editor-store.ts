import {
  collectAttachmentIds,
  createInitialDocument,
  deleteLink,
  editNodeContent,
  isValidLocation,
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
  private standaloneNextTextEdit = false
  private pendingClipboardOperation: Promise<void> | undefined
  private focusToken = 0
  public constructor(
    private readonly services: EditorServices,
    private readonly createId: () => string,
    private readonly clock: Clock = systemClock,
  ) {
    this.persistence = new PersistenceCoordinator(services, {
      currentState: () => (this.snapshot.status === 'ready' ? this.snapshot : undefined),
      referencedAttachmentIds: () => this.referencedAttachmentIds(),
      onResult: (error) => this.handlePersistenceResult(error),
    })
  }

  public getSnapshot = (): EditorSnapshot => this.snapshot

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public async flushPersistence(): Promise<void> {
    await this.persistence.flush()
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
        return
      }

      const parsed = parsePersistedState(loaded)
      for (const attachmentId of collectAttachmentIds(parsed.document)) {
        if (!(await this.services.hasAttachment(attachmentId))) {
          throw new Error(`Attachment ${attachmentId} is missing from local storage.`)
        }
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

  public selectNode(nodeId: NodeId, cursor: number): void {
    const state = this.ready()
    if (!isValidLocation(state.document, { ...state.location, selectedNodeId: nodeId })) {
      return
    }
    this.endTextSession()
    this.replaceReady(
      { ...state, location: { ...state.location, selectedNodeId: nodeId }, focus: this.newFocus(nodeId, cursor) },
      true,
    )
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
      this.history.begin(state.document)
      this.activeTextNodeId = nodeId
    }
    const next = editNodeContent(state.document, nodeId, text, links)
    this.replaceReady({ ...state, document: next }, true)
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
    const operation = (async (): Promise<void> => {
      await this.services.writeClipboard!(transition.payload)
      if (this.snapshot.status !== 'ready' || this.snapshot.location.selectedNodeId !== nodeId) return
      this.applyStructural(
        removeTextRange(this.snapshot.document, nodeId, transition.from, transition.to),
        this.snapshot.location,
        this.newFocus(nodeId, transition.from),
      )
    })()
    this.pendingClipboardOperation = operation
    try {
      await operation
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
    this.replaceReady(
      {
        ...state,
        location: transition.location,
        focus: this.newFocus(transition.focus.nodeId, transition.focus.cursor),
      },
      true,
    )
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
  }

  public createSiblingOrFirstChild(cursor: number): void {
    const state = this.ready()
    this.endTextSession()
    const transition = createSiblingOrFirstChildTransition(state.document, state.location, cursor, this.createId)
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
      } finally {
        this.pendingAttachmentIds.delete(attachment.id)
        this.queueAttachmentCleanup()
      }
      return
    }

    const transition = textPasteTransition(current.document, current.location, nodeId, cursor, clipboard, (count) =>
      Array.from({ length: count }, () => this.createId()),
    )
    this.applyStructural(
      transition.document,
      transition.location,
      this.newFocus(transition.focus.nodeId, transition.focus.cursor),
    )
  }

  public undo(): void {
    this.endTextSession()
    const state = this.ready()
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
  }

  public redo(): void {
    this.endTextSession()
    const state = this.ready()
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
  }

  private applyStructural(document: Document, location: Location, focus: FocusIntent): void {
    const state = this.ready()
    this.history.begin(state.document)
    this.replaceReady({ ...state, document, location, focus }, true)
  }

  private scheduleTextBoundary(): void {
    if (this.textTimer !== undefined) {
      this.clock.clearTimeout(this.textTimer)
    }
    this.textTimer = this.clock.setTimeout(() => this.endTextSession(), 5_000)
  }

  private replaceReady(state: Extract<EditorSnapshot, { status: 'ready' }>, persist: boolean): void {
    this.snapshot = state.operationError === undefined ? state : { ...state, operationError: undefined }
    this.emit()
    if (persist) {
      this.persistence.requestSave()
    }
  }

  private queueAttachmentCleanup(): void {
    this.persistence.requestAttachmentCleanup()
  }

  private referencedAttachmentIds(): Set<AttachmentId> {
    const ids = new Set<AttachmentId>()
    const add = (document: Document): void => {
      collectAttachmentIds(document).forEach((id) => ids.add(id))
    }
    if (this.snapshot.status === 'ready') {
      add(this.snapshot.document)
    }
    for (const document of this.history.documents()) add(document)
    this.pendingAttachmentIds.forEach((id) => ids.add(id))
    return ids
  }

  private handlePersistenceResult(error: unknown | undefined): void {
    if (this.snapshot.status !== 'ready') return
    if (error === undefined) {
      if (this.snapshot.saveError === undefined) return
      this.snapshot = { ...this.snapshot, saveError: undefined }
    } else {
      this.snapshot = { ...this.snapshot, saveError: messageOf(error) }
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The editor could not complete the requested operation.'
}
