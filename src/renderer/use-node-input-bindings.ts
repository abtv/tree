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
  setNormalCaret,
  updateSelectedLinks,
} from './editor-dom'
import { createEditorKeyDownHandler, executeEditorContextMenuCommand } from './editor-input-handlers'
import type { VimPendingCommand, VimRegister, VimTextChange, VimViewportMotion } from './editor-input-handlers'
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
  const latestVimMode = useRef(vimMode)
  const [composing, setComposing] = useState(false)
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()
  const vimRegister = useRef<VimRegister>({ kind: 'empty' })
  const vimPending = useRef<VimPendingCommand | undefined>(undefined)
  const vimLastChange = useRef<VimTextChange | undefined>(undefined)
  const vimInsertSession = useRef<{ baseline: string; position: number; change: VimTextChange } | undefined>(undefined)
  const vimVisualAnchor = useRef<number | undefined>(undefined)
  const vimVisualFocus = useRef<number | undefined>(undefined)

  const moveVimViewport = useCallback(
    (nodeId: string, motion: VimViewportMotion, cursor: number): void => {
      const visibleRows = Array.from(document.querySelectorAll<HTMLElement>('.node-row')).filter((row) => {
        const bounds = row.getBoundingClientRect()
        return bounds.top < globalThis.innerHeight && bounds.bottom > 0
      })
      if (visibleRows.length === 0) return
      const currentIndex = visibleRows.findIndex((row) => row.dataset.nodeId === nodeId)
      const baseIndex = currentIndex < 0 ? (motion === 'half-up' ? visibleRows.length - 1 : 0) : currentIndex
      const targetIndex =
        motion === 'top'
          ? 0
          : motion === 'middle'
            ? Math.floor((visibleRows.length - 1) / 2)
            : motion === 'bottom'
              ? visibleRows.length - 1
              : Math.max(
                  0,
                  Math.min(
                    visibleRows.length - 1,
                    baseIndex + (motion === 'half-down' ? 1 : -1) * Math.max(1, Math.floor(visibleRows.length / 2)),
                  ),
                )
      const targetId = visibleRows[targetIndex]?.dataset.nodeId
      if (targetId !== undefined) store.selectNode(targetId, cursor)
    },
    [store],
  )

  useLayoutEffect(() => {
    latestFocus.current = focus
  }, [focus])

  useLayoutEffect(() => {
    latestVimMode.current = vimMode
  }, [vimMode])

  useLayoutEffect(() => {
    const focusedInput = focus === undefined ? undefined : inputs.current.get(focus.nodeId)
    if (focusedInput === undefined) return
    if (vimMode === 'normal') {
      setNormalCaret(focusedInput, getCaret(focusedInput))
    } else if (vimMode === 'insert') setCaret(focusedInput, getCaret(focusedInput))
  }, [focus, vimMode])

  useLayoutEffect(() => {
    if (focus === undefined) return
    const applyFocus = (): void => {
      const input = inputs.current.get(focus.nodeId)
      if (input === undefined) return
      input.focus()
      if (latestVimMode.current === 'normal') {
        const normalCursor = Math.min(Math.max(focus.cursor, 0), Math.max(0, nodeTextLength(input) - 1))
        if (
          !(input instanceof HTMLTextAreaElement) ||
          input.selectionStart !== normalCursor ||
          input.selectionEnd !== (input.value.length === 0 ? 0 : normalCursor + 1)
        ) {
          setNormalCaret(input, focus.cursor)
        }
      } else if (input instanceof HTMLTextAreaElement) input.setSelectionRange(focus.cursor, focus.cursor)
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
    if (vimMode === 'normal') {
      setNormalCaret(pending.input, pending.cursor)
    } else setCaret(pending.input, pending.cursor)
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
        vimPending.current = undefined
        vimInsertSession.current = undefined
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
        vimPending.current = undefined
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
          lastChange: vimLastChange,
          beginInsert: (_nodeId, baseline, position, change) => {
            vimInsertSession.current = { baseline, position, change }
          },
          finishInsert: (input) => {
            const session = vimInsertSession.current
            vimInsertSession.current = undefined
            if (session === undefined) return
            const finalText = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
            const { baseline, position, change } = session
            let prefix = 0
            while (prefix < baseline.length && prefix < finalText.length && baseline[prefix] === finalText[prefix])
              prefix += 1
            let suffix = 0
            while (
              suffix < baseline.length - prefix &&
              suffix < finalText.length - prefix &&
              baseline[baseline.length - 1 - suffix] === finalText[finalText.length - 1 - suffix]
            )
              suffix += 1
            const insertedText = finalText.slice(prefix, finalText.length - suffix)
            if (change.kind === 'insert' && finalText === baseline) return
            if (change.kind === 'insert' || change.kind === 'change' || change.kind === 'substitute') {
              vimLastChange.current = {
                ...change,
                insertedText,
                insertOffset: prefix - position,
                deleteCount: baseline.length - prefix - suffix,
              }
            }
          },
          visualAnchor: vimVisualAnchor,
          visualFocus: vimVisualFocus,
          moveBoundary: (boundary, cursor) => store.moveSelectionBoundary(boundary, cursor),
          moveViewport: moveVimViewport,
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
        vimInsertSession.current = undefined
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
        if (vimMode === 'normal') return
        const target = event.currentTarget
        if (target instanceof HTMLTextAreaElement) {
          if (target.selectionStart !== target.selectionEnd) store.endTextSession()
        } else if (!isCollapsedSelection()) store.endTextSession()
      },
    }),
    [
      composing,
      moveVimViewport,
      onPreviewAttachment,
      persistenceLocked,
      selectAllNodeId,
      selectedNodeId,
      setVimMode,
      store,
      vimMode,
    ],
  )
}

function nodeTextLength(input: HTMLElement): number {
  return input instanceof HTMLTextAreaElement ? input.value.length : (input.textContent?.length ?? 0)
}
