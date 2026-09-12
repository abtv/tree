import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ClipboardEvent, FocusEvent, FormEvent, SyntheticEvent } from 'react'
import { EditorStore } from '../application/editor-store'
import { nodePath, type TreeNode } from '../domain/document'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'
import { getCaret, isCollapsedSelection, readEditableContent, setCaret } from './editor-dom'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { LocationBar } from './LocationBar'
import { NodeInput } from './NodeInput'
import { NodeList } from './NodeList'

interface AppProps {
  store: EditorStore
}

export function App({ store }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const inputs = useRef(new Map<string, HTMLElement>())
  const pendingCaret = useRef<{ input: HTMLElement; cursor: number } | undefined>(undefined)
  const [composing, setComposing] = useState(false)
  const [previewAttachmentId, setPreviewAttachmentId] = useState<string>()
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()
  const focus = state.status === 'ready' ? state.focus : undefined
  const latestFocus = useRef<typeof focus>(undefined)

  useLayoutEffect(() => {
    latestFocus.current = focus
  }, [focus])

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
  const clearSelectedInput = (id: string): void => {
    inputs.current.get(id)?.classList.remove('select-all')
  }
  const isComposing = (): boolean => composing

  const currentParent =
    state.location.currentParentId === null ? undefined : findNode(state.document.roots, state.location.currentParentId)
  const nodes = currentParent?.children ?? state.document.roots
  const onInput =
    (node: TreeNode) =>
    (event: FormEvent<HTMLElement>): void => {
      const cursor = getCaret(event.currentTarget)
      const content = readEditableContent(event.currentTarget)
      pendingCaret.current = { input: event.currentTarget, cursor }
      store.editContent(node.id, content.text, content.links)
    }
  const onChange =
    (node: TreeNode) =>
    (event: FormEvent<HTMLElement>): void => {
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
  const onPaste =
    (nodeId: string) =>
    (event: ClipboardEvent<HTMLElement>): void => {
      event.preventDefault()
      void store.paste(nodeId, getCaret(event.currentTarget)).catch((error: unknown) => store.reportError(error))
    }
  const input = (node: TreeNode, label: string, parent = false): React.JSX.Element => (
    <NodeInput
      node={node}
      label={label}
      parent={parent}
      selectedAll={selectAllNodeId === node.id}
      inputRef={setInput(node.id)}
      onBlur={() => {
        setSelectAllNodeId(undefined)
        store.endTextSession()
      }}
      onTextChange={(event) => store.editText(node.id, event.currentTarget.value)}
      onContentInput={onInput(node)}
      onContentChange={onChange(node)}
      onCompositionEnd={() => {
        setComposing(false)
      }}
      onCompositionStart={() => {
        setComposing(true)
      }}
      onCut={() => store.markNextTextEditStandalone()}
      onFocus={onFocus(node.id)}
      onKeyDown={createEditorKeyDownHandler({
        store,
        node,
        isComposing,
        setSelectAllNodeId,
        onPreviewAttachment: setPreviewAttachmentId,
      })}
      onMouseDown={() => {
        setSelectAllNodeId(undefined)
        clearSelectedInput(node.id)
        store.endTextSession()
      }}
      onPaste={(event) => {
        setSelectAllNodeId(undefined)
        onPaste(node.id)(event)
      }}
      onSelect={onSelect}
    />
  )

  const path = state.location.currentParentId === null ? [] : nodePath(state.document, state.location.currentParentId)

  return (
    <main className="tree-app">
      <LocationBar
        path={path}
        currentParentId={state.location.currentParentId}
        onNavigate={(parentId) => store.navigateToAncestor(parentId)}
      />
      <section className="editor-shell">
        {currentParent === undefined ? null : (
          <section className="current-parent" aria-label="Current parent">
            {input(currentParent, 'Current parent', true)}
            {currentParent.attachment === undefined ? null : (
              <AttachmentImage attachmentId={currentParent.attachment.id} onOpen={setPreviewAttachmentId} />
            )}
          </section>
        )}
        <NodeList
          nodes={nodes}
          onEnter={(node) => {
            store.selectNode(node.id, 0)
            store.enter()
          }}
          onMove={(nodeId, insertionIndex) => store.moveNodeTo(nodeId, insertionIndex)}
          renderInput={(node, label) => (
            <>
              {input(node, label)}
              {node.attachment === undefined ? null : (
                <AttachmentImage attachmentId={node.attachment.id} onOpen={setPreviewAttachmentId} />
              )}
            </>
          )}
        />
        {state.saveError === undefined ? null : (
          <p className="save-error" role="status">
            Changes could not be saved: {state.saveError}
          </p>
        )}
        {state.operationError === undefined ? null : (
          <p className="save-error" role="alert">
            Operation failed: {state.operationError}
          </p>
        )}
      </section>
      {previewAttachmentId === undefined ? null : (
        <ImagePreview attachmentId={previewAttachmentId} onClose={() => setPreviewAttachmentId(undefined)} />
      )}
    </main>
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
