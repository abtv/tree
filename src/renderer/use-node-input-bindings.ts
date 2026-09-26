import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent, FormEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore, FocusIntent, NodeVisualCommand } from '../application/editor-store'
import { cloneNode, displayedNodes, reconcileLinkTextEdit, type LinkRange, type TreeNode } from '../domain/document'
import {
  clearNormalCaret,
  getCaret,
  getSelectionRange,
  isCollapsedSelection,
  readEditableContent,
  setCaret,
  setNormalCaret,
  updateSelectedLinks,
} from './editor-dom'
import { createEditorKeyDownHandler, executeEditorContextMenuCommand } from './editor-input-handlers'
import type {
  VimFindCommand,
  VimPendingCommand,
  VimRegister,
  VimTextChange,
  VimRepeatChange,
  VimStructuralChange,
  VimViewportMotion,
} from './vim-keyboard-types'
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
  nodeVisualSelection?: { anchorId: string; focusId: string } | undefined
  setNodeVisualSelection?: (selection: { anchorId: string; focusId: string } | undefined) => void
  onPointerDown?: () => void
}

export function useNodeInputBindings({
  store,
  selectedNodeId,
  focus,
  onPreviewAttachment,
  persistenceLocked = false,
  vimMode = 'insert',
  setVimMode = () => undefined,
  nodeVisualSelection,
  setNodeVisualSelection = () => undefined,
  onPointerDown = () => undefined,
}: UseNodeInputBindingsOptions): (node: TreeNode) => NodeInputBindings {
  const inputs = useRef(new Map<string, HTMLElement>())
  const normalCaretResizeObserver = useRef<ResizeObserver | undefined>(undefined)
  const pendingCaret = useRef<{ input: HTMLElement; cursor: number } | undefined>(undefined)
  const pendingLinkDraft = useRef<{ nodeId: string; range: LinkRange } | undefined>(undefined)
  const latestFocus = useRef<FocusIntent | undefined>(focus)
  const latestVimMode = useRef(vimMode)
  const [composing, setComposing] = useState(false)
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()
  const vimRegister = useRef<VimRegister>({ kind: 'empty' })
  const vimPending = useRef<VimPendingCommand | undefined>(undefined)
  const vimLastChange = useRef<VimRepeatChange | undefined>(undefined)
  const vimLastFind = useRef<VimFindCommand | undefined>(undefined)
  const vimInsertSession = useRef<{ baseline: string; position: number; change: VimTextChange } | undefined>(undefined)
  const vimReplaceSession = useRef<{ nodeId: string; baseline: string; position: number; typed: string } | undefined>(
    undefined,
  )
  const vimVisualAnchor = useRef<number | undefined>(undefined)
  const vimVisualFocus = useRef<number | undefined>(undefined)
  const structuralInsert = useRef<
    { kind: 'open'; position: 'before' | 'after' } | { kind: 'visual'; command: 'c' | 's'; span: number } | undefined
  >(undefined)

  const finishStructuralInsert = useCallback((input: HTMLElement): void => {
    const session = structuralInsert.current
    structuralInsert.current = undefined
    if (session === undefined) return
    const text = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
    vimLastChange.current =
      session.kind === 'open'
        ? { kind: 'structural-open', position: session.position, text }
        : { kind: 'structural-visual', command: session.command, span: session.span, text }
  }, [])

  const moveNodeVisual = useCallback(
    (direction: 'up' | 'down' | 'first' | 'last'): void => {
      const state = store.getSnapshot()
      if (state.status !== 'ready' || nodeVisualSelection === undefined) return
      const nodes = displayedNodes(state.document, state.location.currentParentId)
      const index = nodes.findIndex((node) => node.id === nodeVisualSelection.focusId)
      if (index < 0 || nodes.length === 0) return
      const targetIndex =
        direction === 'first'
          ? 0
          : direction === 'last'
            ? nodes.length - 1
            : Math.max(0, Math.min(nodes.length - 1, index + (direction === 'down' ? 1 : -1)))
      const target = nodes[targetIndex]
      if (target === undefined) return
      setNodeVisualSelection({ ...nodeVisualSelection, focusId: target.id })
      store.selectNode(target.id, 0)
    },
    [store, nodeVisualSelection, setNodeVisualSelection],
  )

  const commandNodeVisual = useCallback(
    (command: NodeVisualCommand): void => {
      if (nodeVisualSelection === undefined) return
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      const nodes = displayedNodes(state.document, state.location.currentParentId)
      const anchor = nodes.findIndex((node) => node.id === nodeVisualSelection.anchorId)
      const focus = nodes.findIndex((node) => node.id === nodeVisualSelection.focusId)
      if (anchor < 0 || focus < 0) return
      const span = Math.abs(anchor - focus) + 1
      const register = vimRegister.current
      const source =
        register.kind === 'nodes'
          ? register.value
          : register.kind === 'node'
            ? { nodes: [register.value], sourceIds: register.sourceIds ?? [] }
            : undefined
      const result = store.applyNodeVisual(command, nodeVisualSelection.anchorId, nodeVisualSelection.focusId, source)
      if (result === undefined) return
      if ('ydxcs'.includes(command)) vimRegister.current = { kind: 'nodes', value: result }
      if (command === 'c' || command === 's') {
        structuralInsert.current = { kind: 'visual', command, span }
        setVimMode('insert')
      } else {
        if (command !== 'y')
          vimLastChange.current = {
            kind: 'structural-visual',
            command,
            span,
            ...(source === undefined ? {} : { source }),
          }
        setVimMode('normal')
      }
      setNodeVisualSelection(undefined)
    },
    [store, nodeVisualSelection, setNodeVisualSelection, setVimMode],
  )

  const repeatStructural = useCallback(
    (change: VimStructuralChange): void => {
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      if (change.kind === 'structural-delete') {
        const selected = displayedNodes(state.document, state.location.currentParentId).find(
          (node) => node.id === state.location.selectedNodeId,
        )
        if (selected !== undefined)
          vimRegister.current = { kind: 'node', value: cloneNode(selected), sourceIds: [selected.id] }
        store.deleteSelected()
      } else if (change.kind === 'structural-open') store.createSiblingWithText(change.position, change.text)
      else if (change.kind === 'structural-put')
        store.pasteSubtree(state.location.selectedNodeId, change.position, change.source, change.sourceIds)
      else if (change.kind === 'structural-forest-put')
        store.pasteNodeForest(state.location.selectedNodeId, change.position, change.source)
      else {
        const nodes = displayedNodes(state.document, state.location.currentParentId)
        const start = nodes.findIndex((node) => node.id === state.location.selectedNodeId)
        const end = nodes[start + change.span - 1]
        if (start < 0 || end === undefined) return
        const result = store.applyNodeVisual(change.command, nodes[start]!.id, end.id, change.source, change.text)
        if (result !== undefined && 'dxcs'.includes(change.command))
          vimRegister.current = { kind: 'nodes', value: result }
      }
    },
    [store],
  )

  const finishVimReplace = useCallback(
    (input?: HTMLElement): boolean => {
      const session = vimReplaceSession.current
      vimReplaceSession.current = undefined
      if (session === undefined || session.typed === '') return false
      const replaced = Math.min(session.typed.length, session.baseline.length - session.position)
      const finalText =
        session.baseline.slice(0, session.position) +
        session.typed +
        session.baseline.slice(session.position + replaced)
      store.replaceTextRange(session.nodeId, session.position, session.position + replaced, session.typed)
      vimLastChange.current = { kind: 'overwrite', text: session.typed, replaced }
      if (input !== undefined) setEditableText(input, finalText)
      return true
    },
    [store],
  )

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
    } else if (vimMode === 'insert' || vimMode === 'replace') setCaret(focusedInput, getCaret(focusedInput))
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

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const input = entry.target as HTMLElement
        if (input.ownerDocument.activeElement !== input || latestVimMode.current !== 'normal') continue
        setNormalCaret(input, getCaret(input))
      }
    })
    normalCaretResizeObserver.current = observer
    for (const input of inputs.current.values()) observer.observe(input)
    return () => {
      observer.disconnect()
      normalCaretResizeObserver.current = undefined
    }
  }, [])

  return useCallback(
    (node: TreeNode): NodeInputBindings => ({
      selectedAll: selectAllNodeId === node.id,
      disabled: persistenceLocked,
      inputRef: (input: HTMLElement | null) => {
        if (input === null) {
          const previous = inputs.current.get(node.id)
          if (previous !== undefined) normalCaretResizeObserver.current?.unobserve(previous)
          inputs.current.delete(node.id)
        } else {
          inputs.current.set(node.id, input)
          normalCaretResizeObserver.current?.observe(input)
        }
      },
      onBlur: () => {
        const input = inputs.current.get(node.id)
        if (input !== undefined) clearNormalCaret(input)
        setSelectAllNodeId(undefined)
        vimPending.current = undefined
        vimInsertSession.current = undefined
        finishVimReplace()
        if (latestVimMode.current === 'replace') setVimMode('normal')
        store.endTextSession()
      },
      onTextChange: (event) => store.editText(node.id, event.currentTarget.value),
      onContentInput: (event: FormEvent<HTMLElement>) => {
        const cursor = getCaret(event.currentTarget)
        const content = readEditableContent(event.currentTarget)
        pendingCaret.current = { input: event.currentTarget, cursor }
        const draft =
          pendingLinkDraft.current?.nodeId === node.id &&
          node.text.slice(pendingLinkDraft.current.range.start, pendingLinkDraft.current.range.end) ===
            pendingLinkDraft.current.range.url
            ? pendingLinkDraft.current.range
            : undefined
        const edit = reconcileLinkTextEdit(node.text, node.links ?? [], content.text, draft)
        pendingLinkDraft.current = edit.draft === undefined ? undefined : { nodeId: node.id, range: edit.draft }
        store.editContent(node.id, content.text, edit.links, edit.createsNewLink)
      },
      onContentChange: (event: FormEvent<HTMLElement>) => {
        const text = event.currentTarget.textContent ?? ''
        const draft =
          pendingLinkDraft.current?.nodeId === node.id &&
          node.text.slice(pendingLinkDraft.current.range.start, pendingLinkDraft.current.range.end) ===
            pendingLinkDraft.current.range.url
            ? pendingLinkDraft.current.range
            : undefined
        const edit = reconcileLinkTextEdit(node.text, node.links ?? [], text, draft)
        pendingLinkDraft.current = edit.draft === undefined ? undefined : { nodeId: node.id, range: edit.draft }
        store.editContent(node.id, text, edit.links, edit.createsNewLink)
      },
      onCompositionEnd: (event) => {
        setComposing(false)
        if (latestVimMode.current === 'replace') {
          const baseline =
            event.currentTarget instanceof HTMLTextAreaElement
              ? event.currentTarget.value
              : readEditableContent(event.currentTarget).text
          vimReplaceSession.current = {
            nodeId: node.id,
            baseline,
            position: getCaret(event.currentTarget),
            typed: '',
          }
        }
      },
      onCompositionStart: () => {
        vimPending.current = undefined
        finishVimReplace()
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
      onClick: (event: MouseEvent<HTMLElement>) => {
        const target = event.target
        const link = target instanceof Element ? target.closest('a[href]') : null
        if (link === null || !event.currentTarget.contains(link)) return
        event.preventDefault()
        if (event.metaKey) window.open(link.getAttribute('href') ?? '', '_blank')
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
          lastFind: vimLastFind,
          beginInsert: (_nodeId, baseline, position, change) => {
            vimInsertSession.current = { baseline, position, change }
          },
          finishInsert: (input) => {
            finishStructuralInsert(input)
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
          beginReplace: (nodeId, _input, baseline, position) => {
            vimReplaceSession.current = { nodeId, baseline, position, typed: '' }
          },
          handleReplaceKey: (input, key) => {
            const session = vimReplaceSession.current
            if (session === undefined) return false
            if (key === 'Backspace') session.typed = session.typed.slice(0, -1)
            else if (key.length === 1) session.typed += key
            else return false
            const replaced = Math.min(session.typed.length, session.baseline.length - session.position)
            const working =
              session.baseline.slice(0, session.position) +
              session.typed +
              session.baseline.slice(session.position + replaced)
            setEditableText(input, working)
            setCaret(input, session.position + session.typed.length)
            return true
          },
          finishReplace: (input) => {
            return finishVimReplace(input)
          },
          visualAnchor: vimVisualAnchor,
          visualFocus: vimVisualFocus,
          moveBoundary: (boundary, cursor) => store.moveSelectionBoundary(boundary, cursor),
          moveViewport: moveVimViewport,
          setMode: setVimMode,
          scheduleCaret: (input, cursor) => {
            pendingCaret.current = { input, cursor }
          },
          nodeVisual: {
            enter: (nodeId) => {
              const state = store.getSnapshot()
              if (state.status !== 'ready' || state.location.currentParentId === nodeId) return false
              setNodeVisualSelection({ anchorId: nodeId, focusId: nodeId })
              return true
            },
            move: moveNodeVisual,
            swap: () => {
              if (nodeVisualSelection !== undefined)
                setNodeVisualSelection({ anchorId: nodeVisualSelection.focusId, focusId: nodeVisualSelection.anchorId })
            },
            exit: () => setNodeVisualSelection(undefined),
            command: commandNodeVisual,
          },
          beginStructuralOpen: (position) => {
            structuralInsert.current = { kind: 'open', position }
          },
          repeatStructural,
        },
      }),
      onMouseDown: (event: MouseEvent<HTMLElement>) => {
        onPointerDown()
        if (event.button === 2) event.preventDefault()
        setSelectAllNodeId(undefined)
        inputs.current.get(node.id)?.classList.remove('select-all')
        store.endTextSession()
        vimPending.current = undefined
        vimInsertSession.current = undefined
        finishVimReplace(event.currentTarget)
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
      commandNodeVisual,
      finishVimReplace,
      finishStructuralInsert,
      moveVimViewport,
      moveNodeVisual,
      onPreviewAttachment,
      persistenceLocked,
      selectAllNodeId,
      selectedNodeId,
      repeatStructural,
      nodeVisualSelection,
      onPointerDown,
      setNodeVisualSelection,
      setVimMode,
      store,
      vimMode,
    ],
  )
}

function nodeTextLength(input: HTMLElement): number {
  return input instanceof HTMLTextAreaElement ? input.value.length : (input.textContent?.length ?? 0)
}

function setEditableText(input: HTMLElement, text: string): void {
  if (input instanceof HTMLTextAreaElement) input.value = text
  else input.textContent = text
}
