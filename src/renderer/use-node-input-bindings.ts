import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent, FormEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore, FocusIntent, NodeVisualCommand } from '../application/editor-store'
import { locateNode, reconcileLinkTextEdit, requireNode, type LinkRange, type TreeNode } from '../domain/document'
import {
  collapseSelectionToAnchor,
  getCaret,
  getSelectionRange,
  hasAttachmentCharacter,
  isCollapsedSelection,
  readEditableContent,
  setCaret,
  setNormalCaret,
  updateSelectedLinks,
} from './editor-dom'
import {
  createEditorKeyDownHandler,
  executeEditorContextMenuCommand,
  finishVimSessionBeforeTextEdit,
  type VimTextCommandState,
} from './editor-input-handlers'
import { freezeCaret, releaseCaret, type CaretFreeze, type NodeDragCaretFreeze } from './drag-caret-freeze'
import { currentLinkDraft, normalCaretTarget } from './link-caret'
import type { VimFoldCommand, VimRegister, VimStructuralChange, VimViewportMotion } from './vim-keyboard-types'
import {
  beginStructuralChildOpen,
  beginStructuralOpen,
  beginStructuralVisual,
  clearCommandAssembly,
  clearPending,
  createVimCommandState,
  recordRepeatChange,
  structuralRepeatChange,
  takeStructuralInsert,
  type VimCommandState,
} from './vim-command-state'
import type { NodeInputBindings } from './NodeInput'
import type { VimMode } from './vim-editing'
import {
  editCaretTransition,
  focusCaretTransition,
  pointerCaretTransition,
  type VimCaretState,
} from './vim-caret-transition'
import {
  applyReplaceKey,
  beginInsertSession,
  beginReplaceSession,
  createVimEditSessionState,
  insertRepeatChange,
  nodeRegister,
  registerSource,
  resolveReplaceCommit,
  takeInsertSession,
  takeReplaceSession,
  visualCommandRegister,
} from './vim-edit-session'

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
  /**
   * Applies a Normal-mode fold key to the transient inline-expansion state. `App.tsx` owns that
   * state, so the keyboard handler dispatches the command here instead of touching it directly.
   */
  onFoldCommand?: (command: VimFoldCommand, nodeId: string) => void
}

