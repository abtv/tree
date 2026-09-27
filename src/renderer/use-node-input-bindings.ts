import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent, FormEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore, FocusIntent, NodeVisualCommand } from '../application/editor-store'
import {
  cloneNode,
  displayedNodes,
  reconcileLinkTextEdit,
  requireNode,
  type LinkRange,
  type TreeNode,
} from '../domain/document'
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
import {
  editCaretTransition,
  focusCaretTransition,
  pointerCaretTransition,
  type VimCaretState,
} from './vim-caret-transition'
import { diffTypedText, resolveReplaceCommit } from './vim-edit-session'

interface UseNodeInputBindingsOptions {
  store: EditorStore
  selectedNodeId?: string | undefined
  focus?: FocusIntent | undefined
  onPreviewAttachment: (attachmentId: string) => void
  persistenceLocked?: boolean
  vimMode?: VimMode
  setVimMode?: (mode: VimMode) => void
  setImageCaretNodeId?: (nodeId: string | undefined) => void
  nodeVisualSelection?: { anchorId: string; focusId: string } | undefined
  setNodeVisualSelection?: (selection: { anchorId: string; focusId: string } | undefined) => void
}

export function useNodeInputBindings({
  store,
  selectedNodeId,
  focus,
  onPreviewAttachment,
  persistenceLocked = false,
  vimMode = 'insert',
  setVimMode = () => undefined,
  setImageCaretNodeId = () => undefined,
  nodeVisualSelection,
  setNodeVisualSelection = () => undefined,
}: UseNodeInputBindingsOptions): (node: TreeNode) => NodeInputBindings {
  const inputs = useRef(new Map<string, HTMLElement>())
  const normalCaretResizeObserver = useRef<ResizeObserver | undefined>(undefined)
  const pendingCaret = useRef<{ input: HTMLElement; cursor: number } | undefined>(undefined)
  const pendingLinkDraft = useRef<{ nodeId: string; range: LinkRange } | undefined>(undefined)
  const latestFocus = useRef<FocusIntent | undefined>(focus)
  const syncedImageFocusToken = useRef<number | undefined>(focus?.token)
  const latestVimMode = useRef(vimMode)
  const [composing, setComposing] = useState(false)
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()
  const vimRegister = useRef<VimRegister>({ kind: 'empty' })
  const vimPending = useRef<VimPendingCommand | undefined>(undefined)
  const vimLastChange = useRef<VimRepeatChange | undefined>(undefined)
  const vimLastFind = useRef<VimFindCommand | undefined>(undefined)
  const vimInsertSession = useRef<
    { nodeId: string; baseline: string; position: number; change: VimTextChange } | undefined
  >(undefined)
  const vimReplaceSession = useRef<{ nodeId: string; baseline: string; position: number; typed: string } | undefined>(
    undefined,
  )
  const vimVisualAnchor = useRef<number | undefined>(undefined)
  const vimVisualFocus = useRef<number | undefined>(undefined)
  const caretAuthority = useRef<{ nodeId?: string; caret: VimCaretState }>({
    caret: { cursor: focus?.cursor ?? 0, imageActive: false },
  })

  const applyCaretState = useCallback(
    (nodeId: string, caret: VimCaretState, fromFocus = false): void => {
      caretAuthority.current = { nodeId, caret }
      if (fromFocus) {
        const state = store.getSnapshot()
        if (state.status === 'ready') syncedImageFocusToken.current = state.focus?.token
      }
      setImageCaretNodeId(caret.imageActive ? nodeId : undefined)
    },
    [store, setImageCaretNodeId],
  )
  const structuralInsert = useRef<
    | { kind: 'open'; originNodeId: string; position: 'before' | 'after' }
    | { kind: 'child-open'; originNodeId: string }
    | { kind: 'visual'; originNodeId: string; command: 'c' | 's'; span: number }
    | undefined
  >(undefined)

  const finishStructuralInsert = useCallback((input: HTMLElement): void => {
    const session = structuralInsert.current
    structuralInsert.current = undefined
    if (session === undefined) return
    const text = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
    vimLastChange.current =
      session.kind === 'open'
        ? { kind: 'structural-open', position: session.position, text }
        : session.kind === 'child-open'
          ? { kind: 'structural-child-open', text }
          : { kind: 'structural-visual', command: session.command, span: session.span, text }
  }, [])

  const syncImageCaretToFocus = useCallback((): void => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') return
    if (state.focus?.token === syncedImageFocusToken.current) return
    syncedImageFocusToken.current = state.focus?.token
    const target = requireNode(state.document, state.location.selectedNodeId).node
    const next = focusCaretTransition(
      caretAuthority.current.caret,
      state.focus?.cursor ?? 0,
      target.text.length,
      target.attachment !== undefined,
      true,
    )
    applyCaretState(target.id, next)
  }, [store, applyCaretState])

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
      syncImageCaretToFocus()
    },
    [store, nodeVisualSelection, setNodeVisualSelection, syncImageCaretToFocus],
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
        structuralInsert.current = { kind: 'visual', originNodeId: nodeVisualSelection.focusId, command, span }
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
        syncImageCaretToFocus()
      }
      setNodeVisualSelection(undefined)
    },
    [store, nodeVisualSelection, setNodeVisualSelection, setVimMode, syncImageCaretToFocus],
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
      else if (change.kind === 'structural-child-open') store.createChildWithText(change.text)
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
    (input?: HTMLElement, retreatCursor = false): boolean => {
      const session = vimReplaceSession.current
      vimReplaceSession.current = undefined
      if (session === undefined) return false
      const commit = resolveReplaceCommit(session)
      if (commit === undefined) return false
      const { finalText, replacedStart, replacedEnd, rawCursor } = commit
      store.replaceTextRange(session.nodeId, replacedStart, replacedEnd, session.typed)
      vimLastChange.current = { kind: 'overwrite', text: session.typed, replaced: replacedEnd - replacedStart }
      const state = store.getSnapshot()
      const hasAttachment =
        state.status === 'ready' && requireNode(state.document, session.nodeId).node.attachment !== undefined
      const prior =
        caretAuthority.current.nodeId === session.nodeId
          ? caretAuthority.current.caret
          : { cursor: rawCursor, imageActive: false }
      // Escape and Cmd+Z/Cmd+Shift+Z retreat the DOM caret by one after calling this (see
      // editor-input-handlers.ts); every other caller (blur, a same-node pointer click, Cmd+.,
      // Cmd+,, Cmd+Backspace) leaves the caret at the raw typed end. The image-caret decision must
      // match whichever position the caller actually leaves the caret at, so callers say so
      // explicitly rather than this function inferring it from whether `input` was passed.
      const committedCursor = retreatCursor ? Math.max(0, rawCursor - 1) : rawCursor
      const next = editCaretTransition(prior, committedCursor, finalText.length, hasAttachment)
      applyCaretState(session.nodeId, {
        cursor: rawCursor,
        imageActive: next.imageActive,
        imageTextReturnCursor: next.imageTextReturnCursor,
      })
      if (input !== undefined) {
        setEditableText(input, finalText)
        setCaret(input, rawCursor)
      }
      return true
    },
    [store, applyCaretState],
  )

  const finishVimInsert = useCallback(
    // Always captures: a diff-based session can span a node change (e.g. Enter while still in
    // Insert mode) with no reliable way to detect that at finish time across every trigger
    // (keyboard, blur, and mouse-driven navigation that never fires a distinguishing blur target).
    // Safety instead lives at dot-repeat replay time, which checks the stamped `nodeId`.
    (input: HTMLElement): void => {
      finishStructuralInsert(input)
      const session = vimInsertSession.current
      vimInsertSession.current = undefined
      if (session === undefined) return
      const finalText = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
      const { nodeId, baseline, position, change } = session
      if (change.kind === 'insert' && finalText === baseline) return
      if (change.kind === 'insert' || change.kind === 'change' || change.kind === 'substitute') {
        const diff = diffTypedText(baseline, finalText, position)
        vimLastChange.current = { ...change, ...diff, nodeId }
      }
    },
    [finishStructuralInsert],
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
      if (targetId !== undefined) {
        store.selectNode(targetId, cursor)
        syncImageCaretToFocus()
      }
    },
    [store, syncImageCaretToFocus],
  )

  useLayoutEffect(() => {
    latestFocus.current = focus
  }, [focus])

  useLayoutEffect(() => {
    if (focus !== undefined && focus.token !== syncedImageFocusToken.current) syncImageCaretToFocus()
  }, [focus, syncImageCaretToFocus])

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
        setSelectAllNodeId(undefined)
        vimPending.current = undefined
        // A structural session (o/O/whole-node-Visual c/s) begins by creating a new node and
        // immediately moving focus onto it, which blurs *this* node as an incidental side effect
        // before the user has typed anything into the new one. Only finish a structural session
        // from blur once it is a different node's own blur — the one it actually began on.
        const structuralBeganHere = structuralInsert.current?.originNodeId === node.id
        if (input !== undefined && !structuralBeganHere) finishVimInsert(input)
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
        else if (
          latestVimMode.current === 'normal' &&
          node.attachment !== undefined &&
          getCaret(event.currentTarget) === node.text.length
        )
          setNormalCaret(event.currentTarget, node.text.length)
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
          beginInsert: (nodeId, baseline, position, change) => {
            vimInsertSession.current = { nodeId, baseline, position, change }
          },
          finishInsert: finishVimInsert,
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
          finishReplace: (input, retreatCursor) => {
            return finishVimReplace(input, retreatCursor)
          },
          visualAnchor: vimVisualAnchor,
          visualFocus: vimVisualFocus,
          imageTextCursor: {
            get current() {
              return caretAuthority.current.caret.imageTextReturnCursor
            },
            set current(value: number | undefined) {
              caretAuthority.current.caret = { ...caretAuthority.current.caret, imageTextReturnCursor: value }
            },
          },
          getCaretState: (nodeId, cursor, imageActive) =>
            caretAuthority.current.nodeId === nodeId
              ? { ...caretAuthority.current.caret, cursor }
              : { cursor, imageActive, imageTextReturnCursor: undefined },
          applyCaretState,
          moveBoundary: (boundary, cursor, count) => {
            store.moveSelectionBoundary(boundary, cursor, count)
            syncImageCaretToFocus()
          },
          moveViewport: moveVimViewport,
          syncImageCaretToFocus,
          setMode: setVimMode,
          openAttachment: onPreviewAttachment,
          setImageCaret: (nodeId, active, fromFocus) => {
            applyCaretState(
              nodeId,
              {
                cursor: caretAuthority.current.caret.cursor,
                imageActive: active,
                imageTextReturnCursor: active ? caretAuthority.current.caret.imageTextReturnCursor : undefined,
              },
              fromFocus,
            )
          },
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
            structuralInsert.current = { kind: 'open', originNodeId: node.id, position }
          },
          beginStructuralChildOpen: () => {
            structuralInsert.current = { kind: 'child-open', originNodeId: node.id }
          },
          repeatStructural,
        },
      }),
      onMouseDown: (event: MouseEvent<HTMLElement>) => {
        applyCaretState(
          node.id,
          pointerCaretTransition(
            caretAuthority.current.caret,
            getCaret(event.currentTarget),
            node.text.length,
            node.attachment !== undefined,
          ),
        )
        if (event.button === 2) event.preventDefault()
        setSelectAllNodeId(undefined)
        inputs.current.get(node.id)?.classList.remove('select-all')
        store.endTextSession()
        vimPending.current = undefined
        finishVimInsert(event.currentTarget)
        finishVimReplace(event.currentTarget)
        vimVisualAnchor.current = undefined
        vimVisualFocus.current = undefined
      },
      onMouseUp: (event: MouseEvent<HTMLElement>) => {
        if (latestVimMode.current !== 'normal') return
        applyCaretState(
          node.id,
          pointerCaretTransition(
            caretAuthority.current.caret,
            getCaret(event.currentTarget),
            node.text.length,
            node.attachment !== undefined,
          ),
        )
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
      applyCaretState,
      commandNodeVisual,
      finishVimReplace,
      finishVimInsert,
      moveVimViewport,
      moveNodeVisual,
      onPreviewAttachment,
      persistenceLocked,
      selectAllNodeId,
      selectedNodeId,
      repeatStructural,
      nodeVisualSelection,
      setNodeVisualSelection,
      setVimMode,
      syncImageCaretToFocus,
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
