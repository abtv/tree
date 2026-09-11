import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { ChangeEvent, ClipboardEvent, FocusEvent, KeyboardEvent } from 'react'
import { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'

interface AppProps {
  store: EditorStore
}

export function App({ store }: AppProps): React.JSX.Element {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const skipSelectionBoundary = useRef(false)
  const composing = useRef(false)
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
    skipSelectionBoundary.current = true
    store.editText(nodeId, event.currentTarget.value)
    queueMicrotask(() => { skipSelectionBoundary.current = false })
  }
  const onFocus = (nodeId: string) => (event: FocusEvent<HTMLInputElement>): void => {
    if (state.location.selectedNodeId !== nodeId) store.selectNode(nodeId, event.currentTarget.selectionStart ?? 0)
  }
  const onSelect = (): void => { if (!skipSelectionBoundary.current) store.endTextSession() }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (composing.current) return
    const cursor = event.currentTarget.selectionStart ?? 0
    if (event.metaKey && event.key === '.') { event.preventDefault(); store.enter() }
    else if (event.metaKey && event.key === ',') { event.preventDefault(); store.leave() }
    else if (event.metaKey && event.key === 'Backspace') { event.preventDefault(); store.deleteSelected() }
    else if (event.metaKey && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo() }
    else if (event.metaKey && event.key === '0') event.preventDefault()
    else if (event.key === 'Enter') { event.preventDefault(); store.createSiblingOrFirstChild(cursor) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); store.moveSelection('up', cursor) }
    else if (event.key === 'ArrowDown') { event.preventDefault(); store.moveSelection('down', cursor) }
  }
  const onPaste = (nodeId: string) => (event: ClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault()
    void store.paste(nodeId, event.currentTarget.selectionStart ?? 0).catch(() => undefined)
  }
  const input = (node: TreeNode, label: string, parent = false): React.JSX.Element => (
    <input
      ref={setInput(node.id)} aria-label={label} className={parent ? 'node-input current-parent-input' : 'node-input'} value={node.text}
      onBlur={() => store.endTextSession()} onChange={onChange(node.id)} onCompositionEnd={() => { composing.current = false }}
      onCompositionStart={() => { composing.current = true }} onCut={() => store.markNextTextEditStandalone()} onFocus={onFocus(node.id)}
      onKeyDown={onKeyDown} onPaste={onPaste(node.id)} onSelect={onSelect} spellCheck
    />
  )

  return (
    <main className="editor-shell">
      {currentParent === undefined ? null : <section className="current-parent" aria-label="Current parent">{input(currentParent, 'Current parent', true)}</section>}
      <section className="node-list" aria-label="Nodes">
        {nodes.map((node, index) => <div className="node-row" key={node.id}>{input(node, `Node ${index + 1}`)}</div>)}
      </section>
      {state.saveError === undefined ? null : <p className="save-error" role="status">Changes could not be saved: {state.saveError}</p>}
    </main>
  )
}

function findNode(nodes: TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node
    const nested = findNode(node.children, id)
    if (nested !== undefined) return nested
  }
  return undefined
}
