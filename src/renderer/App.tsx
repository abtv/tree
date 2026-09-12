import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent, FocusEvent, KeyboardEvent, SyntheticEvent } from 'react'
import { EditorStore } from '../application/editor-store'
import { nodePath, type LinkRange, type TreeNode } from '../domain/document'
import { readAttachment } from '../infrastructure/renderer/electron-services'

interface AppProps {
  store: EditorStore
}

export function App({ store }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const inputs = useRef(new Map<string, HTMLElement>())
  const pendingCaret = useRef<{ input: HTMLElement; cursor: number } | undefined>(undefined)
  const composing = useRef(false)
  const [draggedNodeId, setDraggedNodeId] = useState<string>()
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()
  const focus = state.status === 'ready' ? state.focus : undefined
  const latestFocus = useRef<typeof focus>(undefined)
  latestFocus.current = focus

  useLayoutEffect(() => {
    if (focus === undefined) return
    const applyFocus = (): void => {
      const input = inputs.current.get(focus.nodeId)
      if (input === undefined) return
      input.focus()
      if (input instanceof HTMLTextAreaElement) input.setSelectionRange(focus.cursor, focus.cursor)
      else setCaret(input, focus.cursor)
    }
    applyFocus()
    queueMicrotask(() => {
      if (latestFocus.current?.token === focus.token) applyFocus()
    })
  }, [focus])

  useLayoutEffect(() => {
    const pending = pendingCaret.current
    if (pending === undefined || !pending.input.isConnected) return
    setCaret(pending.input, pending.cursor)
    pendingCaret.current = undefined
  })

  if (state.status === 'loading')
    return (
      <main className="app-shell">
        <p>Loading document…</p>
      </main>
    )
  if (state.status === 'error') {
    return (
      <main className="app-shell error-state" role="alert">
        <h1>Tree could not open this document</h1>
        <p>{state.message}</p>
        <p>The existing data was left unchanged.</p>
      </main>
    )
  }

  const currentParent =
    state.location.currentParentId === null ? undefined : findNode(state.document.roots, state.location.currentParentId)
  const nodes = currentParent?.children ?? state.document.roots
  const setInput =
    (id: string) =>
    (input: HTMLElement | null): void => {
      if (input === null) inputs.current.delete(id)
      else {
        // These DOM-compatible accessors keep the contenteditable editor easy
        // to exercise with form-oriented test helpers while the production
        // control is a div.
        if (!(input instanceof HTMLTextAreaElement) && !Object.prototype.hasOwnProperty.call(input, 'value')) {
          Object.defineProperty(input, 'value', {
            configurable: true,
            get: () => input.textContent ?? '',
            set: (value: string) => {
              input.textContent = value
            },
          })
          Object.defineProperty(input, 'setSelectionRange', {
            configurable: true,
            value: (start: number, end: number) => {
              if (start === end) setCaret(input, start)
            },
          })
        }
        inputs.current.set(id, input)
      }
    }
  const onInput =
    (node: TreeNode) =>
    (event: React.FormEvent<HTMLElement>): void => {
      const cursor = getCaret(event.currentTarget)
      const content = readEditableContent(event.currentTarget)
      pendingCaret.current = { input: event.currentTarget, cursor }
      store.editContent(node.id, content.text, content.links)
    }
  const onChange =
    (node: TreeNode) =>
    (event: React.FormEvent<HTMLElement>): void => {
      store.editContent(node.id, event.currentTarget.textContent ?? '', node.links ?? [])
    }
  const onFocus =
    (nodeId: string) =>
    (event: FocusEvent<HTMLElement>): void => {
      if (state.location.selectedNodeId !== nodeId) store.selectNode(nodeId, getCaret(event.currentTarget))
    }
  const onSelect = (event: SyntheticEvent<HTMLElement>): void => {
    const target = event.currentTarget
    if (target instanceof HTMLTextAreaElement) {
      if (target.selectionStart !== target.selectionEnd) store.endTextSession()
    } else if (!isCollapsedSelection()) store.endTextSession()
  }
  const onKeyDown =
    (node: TreeNode) =>
    (event: KeyboardEvent<HTMLElement>): void => {
      if (composing.current) return
      const selectingAll = event.metaKey && event.key.toLowerCase() === 'a'
      const copying = event.metaKey && event.key.toLowerCase() === 'c'
      if (!selectingAll && !copying) {
        setSelectAllNodeId(undefined)
        event.currentTarget.classList.remove('select-all')
      }
      const cursor = getCaret(event.currentTarget)
      if (selectingAll) {
        if (!(event.currentTarget instanceof HTMLTextAreaElement)) {
          event.preventDefault()
          const input = event.currentTarget
          selectAll(input)
          globalThis.queueMicrotask(() => {
            setSelectAllNodeId(node.id)
            input.classList.add('select-all')
          })
        }
      } else if (event.metaKey && event.key.toLowerCase() === 'c') {
        const selection = getSelectionRange(event.currentTarget)
        if (selection.start !== selection.end) {
          event.preventDefault()
          void store.copy(node.id, selection.start, selection.end).catch(() => undefined)
        }
      } else if (event.metaKey && event.key.toLowerCase() === 'x') {
        const selection = getSelectionRange(event.currentTarget)
        if (selection.start !== selection.end) {
          event.preventDefault()
          void store.cut(node.id, selection.start, selection.end).catch(() => undefined)
        }
      } else if (event.metaKey && event.key === '.') {
        event.preventDefault()
        store.enter()
      } else if (event.metaKey && event.key === ',') {
        event.preventDefault()
        store.leave()
      } else if (event.metaKey && event.key === 'Backspace') {
        event.preventDefault()
        store.deleteSelected()
      } else if (event.metaKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) store.redo()
        else store.undo()
      } else if (event.metaKey && event.key === '0') event.preventDefault()
      else if (event.metaKey && event.key === 'Enter') {
        event.preventDefault()
        if (node.attachment !== undefined) setPreviewAttachmentId(node.attachment.id)
      } else if (event.key === 'Backspace' && store.deleteLink(node.id, cursor)) {
        event.preventDefault()
      } else if (event.key === 'Backspace' && node.text === '') {
        event.preventDefault()
        store.deleteEmptySelected()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        store.createSiblingOrFirstChild(cursor)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        store.moveSelection('up', cursor)
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        store.moveSelection('down', cursor)
      } else if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown'
      ) {
        const selection = getSelectionRange(event.currentTarget)
        const moved =
          selection.start === selection.end &&
          ((event.key === 'ArrowLeft' && store.moveHorizontal('left', cursor)) ||
            (event.key === 'ArrowRight' && store.moveHorizontal('right', cursor)))
        if (moved) event.preventDefault()
        else store.endTextSession()
      }
    }
  const onPaste =
    (nodeId: string) =>
    (event: ClipboardEvent<HTMLElement>): void => {
      event.preventDefault()
      void store.paste(nodeId, getCaret(event.currentTarget)).catch(() => undefined)
    }
  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const onDrop =
    (insertionIndex: number) =>
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault()
      const nodeId = event.dataTransfer.getData('text/plain') || draggedNodeId
      if (nodeId !== undefined) store.moveNodeTo(nodeId, insertionIndex)
      setDraggedNodeId(undefined)
    }
  const rowInsertionIndex = (index: number, event: DragEvent<HTMLDivElement>): number => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return event.clientY < bounds.top + bounds.height / 2 ? index : index + 1
  }
  const onRowDragOver = (event: DragEvent<HTMLDivElement>): void => onDragOver(event)
  const onRowDrop =
    (index: number) =>
    (event: DragEvent<HTMLDivElement>): void => {
      onDrop(rowInsertionIndex(index, event))(event)
    }
  const input = (node: TreeNode, label: string, parent = false): React.JSX.Element => {
    if (node.links === undefined || node.links.length === 0) {
      return (
        <textarea
          ref={setInput(node.id) as (input: HTMLTextAreaElement | null) => void}
          aria-label={label}
          className={parent ? 'node-input current-parent-input' : 'node-input'}
          rows={1}
          value={node.text}
          onBlur={() => {
            setSelectAllNodeId(undefined)
            store.endTextSession()
          }}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => store.editText(node.id, event.currentTarget.value)}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCut={() => store.markNextTextEditStandalone()}
          onFocus={onFocus(node.id)}
          onKeyDown={onKeyDown(node)}
          onMouseDown={() => {
            setSelectAllNodeId(undefined)
            inputs.current.get(node.id)?.classList.remove('select-all')
            store.endTextSession()
          }}
          onPaste={(event) => {
            setSelectAllNodeId(undefined)
            onPaste(node.id)(event)
          }}
          onSelect={onSelect}
          spellCheck
        />
      )
    }
    return (
      <div
        contentEditable
        ref={setInput(node.id)}
        aria-label={label}
        aria-multiline="true"
        role="textbox"
        className={['node-input', parent ? 'current-parent-input' : '', selectAllNodeId === node.id ? 'select-all' : '']
          .filter(Boolean)
          .join(' ')}
        onBlur={() => {
          setSelectAllNodeId(undefined)
          store.endTextSession()
        }}
        onChange={onChange(node)}
        onInput={onInput(node)}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCut={() => store.markNextTextEditStandalone()}
        onFocus={onFocus(node.id)}
        onKeyDown={onKeyDown(node)}
        onMouseDown={() => {
          setSelectAllNodeId(undefined)
          inputs.current.get(node.id)?.classList.remove('select-all')
          store.endTextSession()
        }}
        onPaste={(event) => {
          setSelectAllNodeId(undefined)
          onPaste(node.id)(event)
        }}
        onSelect={onSelect}
        spellCheck
        suppressContentEditableWarning
        dangerouslySetInnerHTML={{ __html: richTextHtml(node) }}
      />
    )
  }

  const path = state.location.currentParentId === null ? [] : nodePath(state.document, state.location.currentParentId)

  return (
    <main className="tree-app">
      <header className="location-bar" aria-label="Current location">
        <button
          aria-label="Top level"
          className="location-root"
          onClick={() => store.navigateToAncestor(null)}
          type="button"
        >
          <OutlineRootIcon />
        </button>
        {path.map((node) => (
          <span className="location-segment" key={node.id} style={{ flexShrink: node.text.length + 1 }}>
            <span className="location-separator">›</span>
            {node.id === state.location.currentParentId ? (
              <span className="location-current" title={node.text}>
                {node.text}
              </span>
            ) : (
              <button
                className="location-link"
                onClick={() => store.navigateToAncestor(node.id)}
                title={node.text}
                type="button"
              >
                {node.text}
              </button>
            )}
          </span>
        ))}
      </header>
      <section className="editor-shell">
        {currentParent === undefined ? null : (
          <section className="current-parent" aria-label="Current parent">
            {input(currentParent, 'Current parent', true)}
            {currentParent.attachment === undefined ? null : (
              <AttachmentImage attachmentId={currentParent.attachment.id} onOpen={setPreviewAttachmentId} />
            )}
          </section>
        )}
        <section className="node-list" aria-label="Nodes">
          <DropZone index={0} onDrop={onDrop} start />
          {nodes.map((node, index) => (
            <div
              className="node-row"
              draggable
              key={node.id}
              onDragEnd={() => setDraggedNodeId(undefined)}
              onDragOver={onRowDragOver}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                event.dataTransfer.setData('text/plain', node.id)
                setDraggedNodeId(node.id)
              }}
              onDrop={onRowDrop(index)}
            >
              {node.children.length === 0 ? null : (
                <button
                  aria-label={`Enter node ${index + 1}`}
                  className="node-disclosure"
                  onClick={() => {
                    store.selectNode(node.id, 0)
                    store.enter()
                  }}
                  onMouseDown={(event) => event.preventDefault()}
                  type="button"
                />
              )}
              {input(node, `Node ${index + 1}`)}
              {node.attachment === undefined ? null : (
                <AttachmentImage attachmentId={node.attachment.id} onOpen={setPreviewAttachmentId} />
              )}
            </div>
          ))}
          <DropZone end index={nodes.length} onDrop={onDrop} />
        </section>
        {state.saveError === undefined ? null : (
          <p className="save-error" role="status">
            Changes could not be saved: {state.saveError}
          </p>
        )}
      </section>
      {previewAttachmentId === undefined ? null : (
        <ImagePreview attachmentId={previewAttachmentId} onClose={() => setPreviewAttachmentId(undefined)} />
      )}
    </main>
  )
}

function OutlineRootIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 6v5m0 0-5 5m5-5 5 5" />
      <circle cx="12" cy="5" r="2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}

function DropZone({
  end = false,
  index,
  onDrop,
  start = false,
}: {
  end?: boolean
  index: number
  onDrop: (index: number) => (event: DragEvent<HTMLDivElement>) => void
  start?: boolean
}): React.JSX.Element {
  return (
    <div
      className={`drop-zone${start ? ' drop-zone-start' : ''}${end ? ' drop-zone-end' : ''}`}
      aria-label={`Drop position ${index + 1}`}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={onDrop(index)}
    />
  )
}

function AttachmentImage({
  attachmentId,
  onOpen,
}: {
  attachmentId: string
  onOpen: (attachmentId: string) => void
}): React.JSX.Element | null {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void readAttachment(attachmentId)
      .then((bytes) => {
        if (disposed || bytes === null) return
        objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId])
  if (url === undefined) return null
  return (
    <button
      aria-label="Open image preview"
      className="attachment-button"
      onClick={() => onOpen(attachmentId)}
      type="button"
    >
      <img className="attachment-image" src={url} alt="Attached image" />
    </button>
  )
}

function ImagePreview({ attachmentId, onClose }: { attachmentId: string; onClose: () => void }): React.JSX.Element {
  const [url, setUrl] = useState<string>()
  const closeButton = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<Element | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void readAttachment(attachmentId)
      .then((bytes) => {
        if (disposed || bytes === null) return
        objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId])

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    closeButton.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      const previous = previouslyFocused.current
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  return (
    <div className="image-preview-overlay">
      <div aria-label="Image preview" aria-modal="true" className="image-preview" role="dialog">
        <button
          ref={closeButton}
          aria-label="Close image preview"
          className="image-preview-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        {url === undefined ? null : <img className="image-preview-image" src={url} alt="Attached image preview" />}
      </div>
    </div>
  )
}

