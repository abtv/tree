import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ClipboardEvent, FocusEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore, FocusIntent, NodeVisualCommand } from '../application/editor-store'
import { requireNode, type LinkRange, type TreeNode } from '../domain/document'
import type { NodeVisualSelection, PendingCaret, PendingVisualSelection } from './node-input-types'
import {
  collapseSelectionToAnchor,
  hasMultiCharacterSelection,
  nodeTextLength,
  getCaret,
  getSelectionRange,
  hasAttachmentCharacter,
  isCollapsedSelection,
  setCaret,
  setNormalCaret,
  setSelectionRange,
  updateSelectedLinks,
} from './editor-dom'
import {
  createEditorKeyDownHandler,
  executeEditorContextMenuCommand,
  finishVimSessionBeforeTextEdit,
  type VimTextCommandState,
} from './editor-input-handlers'
import { freezeCaret, releaseCaret, type CaretFreeze, type NodeDragCaretFreeze } from './drag-caret-freeze'
import { normalCaretTarget } from './link-caret'
import { revealInViewport } from './scroll-viewport'
import { moveViewportSelection } from './vim-viewport-motion'
import type { VimFoldCommand, VimRegister, VimStructuralChange, VimViewportMotion } from './vim-keyboard-types'
import { clearCommandAssembly, createVimCommandState, setVisualRange, type VimCommandState } from './vim-command-state'
import type { NodeInputBindings } from './NodeInput'
import type { VimMode } from './vim-editing'
import { focusCaretTransition, pointerCaretTransition, type VimCaretState } from './vim-caret-transition'
import { repeatStructural as replayStructural } from './vim-structural-repeat'
import * as nodeVisualCommands from './vim-node-visual-commands'
import * as sessionFinish from './vim-session-finish'
import { currentPendingCaretInput, normalCaretIsDrawn, pendingCaretAfterModeChange } from './caret-projection-rules'
import { createVimEditSessionState } from './vim-edit-session'
import { createVimKeyboardState } from './vim-keyboard-state'
import { createTextEditHandlers } from './node-input-text-handlers'

interface UseNodeInputBindingsOptions {
  store: EditorStore
  selectedNodeId?: string | undefined
  focus?: FocusIntent | undefined
  onPreviewAttachment: (attachmentId: string) => void
  persistenceLocked?: boolean
  /**
   * Whether Vim editing is enabled. While it is disabled the renderer Vim mode stays `insert` and
   * keys bypass Vim interpretation entirely, so the editor behaves as a standard text editor.
   */
  vimEnabled: boolean
  vimMode?: VimMode
  setVimMode?: (mode: VimMode) => void
  setImageCaretNodeId?: (nodeId: string | undefined) => void
  nodeVisualSelection?: NodeVisualSelection | undefined
  setNodeVisualSelection?: (selection: NodeVisualSelection | undefined) => void
  /**
   * Applies a Normal-mode fold key to the inline-expansion state. `EditorStore` owns that state, so
   * the keyboard handler dispatches the command here instead of touching it directly.
   */
  onFoldCommand?: (command: VimFoldCommand, nodeId: string) => void
}

export interface NodeInputBindingsResult {
  bindings: (node: TreeNode) => NodeInputBindings
  dragFreeze: NodeDragCaretFreeze
  /**
   * Resolves renderer-local Vim state for switching Vim editing on or off, then sets the mode the
   * switch lands in. The caller owns the enabled flag itself and must update it in the same batch.
   */
  setVimEditing: (enabled: boolean) => void
}

