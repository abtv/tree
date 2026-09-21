import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent, FormEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore, FocusIntent } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import {
  getCaret,
  getSelectionRange,
  isCollapsedSelection,
  readEditableContent,
  setCaret,
  updateSelectedLinks,
} from './editor-dom'
import { createEditorKeyDownHandler, executeEditorContextMenuCommand } from './editor-input-handlers'
import type { NodeInputBindings } from './NodeInput'
import type { VimMode } from './vim-editing'

interface UseNodeInputBindingsOptions {
  store: EditorStore
  selectedNodeId?: string | undefined
  focus?: FocusIntent | undefined
  onPreviewAttachment: (attachmentId: string) => void
  persistenceLocked?: boolean
  vimMode?: VimMode
  setVimMode?: (mode: VimMode) => void
}

export function useNodeInputBindings({
  store,
  selectedNodeId,
  focus,
  onPreviewAttachment,
  persistenceLocked = false,
  vimMode = 'insert',
  setVimMode = () => undefined,
}: UseNodeInputBindingsOptions): (node: TreeNode) => NodeInputBindings {
  const inputs = useRef(new Map<string, HTMLElement>())
  const pendingCaret = useRef<{ input: HTMLElement; cursor: number } | undefined>(undefined)
  const latestFocus = useRef<FocusIntent | undefined>(focus)
  const [composing, setComposing] = useState(false)
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()
  const vimRegister = useRef('')
  const vimPending = useRef<string | undefined>(undefined)
  const vimVisualAnchor = useRef<number | undefined>(undefined)
  const vimVisualFocus = useRef<number | undefined>(undefined)

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
      disabled: persistenceLocked,
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
      onContextMenu: (event: MouseEvent<HTMLElement>) => {
        if (persistenceLocked) return
        event.preventDefault()
        const input = event.currentTarget
        const selection = getSelectionRange(input)
        const request = {
          x: event.clientX,
          y: event.clientY,
          selectionText:
            input instanceof HTMLTextAreaElement
              ? input.value.slice(selection.start, selection.end)
              : (getSelection()?.toString() ?? ''),
          canCut: selection.start !== selection.end,
          canCopy: selection.start !== selection.end,
          canPaste: true,
          canSelectAll:
            input.textContent?.length !== 0 || (input instanceof HTMLTextAreaElement && input.value.length !== 0),
        }
        if (window.treeApi.showEditorContextMenu === undefined) return
        void window.treeApi
          .showEditorContextMenu(request)
          .then((command) => executeEditorContextMenuCommand(command, store, node, input))
          .catch((error: unknown) => store.reportError(error))
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
        vim: {
          mode: vimMode,
          register: vimRegister,
          pending: vimPending,
          visualAnchor: vimVisualAnchor,
          visualFocus: vimVisualFocus,
          setMode: setVimMode,
          scheduleCaret: (input, cursor) => {
            pendingCaret.current = { input, cursor }
          },
        },
      }),
      onMouseDown: (event: MouseEvent<HTMLElement>) => {
        if (event.button === 2) event.preventDefault()
        setSelectAllNodeId(undefined)
        inputs.current.get(node.id)?.classList.remove('select-all')
        store.endTextSession()
        vimPending.current = undefined
        vimVisualAnchor.current = undefined
        vimVisualFocus.current = undefined
        setVimMode('insert')
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
    [composing, onPreviewAttachment, persistenceLocked, selectAllNodeId, selectedNodeId, setVimMode, store, vimMode],
  )
}
