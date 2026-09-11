import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent, FocusEvent, KeyboardEvent, SyntheticEvent } from 'react'
import { EditorStore } from '../application/editor-store'
import { nodePath, type TreeNode } from '../domain/document'
import { readAttachment } from '../infrastructure/renderer/electron-services'

interface AppProps {
  store: EditorStore
}

export function App({ store }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const composing = useRef(false)
  const [draggedNodeId, setDraggedNodeId] = useState<string>()
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const focus = state.status === 'ready' ? state.focus : undefined

  useLayoutEffect(() => {
    if (focus === undefined) return
    const input = inputs.current.get(focus.nodeId)
    if (input === undefined) return
    input.focus()
    const cursor = Math.min(focus.cursor, input.value.length)
    input.setSelectionRange(cursor, cursor)
  }, [focus])

  if (state.status === 'loading') return <main className="app-shell"><p>Loading document…</p></main>
  if (state.status === 'error') {
    return <main className="app-shell error-state" role="alert"><h1>Tree could not open this document</h1><p>{state.message}</p><p>The existing data was left unchanged.</p></main>
  }

  const currentParent = state.location.currentParentId === null ? undefined : findNode(state.document.roots, state.location.currentParentId)
  const nodes = currentParent?.children ?? state.document.roots
  const setInput = (id: string) => (input: HTMLInputElement | null): void => {
    if (input === null) inputs.current.delete(id)
    else inputs.current.set(id, input)
  }
  const onChange = (nodeId: string) => (event: ChangeEvent<HTMLInputElement>): void => {
    store.editText(nodeId, event.currentTarget.value)
  }
  const onFocus = (nodeId: string) => (event: FocusEvent<HTMLInputElement>): void => {
    if (state.location.selectedNodeId !== nodeId) store.selectNode(nodeId, event.currentTarget.selectionStart ?? 0)
  }
  const onSelect = (event: SyntheticEvent<HTMLInputElement>): void => {
    if (event.currentTarget.selectionStart !== event.currentTarget.selectionEnd) store.endTextSession()
  }
  const onKeyDown = (node: TreeNode) => (event: KeyboardEvent<HTMLInputElement>): void => {
    if (composing.current) return
    const cursor = event.currentTarget.selectionStart ?? 0
    if (event.metaKey && event.key === '.') { event.preventDefault(); store.enter() }
    else if (event.metaKey && event.key === ',') { event.preventDefault(); store.leave() }
    else if (event.metaKey && event.key === 'Backspace') { event.preventDefault(); store.deleteSelected() }
    else if (event.metaKey && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo() }
    else if (event.metaKey && event.key === '0') event.preventDefault()
    else if (event.metaKey && event.key === 'Enter') { event.preventDefault(); if (node.attachment !== undefined) setPreviewAttachmentId(node.attachment.id) }
    else if (event.key === 'Backspace' && node.text === '') { event.preventDefault(); store.deleteEmptySelected() }
    else if (event.key === 'Enter') { event.preventDefault(); store.createSiblingOrFirstChild(cursor) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); store.moveSelection('up', cursor) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); store.moveSelection('down', cursor) }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End' || event.key === 'PageUp' || event.key === 'PageDown') store.endTextSession()
  }
  const onPaste = (nodeId: string) => (event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault()
    void store.paste(nodeId, event.currentTarget.selectionStart ?? 0).catch(() => undefined)
  }
  const onDragOver = (event: DragEvent<HTMLElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const onDrop = (insertionIndex: number) => (event: DragEvent<HTMLDivElement>): void => {
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
  const onRowDrop = (index: number) => (event: DragEvent<HTMLDivElement>): void => {
    onDrop(rowInsertionIndex(index, event))(event)
  }
  const input = (node: TreeNode, label: string, parent = false): React.JSX.Element => (
    <input
      ref={setInput(node.id)} aria-label={label} className={parent ? 'node-input current-parent-input' : 'node-input'} value={node.text}
      onBlur={() => store.endTextSession()} onChange={onChange(node.id)} onCompositionEnd={() => { composing.current = false }}
      onCompositionStart={() => { composing.current = true }} onCut={() => store.markNextTextEditStandalone()} onFocus={onFocus(node.id)}
      onKeyDown={onKeyDown(node)} onMouseDown={() => store.endTextSession()} onPaste={onPaste(node.id)} onSelect={onSelect} spellCheck
    />
  )

  const path = state.location.currentParentId === null ? [] : nodePath(state.document, state.location.currentParentId)

  return (
    <main className="tree-app">
      <header className="location-bar" aria-label="Current location">
        <button aria-label="Top level" className="location-root" onClick={() => store.navigateToAncestor(null)} type="button"><OutlineRootIcon /></button>
        {path.map((node) => (
          <span className="location-segment" key={node.id}>
            <span className="location-separator">›</span>
            {node.id === state.location.currentParentId ? <span>{node.text}</span> : (
              <button className="location-link" onClick={() => store.navigateToAncestor(node.id)} type="button">{node.text}</button>
            )}
          </span>
        ))}
      </header>
      <section className="editor-shell">
      {currentParent === undefined ? null : (
        <section className="current-parent" aria-label="Current parent">
          {input(currentParent, 'Current parent', true)}
          {currentParent.attachment === undefined ? null : <AttachmentImage attachmentId={currentParent.attachment.id} onOpen={setPreviewAttachmentId} />}
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
            {node.attachment === undefined ? null : <AttachmentImage attachmentId={node.attachment.id} onOpen={setPreviewAttachmentId} />}
          </div>
        ))}
        <DropZone end index={nodes.length} onDrop={onDrop} />
      </section>
      {state.saveError === undefined ? null : <p className="save-error" role="status">Changes could not be saved: {state.saveError}</p>}
      </section>
      {previewAttachmentId === undefined ? null : <ImagePreview attachmentId={previewAttachmentId} onClose={() => setPreviewAttachmentId(undefined)} />}
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

function DropZone({ end = false, index, onDrop, start = false }: { end?: boolean; index: number; onDrop: (index: number) => (event: DragEvent<HTMLDivElement>) => void; start?: boolean }): React.JSX.Element {
  return <div className={`drop-zone${start ? ' drop-zone-start' : ''}${end ? ' drop-zone-end' : ''}`} aria-label={`Drop position ${index + 1}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={onDrop(index)} />
}

function AttachmentImage({ attachmentId, onOpen }: { attachmentId: string; onOpen: (attachmentId: string) => void }): React.JSX.Element | null {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void readAttachment(attachmentId).then((bytes) => {
      if (disposed || bytes === null) return
      objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
      setUrl(objectUrl)
    }).catch(() => undefined)
    return () => {
      disposed = true
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId])
  if (url === undefined) return null
  return (
    <button aria-label="Open image preview" className="attachment-button" onClick={() => onOpen(attachmentId)} type="button">
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
    void readAttachment(attachmentId).then((bytes) => {
      if (disposed || bytes === null) return
      objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
      setUrl(objectUrl)
    }).catch(() => undefined)
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
        <button ref={closeButton} aria-label="Close image preview" className="image-preview-close" onClick={onClose} type="button">×</button>
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