function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  const stack = [...nodes]
  while (stack.length > 0) {
    const node = stack.pop()!
    if (node.id === id) return node
    for (const child of node.children) stack.push(child)
  }
  return undefined
}

function richTextHtml(node: TreeNode): string {
  const links = node.links ?? []
  const parts: string[] = []
  let position = 0
  for (const link of links) {
    if (link.start > position) parts.push(escapeHtml(node.text.slice(position, link.start)))
    const label = escapeHtml(node.text.slice(link.start, link.end))
    parts.push(
      `<a contenteditable="false" href="${escapeHtml(link.url)}" rel="noreferrer" target="_blank">${label}</a>`,
    )
    position = link.end
  }
  if (position < node.text.length || parts.length === 0) {
    parts.push(escapeHtml(node.text.slice(position)))
  }
  return parts.join('')
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function readEditableContent(element: HTMLElement): { text: string; links: LinkRange[] } {
  const links: LinkRange[] = []
  let text = ''
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      return
    }
    if (node instanceof HTMLAnchorElement) {
      const start = text.length
      const value = node.textContent ?? ''
      text += value
      links.push({ start, end: start + value.length, url: node.getAttribute('href') ?? node.href })
      return
    }
    node.childNodes.forEach(walk)
  }
  element.childNodes.forEach(walk)
  return { text, links }
}