export interface NodeInputBindingsResult {
  bindings: (node: TreeNode) => NodeInputBindings
  dragFreeze: NodeDragCaretFreeze
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
  onFoldCommand = () => undefined,
}: UseNodeInputBindingsOptions): NodeInputBindingsResult {
  const inputs = useRef(new Map<string, HTMLElement>())
  const normalCaretResizeObserver = useRef<ResizeObserver | undefined>(undefined)
  const pendingCaret = useRef<{ input: HTMLElement; cursor: number } | undefined>(undefined)
  const pendingLinkDraft = useRef<{ nodeId: string; range: LinkRange } | undefined>(undefined)
  const latestFocus = useRef<FocusIntent | undefined>(focus)
  const syncedImageFocusToken = useRef<number | undefined>(focus?.token)
  const latestVimMode = useRef(vimMode)
  const [composing, setComposing] = useState(false)
  const [selectAllNodeId, setSelectAllNodeId] = useState<string>()
  // The pure owner instance is created once per mount and kept in a ref because its register and
  // pending session are intentionally mutable local editing state that must not trigger renders.
  // The handle reads and writes the owner's register at access time so the keyboard handler's
  // direct `register.current` writes stay in sync without re-creating the bindings callback.
  const vimSession = useRef(createVimEditSessionState())
  const registerHandle = useMemo(
    () => ({
      get current(): VimRegister {
        return vimSession.current.register
      },
      set current(value: VimRegister) {
        vimSession.current.register = value
      },
    }),
    [vimSession],
  )
  // The pending command, dot-repeat, find, Visual endpoints, and structural insert live in one
  // pure owner. The keyboard state exposes it through an access-time getter, so the handlers read
  // and write that owner and clear through its transitions; the getter reads the ref only when a
  // handler accesses it, not during render.
  const vimCommandState = useRef(createVimCommandState())
  const caretAuthority = useRef<{ nodeId?: string; caret: VimCaretState }>({
    caret: { cursor: focus?.cursor ?? 0, imageActive: false },
  })
  const frozenCaret = useRef<CaretFreeze | undefined>(undefined)
  const frozenPointerListener = useRef<((event: PointerEvent) => void) | undefined>(undefined)

  const clearFrozenPointerListener = useCallback((): void => {
    const listener = frozenPointerListener.current
    if (listener === undefined) return
    globalThis.removeEventListener('pointerup', listener)
    globalThis.removeEventListener('pointercancel', listener)
    frozenPointerListener.current = undefined
  }, [])

  const releaseFrozenCaret = useCallback(
    (pointerId?: number): void => {
      const freeze = releaseCaret(frozenCaret.current, pointerId)
      if (freeze === undefined) return
      frozenCaret.current = undefined
      clearFrozenPointerListener()
      const input = inputs.current.get(freeze.nodeId)
      if (input === undefined) return
      input.focus({ preventScroll: true })
      setCaret(input, freeze.caret.cursor)
    },
    [clearFrozenPointerListener],
  )

  // The caret authority suspends the captured caret while a node drag freezes the text surface and
  // restores it when the frozen pointer is released, even if the release lands outside the list
  // (for example after Escape already ended the visual freeze).
  const beginFrozenCaret = useCallback(
    (nodeId: string, pointerId: number): void => {
      const existing = frozenCaret.current
      if (existing !== undefined && existing.pointerId === pointerId) return
      if (existing !== undefined) {
        clearFrozenPointerListener()
        frozenCaret.current = undefined
      }
      const input = inputs.current.get(nodeId)
      if (input === undefined || document.activeElement !== input) return
      collapseSelectionToAnchor(input)
      frozenCaret.current = freezeCaret(nodeId, pointerId, { ...caretAuthority.current.caret, cursor: getCaret(input) })
      const listener = (event: PointerEvent): void => {
        if (event.pointerId === pointerId) releaseFrozenCaret(pointerId)
      }
      frozenPointerListener.current = listener
      globalThis.addEventListener('pointerup', listener)
      globalThis.addEventListener('pointercancel', listener)
      input.blur()
    },
    [clearFrozenPointerListener, releaseFrozenCaret],
  )

  useEffect(
    () => () => {
      frozenCaret.current = undefined
      clearFrozenPointerListener()
    },
    [clearFrozenPointerListener],
  )

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
  const finishStructuralInsert = useCallback((input: HTMLElement): void => {
    const session = takeStructuralInsert(vimCommandState.current)
    if (session === undefined) return
    const text = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
    recordRepeatChange(vimCommandState.current, structuralRepeatChange(session, text))
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
      // Whole-node Visual extension stays within the focused node's actual sibling array, whatever
      // depth it is displayed at through inline expansion.
      const located = locateNode(state.document, nodeVisualSelection.focusId)
      if (located === undefined) return
      const nodes = located.siblings
      const index = located.index
      if (nodes.length === 0) return
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
      // The anchor and focus of a whole-node Visual range always share a real parent (see
      // `moveNodeVisual`), so the anchor's actual siblings resolve the span.
      const anchorLocated = locateNode(state.document, nodeVisualSelection.anchorId)
      if (anchorLocated === undefined) return
      const focus = anchorLocated.siblings.findIndex((node) => node.id === nodeVisualSelection.focusId)
      if (focus < 0) return
      const span = Math.abs(anchorLocated.index - focus) + 1
      const source = registerSource(vimSession.current.register)
      const result = store.applyNodeVisual(command, nodeVisualSelection.anchorId, nodeVisualSelection.focusId, source)
      if (result === undefined) return
      const nextRegister = visualCommandRegister(command, result)
      if (nextRegister !== undefined) vimSession.current.register = nextRegister
      if (command === 'c' || command === 's') {
        beginStructuralVisual(vimCommandState.current, nodeVisualSelection.focusId, command, span)
        setVimMode('insert')
      } else {
        if (command !== 'y')
          recordRepeatChange(vimCommandState.current, {
            kind: 'structural-visual',
            command,
            span,
            ...(source === undefined ? {} : { source }),
          })
        setVimMode('normal')
        syncImageCaretToFocus()
      }
      // The command exits whole-node Visual mode, so an unfinished `g` prefix must not survive into
      // the mode the command lands in.
      clearCommandAssembly(vimCommandState.current)
      setNodeVisualSelection(undefined)
    },
    [
      store,
      nodeVisualSelection,
      setNodeVisualSelection,
      setVimMode,
      syncImageCaretToFocus,
      vimSession,
      vimCommandState,
    ],
  )

  const repeatStructural = useCallback(
    (change: VimStructuralChange): void => {
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      if (change.kind === 'structural-delete') {
        const selected = locateNode(state.document, state.location.selectedNodeId)?.node
        if (selected !== undefined) vimSession.current.register = nodeRegister(selected)
        store.deleteSelected()
      } else if (change.kind === 'structural-open') store.createSiblingWithText(change.position, change.text)
      else if (change.kind === 'structural-child-open') store.createChildWithText(change.text)
      else if (change.kind === 'structural-put')
        store.pasteSubtree(state.location.selectedNodeId, change.position, change.source, change.sourceIds)
      else if (change.kind === 'structural-forest-put')
        store.pasteNodeForest(state.location.selectedNodeId, change.position, change.source)
      else {
        // A repeated whole-node Visual mutation applies to the current node's own actual siblings.
        const located = locateNode(state.document, state.location.selectedNodeId)
        if (located === undefined) return
        const end = located.siblings[located.index + change.span - 1]
        if (end === undefined) return
        const result = store.applyNodeVisual(change.command, located.node.id, end.id, change.source, change.text)
        if (result !== undefined) {
          const nextRegister = visualCommandRegister(change.command, result)
          if (nextRegister !== undefined) vimSession.current.register = nextRegister
        }
      }
    },
    [store, vimSession],
  )

  const finishVimReplace = useCallback(
    (input?: HTMLElement, retreatCursor = false, preserveDomSelection = false): boolean => {
      const session = takeReplaceSession(vimSession.current)
      if (session === undefined) return false
      const commit = resolveReplaceCommit(session)
      if (commit === undefined) return false
      const { finalText, replacedStart, replacedEnd, rawCursor } = commit
      store.replaceTextRange(session.nodeId, replacedStart, replacedEnd, session.typed)
      recordRepeatChange(vimCommandState.current, {
        kind: 'overwrite',
        text: session.typed,
        replaced: replacedEnd - replacedStart,
      })
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
      // A command-driven commit must not rewrite the DOM: the visible text already equals the
      // committed text, and the user's selection is what the command is about to act on.
      if (input !== undefined && !preserveDomSelection) {
        setEditableText(input, finalText)
        setCaret(input, rawCursor)
      }
      return true
    },
    [store, applyCaretState, vimSession, vimCommandState],
  )

  // The store invokes this before it captures a quit save and again after that save completes, so
  // a pending Replace buffer is committed into the document and persisted by the quit flush rather
  // than dying with the renderer. The commit path is the same one blur uses: no DOM rewrite (the
  // visible text already equals the committed text), no Escape-style caret retreat, and a return to
  // Normal mode so a failed quit leaves the editor in a consistent state. The session is consumed
  // before the commit, so repeated invocations are no-ops; the returned flag tells the flush to run
  // another pass when this call committed an edit.
  const finishPendingEdits = useCallback((): boolean => {
    const committed = finishVimReplace()
    if (latestVimMode.current === 'replace') setVimMode('normal')
    return committed
  }, [finishVimReplace, setVimMode])

  useEffect(() => store.registerPendingEditFinisher(finishPendingEdits), [store, finishPendingEdits])

  const finishVimInsert = useCallback(
    // Always captures: a diff-based session can span a node change (e.g. Enter while still in
    // Insert mode) with no reliable way to detect that at finish time across every trigger
    // (keyboard, blur, and mouse-driven navigation that never fires a distinguishing blur target).
    // Safety instead lives at dot-repeat replay time, which checks the stamped `nodeId`.
    (input: HTMLElement): void => {
      finishStructuralInsert(input)
      const session = takeInsertSession(vimSession.current)
      if (session === undefined) return
      const finalText = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
      const change = insertRepeatChange(session, finalText)
      if (change !== undefined) recordRepeatChange(vimCommandState.current, change)
    },
    [finishStructuralInsert, vimSession, vimCommandState],
  )

  // The context-menu and native-paste paths resolve the same renderer-local session state as the
  // keyboard handler, but they run from bindings that do not hold the full `VimKeyboardState`.
  // Getters keep the mode and the command-state owner current across the async menu round trip.
  const vimTextCommandState = useMemo<VimTextCommandState>(
    () => ({
      get mode() {
        return latestVimMode.current
      },
      get commandState(): VimCommandState {
        return vimCommandState.current
      },
      finishReplace: (input, retreatCursor, preserveDomSelection) =>
        finishVimReplace(input, retreatCursor, preserveDomSelection),
      setMode: setVimMode,
    }),
    [finishVimReplace, setVimMode, vimCommandState],
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
      // A mode change draws the Normal block caret, but a deliberate multi-character selection —
      // notably the select-all Cmd+A applies, including when the same command ends whole-node
      // Visual — must survive the change instead of collapsing to the one-character block.
      if (!hasMultiCharacterSelection(focusedInput)) setNormalCaret(focusedInput, getCaret(focusedInput))
    } else if (vimMode === 'insert' || vimMode === 'replace') setCaret(focusedInput, getCaret(focusedInput))
  }, [focus, vimMode])

  useLayoutEffect(() => {
    if (focus === undefined) return
    const applyFocus = (): void => {
      const input = inputs.current.get(focus.nodeId)
      if (input === undefined) return
      input.focus()
      if (latestVimMode.current === 'normal') {
        const target = normalCaretTarget(nodeTextLength(input), focus.cursor, hasAttachmentCharacter(input))
        const matches =
          input instanceof HTMLTextAreaElement &&
          (target.kind === 'block'
            ? input.selectionStart === target.start && input.selectionEnd === target.end
            : input.selectionStart === target.position && input.selectionEnd === target.position)
        if (!matches) setNormalCaret(input, focus.cursor)
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
        if (input === document.activeElement) {
          input.classList.toggle('node-input-text-selected', hasMultiCharacterSelection(input))
        }
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
        // A resize notification can arrive after a mode change; re-drawing the Normal block caret
        // must not discard a deliberate multi-character selection such as Cmd+A's select-all.
        if (hasMultiCharacterSelection(input)) continue
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

  const bindings = useCallback(
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
        // A blur moves focus to a non-input control (a breadcrumb or enter-control click) or to
        // another node, so the command assembly that belongs to this node must clear with it.
        clearCommandAssembly(vimCommandState.current)
        // A structural session (o/O/whole-node-Visual c/s) begins by creating a new node and
        // immediately moving focus onto it, which blurs *this* node as an incidental side effect
        // before the user has typed anything into the new one. Only finish a structural session
        // from blur once it is a different node's own blur — the one it actually began on.
        const structuralBeganHere = vimCommandState.current.structuralInsert?.originNodeId === node.id
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
          pendingLinkDraft.current?.nodeId === node.id
            ? currentLinkDraft(node.text, pendingLinkDraft.current.range)
            : undefined
        const edit = reconcileLinkTextEdit(node.text, node.links ?? [], content.text, draft)
        pendingLinkDraft.current = edit.draft === undefined ? undefined : { nodeId: node.id, range: edit.draft }
        store.editContent(node.id, content.text, edit.links, edit.createsNewLink)
      },
      onContentChange: (event: FormEvent<HTMLElement>) => {
        const text = event.currentTarget.textContent ?? ''
        const draft =
          pendingLinkDraft.current?.nodeId === node.id
            ? currentLinkDraft(node.text, pendingLinkDraft.current.range)
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
          beginReplaceSession(vimSession.current, {
            nodeId: node.id,
            baseline,
            position: getCaret(event.currentTarget),
          })
        }
      },
      onCompositionStart: () => {
        clearPending(vimCommandState.current)
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
          .then((command) => executeEditorContextMenuCommand(command, store, node, input, vimTextCommandState))
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
          register: registerHandle,
          get commandState(): VimCommandState {
            return vimCommandState.current
          },
          beginInsert: (nodeId, baseline, position, change) => {
            beginInsertSession(vimSession.current, { nodeId, baseline, position, change })
          },
          finishInsert: finishVimInsert,
          beginReplace: (nodeId, _input, baseline, position) => {
            beginReplaceSession(vimSession.current, { nodeId, baseline, position })
          },
          handleReplaceKey: (input, key) => {
            const result = applyReplaceKey(vimSession.current.replace, key)
            if (result === undefined) return false
            setEditableText(input, result.workingText)
            setCaret(input, result.cursor)
            return true
          },
          finishReplace: (input, retreatCursor, preserveDomSelection) => {
            return finishVimReplace(input, retreatCursor, preserveDomSelection)
          },
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
            beginStructuralOpen(vimCommandState.current, node.id, position)
          },
          beginStructuralChildOpen: () => {
            beginStructuralChildOpen(vimCommandState.current, node.id)
          },
          repeatStructural,
          fold: onFoldCommand,
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
        finishVimInsert(event.currentTarget)
        // A right-click opens the context menu, which will run Cut or Paste against the visible
        // selection, so this commit must not rewrite the DOM; a left click keeps the existing
        // reset-to-typed-end behavior.
        finishVimReplace(event.currentTarget, false, event.button === 2)
        clearCommandAssembly(vimCommandState.current)
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
        finishVimSessionBeforeTextEdit(vimTextCommandState, event.currentTarget)
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
      onFoldCommand,
      registerHandle,
      setNodeVisualSelection,
      setVimMode,
      syncImageCaretToFocus,
      store,
      vimMode,
      vimSession,
      vimCommandState,
      vimTextCommandState,
    ],
  )

  const dragFreeze = useMemo<NodeDragCaretFreeze>(
    () => ({ begin: beginFrozenCaret, end: releaseFrozenCaret }),
    [beginFrozenCaret, releaseFrozenCaret],
  )

  return { bindings, dragFreeze }
}

function nodeTextLength(input: HTMLElement): number {
  return input instanceof HTMLTextAreaElement ? input.value.length : (input.textContent?.length ?? 0)
}

/**
 * The Normal caret is a collapsed position or a one-character block; anything wider is a deliberate
 * selection (Cmd+A or a pointer drag) that caret normalization must not overwrite.
 */
function hasMultiCharacterSelection(input: HTMLElement): boolean {
  const selection = getSelectionRange(input)
  return selection.end - selection.start > 1
}

function setEditableText(input: HTMLElement, text: string): void {
  if (input instanceof HTMLTextAreaElement) input.value = text
  else input.textContent = text
}
