import {
  attachImage,
  cloneDocument,
  collectAttachmentIds,
  createFirstChild,
  createInitialDocument,
  deleteNode,
  deleteLink,
  displayedNodes,
  editNodeContent,
  ensureRoot,
  insertSiblingAfter,
  insertSiblingBefore,
  isValidLocation,
  locateNode,
  moveSibling,
  nodePath,
  parsePersistedState,
  pasteMultilineText,
  pasteText,
  removeTextRange,
  requireNode,
  serializeState,
  splitNode,
  type AttachmentId,
  type AttachmentReference,
  type Document,
  type Location,
  type LinkRange,
  type NodeId,
} from '../domain/document'
import type { ClipboardPayload } from '../shared/ipc'
import type { ClipboardWritePayload } from '../shared/ipc'

export type ClipboardValue = ClipboardPayload

export interface EditorServices {
  load(): Promise<unknown | null>
  save(state: ReturnType<typeof serializeState>): Promise<void>
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
  private readonly past: Document[] = []
  private readonly future: Document[] = []
  private readonly pendingAttachmentIds = new Set<AttachmentId>()
  private snapshot: EditorSnapshot = { status: 'loading' }
  private activeTextNodeId: NodeId | undefined
  private textTimer: unknown
  private standaloneNextTextEdit = false
  private pendingClipboardOperation: Promise<void> | undefined
  private focusToken = 0
  private saveQueue: Promise<void> = Promise.resolve()
  private persistenceError: unknown

  public constructor(
    private readonly services: EditorServices,
    private readonly createId: () => string,
    private readonly clock: Clock = systemClock,
  ) {}

