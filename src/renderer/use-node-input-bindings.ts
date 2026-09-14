import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent, FormEvent, SyntheticEvent } from 'react'
import type { EditorStore, FocusIntent } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { getCaret, isCollapsedSelection, readEditableContent, setCaret, updateSelectedLinks } from './editor-dom'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import type { NodeInputBindings } from './NodeInput'

interface UseNodeInputBindingsOptions {
  store: EditorStore
  selectedNodeId?: string | undefined
  focus?: FocusIntent | undefined
  onPreviewAttachment: (attachmentId: string) => void
}

export function useNodeInputBindings({
  store,
  selectedNodeId,
  focus,
  onPreviewAttachment,
}: UseNodeInputBindingsOptions): (node: TreeNode) => NodeInputBindings {
  const inputs = useRef(new Map<string, HTMLElement>())
  const pendingCaret = useRef<{ input: HTMLElement; cursor: number } | undefined>(undefined)
  const latestFocus = useRef<FocusIntent | undefined>(focus)
  const [composing, setComposing] = useState(false)
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()

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

  useEffect(() => {
    const update = (): void => {
      for (const input of inputs.current.values()) {
        if (!(input instanceof HTMLTextAreaElement)) updateSelectedLinks(input)
      }
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  return useCallback(
    (node: TreeNode): NodeInputBindings => ({
      selectedAll: selectAllNodeId === node.id,
      inputRef: (input: HTMLElement | null) => {
        if (input === null) inputs.current.delete(node.id)
        else inputs.current.set(node.id, input)
      },
      onBlur: () => {
        setSelectAllNodeId(undefined)
        store.endTextSession()
      },
      onTextChange: (event) => store.editText(node.id, event.currentTarget.value),
      onContentInput: (event: FormEvent<HTMLElement>) => {
        const cursor = getCaret(event.currentTarget)
        const content = readEditableContent(event.currentTarget)
        pendingCaret.current = { input: event.currentTarget, cursor }
        store.editContent(node.id, content.text, content.links)
      },
      onContentChange: (event: FormEvent<HTMLElement>) => {
        store.editContent(node.id, event.currentTarget.textContent ?? '', node.links ?? [])
      },
      onCompositionEnd: () => {
        setComposing(false)
      },
      onCompositionStart: () => {
        setComposing(true)
      },
      onCut: () => store.markNextTextEditStandalone(),
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (selectedNodeId !== node.id) store.selectNode(node.id, getCaret(event.currentTarget))
      },
      onKeyDown: createEditorKeyDownHandler({
        store,
        node,
        isComposing: () => composing,
        setSelectAllNodeId,
        onPreviewAttachment,
      }),
      onMouseDown: () => {
        setSelectAllNodeId(undefined)
        inputs.current.get(node.id)?.classList.remove('select-all')
        store.endTextSession()
      },
      onPaste: (event: ClipboardEvent<HTMLElement>) => {
        setSelectAllNodeId(undefined)
        event.preventDefault()
        void store.paste(node.id, getCaret(event.currentTarget)).catch((error: unknown) => store.reportError(error))
      },
      onSelect: (event: SyntheticEvent<HTMLElement>) => {
        const target = event.currentTarget
        if (target instanceof HTMLTextAreaElement) {
          if (target.selectionStart !== target.selectionEnd) store.endTextSession()
        } else if (!isCollapsedSelection()) store.endTextSession()
      },
    }),
    [composing, onPreviewAttachment, selectAllNodeId, selectedNodeId, store],
  )
}