export function useNodeInputBindings({
  store,
  selectedNodeId,
  focus,
  onPreviewAttachment,
  persistenceLocked = false,
  vimEnabled,
  vimMode = 'insert',
  setVimMode = () => undefined,
  setImageCaretNodeId = () => undefined,
  nodeVisualSelection,
  setNodeVisualSelection = () => undefined,
  onFoldCommand = () => undefined,
}: UseNodeInputBindingsOptions): NodeInputBindingsResult {
  const inputs = useRef(new Map<string, HTMLElement>())
  const normalCaretResizeObserver = useRef<ResizeObserver | undefined>(undefined)
  const caretRevision = useRef(0)
  const pendingCaret = useRef<PendingCaret | undefined>(undefined)
  const pendingVisualSelection = useRef<PendingVisualSelection | undefined>(undefined)
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

  function schedulePendingCaret(request: Omit<PendingCaret, 'normal' | 'revision' | 'focusToken'>): void {
    pendingCaret.current = {
      ...request,
      normal: false,
      revision: ++caretRevision.current,
      focusToken: latestFocus.current?.token,
    }
  }

  function schedulePendingVisualSelection(pending: PendingVisualSelection): void {
    pendingVisualSelection.current = pending
  }

  const changeVimMode = useCallback(
    (mode: VimMode): void => {
      if (mode !== latestVimMode.current) {
        const revision = ++caretRevision.current
        const pending = pendingCaret.current
        pendingCaret.current = pendingCaretAfterModeChange(pending, mode, revision)
        latestVimMode.current = mode
      }
      setVimMode(mode)
    },
    [setVimMode],
  )

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
    (
      nodeId: string,
      caret: VimCaretState,
      fromFocus = false,
      timing: 'immediate' | 'after-edit' | 'preserve-selection' = 'immediate',
    ): void => {
      const revision = ++caretRevision.current
      pendingCaret.current = undefined
      caretAuthority.current = { nodeId, caret }
      const state = store.getSnapshot()
      if (fromFocus) {
        if (state.status === 'ready') syncedImageFocusToken.current = state.focus?.token
      }
      setImageCaretNodeId(caret.imageActive ? nodeId : undefined)
      if (timing === 'preserve-selection') return
      const input = inputs.current.get(nodeId)
      if (timing === 'after-edit' || input === undefined) {
        pendingCaret.current = {
          nodeId,
          cursor: caret.cursor,
          normal: true,
          revision,
          focusToken: state.status === 'ready' ? state.focus?.token : undefined,
        }
      } else if (input.isConnected) setNormalCaret(input, caret.cursor)
    },
    [store, setImageCaretNodeId],
  )
  const finishStructuralInsert = useCallback((input: HTMLElement): void => {
    sessionFinish.finishStructuralInsertSession({ commandState: vimCommandState.current }, input)
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

  const restoreVisual = useCallback((): void => {
    nodeVisualCommands.restoreVisual({
      store,
      commandState: vimCommandState.current,
      setNodeVisualSelection,
      changeVimMode,
      syncImageCaretToFocus,
      schedulePendingVisualSelection,
    })
  }, [store, setNodeVisualSelection, changeVimMode, syncImageCaretToFocus])

  const moveNodeVisual = useCallback(
    (direction: 'up' | 'down' | 'first' | 'last', count = 1): void => {
      nodeVisualCommands.moveNodeVisual(
        {
          store,
          commandState: vimCommandState.current,
          nodeVisualSelection,
          setNodeVisualSelection,
          syncImageCaretToFocus,
        },
        direction,
        count,
      )
    },
    [store, nodeVisualSelection, setNodeVisualSelection, syncImageCaretToFocus],
  )

  const commandNodeVisual = useCallback(
    (command: NodeVisualCommand, count = 1): void => {
      nodeVisualCommands.commandNodeVisual(
        {
          store,
          session: vimSession.current,
          commandState: vimCommandState.current,
          nodeVisualSelection,
          setNodeVisualSelection,
          changeVimMode,
          syncImageCaretToFocus,
        },
        command,
        count,
      )
    },
    [
      store,
      nodeVisualSelection,
      setNodeVisualSelection,
      changeVimMode,
      syncImageCaretToFocus,
      vimSession,
      vimCommandState,
    ],
  )

  const verticalOperator = useCallback(
    (nodeId: string, operator: 'd' | 'y' | 'c', direction: 'down' | 'up', count: number): void => {
      nodeVisualCommands.verticalOperator(
        {
          store,
          session: vimSession.current,
          commandState: vimCommandState.current,
          changeVimMode,
        },
        nodeId,
        operator,
        direction,
        count,
      )
    },
    [store, changeVimMode, vimSession, vimCommandState],
  )

  const shiftNodeVisual = useCallback(
    (direction: 'in' | 'out', count: number): void => {
      nodeVisualCommands.shiftNodeVisual(
        { store, commandState: vimCommandState.current, nodeVisualSelection },
        direction,
        count,
      )
    },
    [store, nodeVisualSelection],
  )

  const joinNodeVisual = useCallback(
    (spaced: boolean): void => {
      nodeVisualCommands.joinNodeVisual(
        {
          store,
          commandState: vimCommandState.current,
          nodeVisualSelection,
          changeVimMode,
          syncImageCaretToFocus,
          setNodeVisualSelection,
        },
        spaced,
      )
    },
    [store, nodeVisualSelection, setNodeVisualSelection, changeVimMode, syncImageCaretToFocus, vimCommandState],
  )

  const shiftCurrentNode = useCallback(
    (nodeId: string, direction: 'in' | 'out', count: number, selection: { start: number; end: number }): void => {
      nodeVisualCommands.shiftCurrentNode(
        {
          store,
          commandState: vimCommandState.current,
          schedulePendingVisualSelection,
        },
        nodeId,
        direction,
        count,
        selection,
      )
    },
    [store],
  )

  const repeatStructural = useCallback(
    (change: VimStructuralChange, cursor: number): boolean => {
      return replayStructural({ store, session: vimSession.current }, change, cursor)
    },
    [store, vimSession],
  )

  const finishVimReplace = useCallback(
    (input?: HTMLElement, retreatCursor = false, preserveDomSelection = false): boolean => {
      return sessionFinish.finishReplaceSession(
        {
          store,
          session: vimSession.current,
          commandState: vimCommandState.current,
          readAuthority: () => caretAuthority.current,
          applyCaretState,
        },
        input,
        retreatCursor,
        preserveDomSelection,
      )
    },
    [store, applyCaretState, vimSession, vimCommandState],
  )

  const finishPendingEdits = useCallback((): boolean => {
    return sessionFinish.finishPendingEditSessions({
      session: vimSession.current,
      finishVimReplace,
      getMode: () => latestVimMode.current,
      changeVimMode,
    })
  }, [finishVimReplace, changeVimMode, vimSession])

  useEffect(() => store.registerPendingEditFinisher(finishPendingEdits), [store, finishPendingEdits])

  const finishVimInsert = useCallback(
    (input: HTMLElement, completed = false): void => {
      sessionFinish.finishInsertSession(
        {
          finishStructuralInsert,
          session: vimSession.current,
          commandState: vimCommandState.current,
          getInput: (id) => inputs.current.get(id),
        },
        input,
        completed,
      )
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
      setMode: changeVimMode,
    }),
    [finishVimReplace, changeVimMode, vimCommandState],
  )

  const moveVimViewport = useCallback(
    (nodeId: string, motion: VimViewportMotion, cursor: number, count = 1): void => {
      moveViewportSelection({ store, syncImageCaretToFocus }, nodeId, motion, cursor, count)
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
    const revision = caretRevision.current
    const applyFocus = (): void => {
      const input = inputs.current.get(focus.nodeId)
      if (input === undefined) return
      input.focus()
      revealInViewport(input)
      if (latestVimMode.current === 'normal') {
        // Vertical navigation may resolve the destination to its image while the store carries
        // the originating text column. Project the resolved caret, including on the deferred pass.
        const authority = caretAuthority.current
        const cursor = authority.nodeId === focus.nodeId ? authority.caret.cursor : focus.cursor
        const target = normalCaretTarget(nodeTextLength(input), cursor, hasAttachmentCharacter(input))
        const matches = normalCaretIsDrawn(input, target)
        if (!matches) setNormalCaret(input, cursor)
      } else if (input instanceof HTMLTextAreaElement) input.setSelectionRange(focus.cursor, focus.cursor)
      else setCaret(input, focus.cursor)
    }
    applyFocus()
    queueMicrotask(() => {
      if (latestFocus.current?.token === focus.token && caretRevision.current === revision) applyFocus()
    })
  }, [focus])

  // Declared after the focus effect so it runs after the focus intent collapsed the caret.
  useLayoutEffect(() => {
    const pending = pendingVisualSelection.current
    if (pending === undefined) return
    pendingVisualSelection.current = undefined
    // The deferred pass of the focus effect re-applies the caret unless the revision moved on.
    caretRevision.current += 1
    // Moving focus to the restored node blurred the previous one, which cleared the live Visual
    // endpoints; write them again now that the focus change is done.
    if (pending.endpoints !== undefined)
      setVisualRange(
        vimCommandState.current,
        pending.nodeId,
        pending.endpoints.anchor,
        pending.endpoints.focus,
        pending.endpoints.hadText,
      )
    const input = inputs.current.get(pending.nodeId)
    if (input !== undefined) setSelectionRange(input, pending.start, pending.end)
  })

  useLayoutEffect(() => {
    const pending = pendingCaret.current
    if (pending === undefined) return
    pendingCaret.current = undefined
    const state = store.getSnapshot()
    const registeredInput = inputs.current.get(pending.nodeId)
    const input = currentPendingCaretInput(pending, state, caretRevision.current, registeredInput)
    if (input === undefined) return
    if (pending.refocus === true && input.ownerDocument.activeElement !== input) input.focus()
    if (pending.normal) setNormalCaret(input, pending.cursor)
    else if (vimMode !== 'normal') setCaret(input, pending.cursor)
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
        if (latestVimMode.current === 'replace') changeVimMode('normal')
        store.endTextSession()
      },
      ...createTextEditHandlers(
        {
          store,
          composing,
          pendingLinkDraft,
          schedulePendingCaret,
          getMode: () => latestVimMode.current,
          session: vimSession.current,
          commandState: vimCommandState.current,
          finishVimReplace,
          setComposing,
        },
        node,
      ),
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
        vim: !vimEnabled
          ? undefined
          : createVimKeyboardState(
              {
                store,
                vimMode,
                registerHandle,
                commandState: vimCommandState.current,
                session: vimSession.current,
                readAuthority: () => caretAuthority.current,
                finishVimInsert,
                finishVimReplace,
                applyCaretState,
                moveVimViewport,
                syncImageCaretToFocus,
                changeVimMode,
                onPreviewAttachment,
                schedulePendingCaret,
                nodeVisualSelection,
                setNodeVisualSelection,
                moveNodeVisual,
                commandNodeVisual,
                shiftNodeVisual,
                joinNodeVisual,
                shiftCurrentNode,
                restoreVisual,
                verticalOperator,
                repeatStructural,
                onFoldCommand,
              },
              node,
            ),
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
          false,
          'preserve-selection',
        )
        if (event.button === 2) event.preventDefault()
        setSelectAllNodeId(undefined)
        inputs.current.get(node.id)?.classList.remove('select-all')
        store.endTextSession()
        // A structural session's typed text lives in the node `o`/`O`/Visual `c`/`s` created, not in
        // the node under the pointer. This mousedown runs before the focused input's blur, so let
        // that blur finish the structural session rather than capturing the clicked node's text; a
        // plain session is still consumed here, so a pointer focus interruption records nothing
        // (PRODUCT §20.2.1 T8).
        if (vimCommandState.current.structuralInsert === undefined) finishVimInsert(event.currentTarget)
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
          false,
          'preserve-selection',
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
      shiftNodeVisual,
      joinNodeVisual,
      shiftCurrentNode,
      restoreVisual,
      verticalOperator,
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
      changeVimMode,
      syncImageCaretToFocus,
      store,
      vimEnabled,
      vimMode,
      vimSession,
      vimCommandState,
      vimTextCommandState,
    ],
  )

  const setVimEditing = useCallback(
    (enabled: boolean): void => {
      sessionFinish.switchVimEditing(
        {
          store,
          getInput: (id) => inputs.current.get(id),
          readAuthority: () => caretAuthority.current,
          changeVimMode,
          applyCaretState,
          finishVimInsert,
          finishVimReplace,
          commandState: vimCommandState.current,
          setNodeVisualSelection,
        },
        enabled,
      )
    },
    [store, changeVimMode, applyCaretState, finishVimInsert, finishVimReplace, setNodeVisualSelection],
  )

  const dragFreeze = useMemo<NodeDragCaretFreeze>(
    () => ({ begin: beginFrozenCaret, end: releaseFrozenCaret }),
    [beginFrozenCaret, releaseFrozenCaret],
  )

  return { bindings, dragFreeze, setVimEditing }
}