  public getSnapshot = (): EditorSnapshot => this.snapshot

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  public async flushPersistence(): Promise<void> {
    await this.saveQueue
    if (this.persistenceError !== undefined) throw this.persistenceError
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
        this.queuePersistence()
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
      this.beginHistoryEntry(state.document)
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
    const node = requireNode(state.document, nodeId).node
    const from = Math.max(0, Math.min(start, end))
    const to = Math.min(node.text.length, Math.max(start, end))
    if (from === to || this.services.writeClipboard === undefined) return false
    const text = node.text.slice(from, to)
    const links = (node.links ?? [])
      .filter((link) => link.start >= from && link.end <= to)
      .map((link) => ({ ...link, start: link.start - from, end: link.end - from }))
    const operation = this.services.writeClipboard({ text, html: clipboardHtml(text, links) })
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
    const node = requireNode(state.document, nodeId).node
    const from = Math.max(0, Math.min(start, end))
    const to = Math.min(node.text.length, Math.max(start, end))
    if (from === to || this.services.writeClipboard === undefined) return false
    const text = node.text.slice(from, to)
    const links = (node.links ?? [])
      .filter((link) => link.start >= from && link.end <= to)
      .map((link) => ({ ...link, start: link.start - from, end: link.end - from }))
    const operation = (async (): Promise<void> => {
      await this.services.writeClipboard!({ text, html: clipboardHtml(text, links) })
      if (this.snapshot.status !== 'ready' || this.snapshot.location.selectedNodeId !== nodeId) return
      this.applyStructural(
        removeTextRange(this.snapshot.document, nodeId, from, to),
        this.snapshot.location,
        this.newFocus(nodeId, from),
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
    if (state.location.currentParentId === state.location.selectedNodeId) {
      if (direction === 'up') {
        const parent = requireNode(state.document, state.location.currentParentId).node
        this.selectNode(parent.id, 0)
      }
      if (direction === 'down') {
        const child = displayedNodes(state.document, state.location.currentParentId)[0]
        if (child !== undefined) {
          this.selectNode(child.id, Math.min(cursor, child.text.length))
        } else {
          const parent = requireNode(state.document, state.location.currentParentId).node
          this.selectNode(parent.id, parent.text.length)
        }
      }
      return
    }
    const nodes = displayedNodes(state.document, state.location.currentParentId)
    const index = nodes.findIndex((node) => node.id === state.location.selectedNodeId)
    if (direction === 'up' && index === 0 && state.location.currentParentId === null) {
      this.selectNode(nodes[0]!.id, 0)
      return
    }
    if (direction === 'up' && index === 0 && state.location.currentParentId !== null) {
      const parent = requireNode(state.document, state.location.currentParentId).node
      this.selectNode(parent.id, Math.min(cursor, parent.text.length))
      return
    }
    if (direction === 'down' && index === nodes.length - 1) {
      this.selectNode(nodes[index]!.id, nodes[index]!.text.length)
      return
    }
    const target = nodes[index + (direction === 'up' ? -1 : 1)]
    if (target !== undefined) {
      this.selectNode(target.id, Math.min(cursor, target.text.length))
    }
  }

  public moveHorizontal(direction: 'left' | 'right', cursor: number): boolean {
    const state = this.ready()
    if (state.location.currentParentId === state.location.selectedNodeId) {
      if (direction === 'right') {
        const parent = requireNode(state.document, state.location.currentParentId).node
        const child = parent.children[0]
        if (cursor === parent.text.length && child !== undefined) {
          this.selectNode(child.id, 0)
          return true
        }
      }
      return false
    }

    const selected = requireNode(state.document, state.location.selectedNodeId)
    const atBoundary = direction === 'left' ? cursor === 0 : cursor === selected.node.text.length
    if (!atBoundary) return false

    const target = selected.siblings[selected.index + (direction === 'left' ? -1 : 1)]
    if (target !== undefined) {
      this.selectNode(target.id, direction === 'left' ? target.text.length : 0)
      return true
    }

    if (direction === 'left' && selected.parent !== null) {
      this.selectNode(selected.parent.id, direction === 'left' ? selected.parent.text.length : 0)
      return true
    }

    return false
  }

  public enter(): void {
    const state = this.ready()
    if (state.location.currentParentId === state.location.selectedNodeId) {
      return
    }
    this.endTextSession()
    const entered = requireNode(state.document, state.location.selectedNodeId).node
    const child = entered.children[0]
    const selectedNodeId = child?.id ?? entered.id
    this.replaceReady(
      {
        ...state,
        location: { currentParentId: entered.id, selectedNodeId },
        focus: this.newFocus(selectedNodeId, 0),
      },
      true,
    )
  }

  public leave(): void {
    const state = this.ready()
    const currentParentId = state.location.currentParentId
    if (currentParentId === null) {
      return
    }
    this.endTextSession()
    const currentParent = requireNode(state.document, currentParentId)
    this.replaceReady(
      {
        ...state,
        location: { currentParentId: currentParent.parent?.id ?? null, selectedNodeId: currentParentId },
        focus: this.newFocus(currentParentId, 0),
      },
      true,
    )
  }

  public navigateToAncestor(parentId: NodeId | null): void {
    const state = this.ready()
    const currentParentId = state.location.currentParentId
    if (parentId === currentParentId || currentParentId === null) {
      return
    }

    const path = nodePath(state.document, currentParentId)
    const parentIndex = parentId === null ? -1 : path.findIndex((node) => node.id === parentId)
    const selected = path[parentIndex + 1]
    if ((parentIndex === -1 && parentId !== null) || selected === undefined) {
      return
    }

    this.endTextSession()
    this.replaceReady(
      {
        ...state,
        location: { currentParentId: parentId, selectedNodeId: selected.id },
        focus: this.newFocus(selected.id, 0),
      },
      true,
    )
  }

  public createSiblingOrFirstChild(cursor: number): void {
    const state = this.ready()
    this.endTextSession()
    if (state.location.currentParentId === state.location.selectedNodeId) {
      const id = this.createId()
      const document = createFirstChild(state.document, state.location.selectedNodeId, id)
      this.applyStructural(document, { ...state.location, selectedNodeId: id }, this.newFocus(id, 0))
      return
    }

    const id = this.createId()
    const selected = requireNode(state.document, state.location.selectedNodeId).node
    const document =
      cursor === 0 && selected.text !== ''
        ? insertSiblingBefore(state.document, state.location.selectedNodeId, id)
        : splitNode(state.document, state.location.selectedNodeId, cursor, id)
    this.applyStructural(document, { ...state.location, selectedNodeId: id }, this.newFocus(id, 0))
  }

  public deleteSelected(): void {
    const state = this.ready()
    this.endTextSession()
    const selected = requireNode(state.document, state.location.selectedNodeId)
    const parentIsSelected = state.location.currentParentId === selected.node.id
    const siblings = selected.siblings
    const nextSibling = siblings[selected.index + 1]
    const previousSibling = siblings[selected.index - 1]
    let document = deleteNode(state.document, selected.node.id)
    let location: Location

    if (parentIsSelected) {
      if (selected.parent !== null) {
        location = { currentParentId: selected.parent.id, selectedNodeId: selected.parent.id }
      } else {
        document = ensureRoot(document, this.createId())
        const destination = nextSibling ?? previousSibling ?? document.roots[0]
        if (destination === undefined) {
          throw new Error('A root replacement was not created.')
        }
        location = { currentParentId: null, selectedNodeId: destination.id }
      }
    } else if (nextSibling !== undefined || previousSibling !== undefined) {
      const destination = nextSibling ?? previousSibling
      if (destination === undefined) {
        throw new Error('A sibling destination was not found.')
      }
      location = { ...state.location, selectedNodeId: destination.id }
    } else if (state.location.currentParentId !== null) {
      location = { ...state.location, selectedNodeId: state.location.currentParentId }
    } else {
      document = ensureRoot(document, this.createId())
      location = { currentParentId: null, selectedNodeId: document.roots[0]!.id }
    }

    this.applyStructural(document, location, this.newFocus(location.selectedNodeId, 0))
  }

  public deleteEmptySelected(): void {
    const state = this.ready()
    const selected = requireNode(state.document, state.location.selectedNodeId)
    if (selected.node.id === state.location.currentParentId || selected.node.text !== '') {
      return
    }
    this.endTextSession()
    const previous = selected.siblings[selected.index - 1]
    const next = selected.siblings[selected.index + 1]
    const document = deleteNode(state.document, selected.node.id)
    if (previous !== undefined) {
      this.applyStructural(
        document,
        { ...state.location, selectedNodeId: previous.id },
        this.newFocus(previous.id, previous.text.length),
      )
      return
    }
    if (selected.parent !== null) {
      this.applyStructural(
        document,
        { currentParentId: selected.parent.id, selectedNodeId: selected.parent.id },
        this.newFocus(selected.parent.id, selected.parent.text.length),
      )
      return
    }
    if (next !== undefined) {
      this.applyStructural(document, { ...state.location, selectedNodeId: next.id }, this.newFocus(next.id, 0))
    }
  }

  public moveSelectedTo(insertionIndex: number): void {
    const state = this.ready()
    this.moveNodeTo(state.location.selectedNodeId, insertionIndex)
  }

  public moveNodeTo(nodeId: NodeId, insertionIndex: number): void {
    const state = this.ready()
    const nodes = displayedNodes(state.document, state.location.currentParentId)
    const sourceIndex = nodes.findIndex((node) => node.id === nodeId)
    if (sourceIndex < 0) {
      return
    }
    const destination = insertionIndex > sourceIndex ? insertionIndex - 1 : insertionIndex
    if (destination === sourceIndex) {
      return
    }
    this.endTextSession()
    this.applyStructural(
      moveSibling(state.document, nodeId, destination),
      { ...state.location, selectedNodeId: nodeId },
      this.newFocus(nodeId, 0),
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
        const target = requireNode(this.snapshot.document, nodeId).node
        if (target.attachment === undefined) {
          this.applyStructural(
            attachImage(this.snapshot.document, nodeId, attachment),
            this.snapshot.location,
            this.newFocus(nodeId, target.text.length),
          )
        } else {
          const newId = this.createId()
          const outerLocation = this.locationForSiblingOf(this.snapshot.document, nodeId, newId, this.snapshot.location)
          this.applyStructural(
            insertSiblingAfter(this.snapshot.document, nodeId, newId, '', attachment),
            outerLocation,
            this.newFocus(newId, 0),
          )
        }
      } finally {
        this.pendingAttachmentIds.delete(attachment.id)
        this.queueAttachmentCleanup()
      }
      return
    }

    if (!clipboard.text.includes('\n') && !clipboard.text.includes('\r')) {
      this.applyStructural(
        pasteText(current.document, nodeId, cursor, clipboard.text, clipboard.links),
        current.location,
        this.newFocus(nodeId, cursor + clipboard.text.length),
      )
      return
    }
    const lines = clipboard.text.replace(/\r\n?/g, '\n').split('\n')
    const ids = lines.slice(1).map(() => this.createId())
    const finalNodeId = ids.at(-1)
    const finalLine = lines.at(-1) ?? ''
    this.applyStructural(
      pasteMultilineText(current.document, nodeId, cursor, lines, ids, clipboard.links),
      this.locationForSiblingOf(current.document, nodeId, finalNodeId ?? nodeId, current.location),
      this.newFocus(finalNodeId ?? nodeId, finalLine.length),
    )
  }

  public undo(): void {
    this.endTextSession()
    const previous = this.past.pop()
    if (previous === undefined) {
      return
    }
    const state = this.ready()
    this.future.push(cloneDocument(state.document))
    const location = this.reconcileLocation(previous, state.document, state.location)
    this.replaceReady(
      { ...state, document: previous, location, focus: this.newFocus(location.selectedNodeId, 0) },
      true,
    )
  }

  public redo(): void {
    this.endTextSession()
    const next = this.future.pop()
    if (next === undefined) {
      return
    }
    const state = this.ready()
    this.past.push(cloneDocument(state.document))
    const location = this.reconcileLocation(next, state.document, state.location)
    this.replaceReady({ ...state, document: next, location, focus: this.newFocus(location.selectedNodeId, 0) }, true)
  }

  private applyStructural(document: Document, location: Location, focus: FocusIntent): void {
    const state = this.ready()
    this.beginHistoryEntry(state.document)
    this.replaceReady({ ...state, document, location, focus }, true)
  }

  private beginHistoryEntry(document: Document): void {
    this.past.push(cloneDocument(document))
    this.future.length = 0
  }

  private scheduleTextBoundary(): void {
    if (this.textTimer !== undefined) {
      this.clock.clearTimeout(this.textTimer)
    }
    this.textTimer = this.clock.setTimeout(() => this.endTextSession(), 5_000)
  }

  private reconcileLocation(document: Document, previousDocument: Document, previousLocation: Location): Location {
    if (isValidLocation(document, previousLocation)) {
      return previousLocation
    }
    const current =
      previousLocation.currentParentId === null
        ? undefined
        : locateNode(previousDocument, previousLocation.currentParentId)
    const candidates =
      current === undefined ? [] : [...current.ancestors.map((node) => node.id), current.node.id].reverse()
    for (const candidate of candidates) {
      if (locateNode(document, candidate) !== undefined) {
        return { currentParentId: candidate, selectedNodeId: candidate }
      }
    }
    const root = document.roots[0]
    if (root === undefined) {
      throw new Error('An undo state must contain a root node.')
    }
    return { currentParentId: null, selectedNodeId: root.id }
  }

  private locationForSiblingOf(
    document: Document,
    nodeId: NodeId,
    selectedNodeId: NodeId,
    location: Location,
  ): Location {
    if (location.currentParentId !== nodeId) {
      return { ...location, selectedNodeId }
    }
    return { currentParentId: requireNode(document, nodeId).parent?.id ?? null, selectedNodeId }
  }

  private replaceReady(state: Extract<EditorSnapshot, { status: 'ready' }>, persist: boolean): void {
    this.snapshot = state.operationError === undefined ? state : { ...state, operationError: undefined }
    this.emit()
    if (persist) {
      this.queuePersistence()
    }
  }

  private queuePersistence(): void {
    this.saveQueue = this.saveQueue
      .then(async () => {
        const state = this.ready()
        await this.services.save(serializeState(state.document, state.location))
        await this.services.cleanupAttachments([...this.referencedAttachmentIds()])
        this.persistenceError = undefined
        if (this.snapshot.status === 'ready' && this.snapshot.saveError !== undefined) {
          this.snapshot = { ...this.snapshot, saveError: undefined }
          this.emit()
        }
      })
      .catch((error) => {
        this.persistenceError = error
        if (this.snapshot.status === 'ready') {
          this.snapshot = { ...this.snapshot, saveError: messageOf(error) }
          this.emit()
        }
      })
  }

  private queueAttachmentCleanup(): void {
    void this.services.cleanupAttachments([...this.referencedAttachmentIds()]).catch(() => undefined)
  }

  private referencedAttachmentIds(): Set<AttachmentId> {
    const ids = new Set<AttachmentId>()
    const add = (document: Document): void => {
      collectAttachmentIds(document).forEach((id) => ids.add(id))
    }
    if (this.snapshot.status === 'ready') {
      add(this.snapshot.document)
    }
    this.past.forEach(add)
    this.future.forEach(add)
    this.pendingAttachmentIds.forEach((id) => ids.add(id))
    return ids
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

function clipboardHtml(text: string, links: Array<{ start: number; end: number; url: string }>): string {
  const parts: string[] = []
  let position = 0
  for (const link of links) {
    parts.push(escapeClipboardHtml(text.slice(position, link.start)))
    const label = escapeClipboardHtml(text.slice(link.start, link.end))
    parts.push(`<a href="${escapeClipboardHtml(link.url)}">${label}</a>`)
    position = link.end
  }
  parts.push(escapeClipboardHtml(text.slice(position)))
  return parts.join('').replaceAll('\n', '<br>')
}

function escapeClipboardHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