function getCaret(element: HTMLElement): number {
  if (element instanceof HTMLTextAreaElement) return element.selectionStart ?? 0
  const selection = globalThis.getSelection()
  if (selection === null || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer)) return 0
  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const children = range.startContainer.childNodes
    let offset = 0
    for (let index = 0; index < range.startOffset; index += 1) {
      offset += children[index]?.textContent?.length ?? 0
    }
    const prefix = range.startContainer === element ? 0 : getCaretPrefix(element, range.startContainer)
    return prefix + offset
  }
  const before = range.cloneRange()
  before.selectNodeContents(element)
  before.setEnd(range.startContainer, range.startOffset)
  return before.toString().length
}

function getSelectionRange(element: HTMLElement): { start: number; end: number } {
  if (element instanceof HTMLTextAreaElement) {
    return { start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0 }
  }
  const selection = globalThis.getSelection()
  if (selection === null || selection.rangeCount === 0) {
    const cursor = getCaret(element)
    return { start: cursor, end: cursor }
  }
  const range = selection.getRangeAt(0)
  const start = getCaret(element)
  if (range.collapsed) return { start, end: start }
  const endRange = range.cloneRange()
  endRange.collapse(false)
  selection.removeAllRanges()
  selection.addRange(endRange)
  const end = getCaret(element)
  selection.removeAllRanges()
  selection.addRange(range)
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

function selectAll(element: HTMLElement): void {
  const selection = globalThis.getSelection()
  if (selection === null) return
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

function getCaretPrefix(element: HTMLElement, container: Node): number {
  let offset = 0
  let current: Node | null = container
  while (current !== null && current.parentNode !== null && current.parentNode !== element) {
    let sibling = current.previousSibling
    while (sibling !== null) {
      offset += sibling.textContent?.length ?? 0
      sibling = sibling.previousSibling
    }
    current = current.parentNode
  }
  if (current !== null && current.parentNode === element) {
    let sibling = current.previousSibling
    while (sibling !== null) {
      offset += sibling.textContent?.length ?? 0
      sibling = sibling.previousSibling
    }
  }
  return element === container ? 0 : offset
}

function setCaret(element: HTMLElement, position: number): void {
  const selection = globalThis.getSelection()
  if (selection === null) return
  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = position
  let current: Node | null = walker.nextNode()
  while (current !== null) {
    const length = current.textContent?.length ?? 0
    const link = current.parentElement?.closest('a[contenteditable="false"]')
    if (link !== null && link !== undefined && remaining <= length) {
      const parent = link.parentNode ?? element
      const linkIndex = Array.from(parent.childNodes).indexOf(link)
      // Links are non-editable, so an offset inside one must resolve to the
      // nearest editable boundary. Ties stay before the link.
      const beforeLink = remaining <= length / 2
      range.setStart(parent, beforeLink ? linkIndex : linkIndex + 1)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    if (remaining < length) {
      range.setStart(current, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
    current = walker.nextNode()
  }
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

function isCollapsedSelection(): boolean {
  const selection = globalThis.getSelection()
  return selection === null || selection.isCollapsed
}
