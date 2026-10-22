import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { EditorStore, FocusIntent, NodeVisualCommand } from '../application/editor-store'
import { requireNode, type LinkRange, type TreeNode } from '../domain/document'
import type { NodeVisualSelection, PendingCaret, PendingVisualSelection } from './node-input-types'
import {
  collapseSelectionToAnchor,
  hasMultiCharacterSelection,
  nodeText,
  getCaret,
  readEditableContent,
  hasAttachmentCharacter,
  setCaret,
  setNormalCaret,
  setSelectionRange,
  updateDateLikeUnderline,
  updateSelectedLinks,
} from './editor-dom'
import { createEditorKeyDownHandler, type VimTextCommandState } from './editor-input-handlers'
import { freezeCaret, releaseCaret, type CaretFreeze, type NodeDragCaretFreeze } from './drag-caret-freeze'
import { normalCaretTarget } from './link-caret'
import { characterCaretTransition } from './vim-caret-transition'
import { revealInViewport } from './scroll-viewport'
import { createViewportReveal } from './viewport-reveal'
import { moveViewportSelection } from './vim-viewport-motion'
import type { VimFoldCommand, VimRegister, VimStructuralChange, VimViewportMotion } from './vim-keyboard-types'
import { createVimCommandState, setVisualRange, type VimCommandState } from './vim-command-state'
import type { NodeInputBindings } from './NodeInput'
import type { VimMode } from './vim-editing'
import { focusCaretTransition, type VimCaretState } from './vim-caret-transition'
import { repeatStructural as replayStructural } from './vim-structural-repeat'
import * as nodeVisualCommands from './vim-node-visual-commands'
import * as sessionFinish from './vim-session-finish'
import { currentPendingCaretInput, normalCaretIsDrawn } from './caret-projection-rules'
import { CaretProjectionState } from './caret-projection-state'
import { beginReplaceClick, beginReplaceSession, createVimEditSessionState, takeReplaceClick } from './vim-edit-session'
import { createVimKeyboardState } from './vim-keyboard-state'
import { createPointerHandlers } from './node-input-pointer-handlers'
import { createTextEditHandlers } from './node-input-text-handlers'
import { useCompletion } from './use-completion'
import type { CompletionPopupPresentation } from './CompletionPopup'
import type { EditorServices } from '../application/editor-store-types'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'

interface UseNodeInputBindingsOptions {
  store: EditorStore
  capturePasteClipboard?: ((data: DataTransfer) => EditorServices['readClipboard']) | undefined
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
  /** The platform's primary-modifier profile; Apple conventions when absent. */
  shortcuts?: ShortcutProfile
}

export interface NodeInputBindingsResult {
  restoreSearchFocus: () => void
  completionPopup: CompletionPopupPresentation | undefined
  acceptCompletion: (index: number) => void
  vimTextCommandState: VimTextCommandState
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
  capturePasteClipboard,
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
  shortcuts = APPLE_SHORTCUTS,
}: UseNodeInputBindingsOptions): NodeInputBindingsResult {
  const inputs = useRef(new Map<string, HTMLElement>())
  const viewportReveal = useMemo(() => createViewportReveal(), [])
  const preserveViewport = useRef(false)
  const initialFocusApplied = useRef(false)
  const normalCaretResizeObserver = useRef<ResizeObserver | undefined>(undefined)
  const caretProjection = useRef(new CaretProjectionState<HTMLElement>(focus, vimMode))
  const pendingLinkDraft = useRef<{ nodeId: string; range: LinkRange } | undefined>(undefined)
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
  const frozenCaret = useRef<CaretFreeze | undefined>(undefined)
  const frozenPointerListener = useRef<((event: PointerEvent) => void) | undefined>(undefined)

  function schedulePendingCaret(request: Omit<PendingCaret, 'normal' | 'revision' | 'focusToken'>): void {
    const projection = caretProjection.current
    projection.requestCaret(request, projection.focusToken)
  }

  function schedulePendingVisualSelection(pending: PendingVisualSelection): void {
    caretProjection.current.requestVisual(pending)
  }

  const scheduleCompletionCaret = useCallback((nodeId: string, cursor: number): void => {
    schedulePendingCaret({ nodeId, cursor, refocus: true })
  }, [])
  const completion = useCompletion(
    store,
    vimEnabled ? vimMode : 'insert',
    persistenceLocked,
    scheduleCompletionCaret,
    vimEnabled,
    shortcuts,
  )
  const decorateCompletionBindings = completion.decorate

  const changeVimMode = useCallback(
    (mode: VimMode): void => {
      caretProjection.current.changeMode(mode)
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
      const state = store.getSnapshot()
      caretProjection.current.requestCaret(
        { nodeId: freeze.nodeId, cursor: freeze.caret.cursor, refocus: true, restoredCaret: freeze.caret },
        state.status === 'ready' ? state.focus?.token : undefined,
      )
      input.focus({ preventScroll: true })
      setCaret(input, freeze.caret.cursor)
    },
    [clearFrozenPointerListener, store],
  )

  // The caret authority suspends the captured caret while a node drag freezes the text surface and
  // restores it when the frozen pointer is released, even if the release lands outside the list
  // (for example after Escape already ended the visual freeze).
  const beginFrozenCaret = useCallback(
    (nodeId: string, pointerId: number): void => {
      // A press held long enough to move the node is a drag, not a text click (PRODUCT §20.2.6),
      // so the blur below must end Replace mode as before.
      takeReplaceClick(vimSession.current)
      const existing = frozenCaret.current
      if (existing !== undefined && existing.pointerId === pointerId) return
      if (existing !== undefined) {
        clearFrozenPointerListener()
        frozenCaret.current = undefined
      }
      const input = inputs.current.get(nodeId)
      if (input === undefined || document.activeElement !== input) return
      caretProjection.current.invalidateCaret()
      collapseSelectionToAnchor(input)
      frozenCaret.current = freezeCaret(nodeId, pointerId, {
        ...caretProjection.current.authority.caret,
        cursor: getCaret(input),
      })
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
      const state = store.getSnapshot()
      if (state.status === 'ready')
        caret = characterCaretTransition(caret, requireNode(state.document, nodeId).node.text)
      const input = inputs.current.get(nodeId)
      caretProjection.current.placeCaret(nodeId, caret, {
        focusToken: state.status === 'ready' ? state.focus?.token : undefined,
        fromFocus: fromFocus && state.status === 'ready',
        defer: timing !== 'preserve-selection' && (timing === 'after-edit' || input === undefined),
      })
      setImageCaretNodeId(caret.imageActive ? nodeId : undefined)
      if (timing === 'preserve-selection') return
      if (store.search.session.getSnapshot().draft === undefined && timing !== 'after-edit' && input?.isConnected)
        setNormalCaret(input, caret.cursor)
    },
    [store, setImageCaretNodeId],
  )
  const finishStructuralInsert = useCallback((input: HTMLElement): void => {
    sessionFinish.finishStructuralInsertSession({ commandState: vimCommandState.current }, input)
  }, [])

  const revealVerticalCaret = useCallback((): void => {
    const projection = caretProjection.current
    const { nodeId, caret } = projection.authority
    const state = store.getSnapshot()
    viewportReveal.cancel()
    if (nodeId === undefined || state.status !== 'ready') return
    const revision = projection.currentRevision
    const token = state.focus.token
    const isCurrent = (): boolean => {
      const current = store.getSnapshot()
      return (
        current.status === 'ready' &&
        current.focus.token === token &&
        projection.currentRevision === revision &&
        projection.mode === 'normal'
      )
    }
    if (caret.imageActive) {
      const input = inputs.current.get(nodeId)
      if (input !== undefined) viewportReveal.begin(input.closest('.node-row') ?? input, true, isCurrent)
    } else viewportReveal.beginLine(() => inputs.current.get(nodeId), caret.cursor, isCurrent)
  }, [store, viewportReveal])

  const syncImageCaretToFocus = useCallback((): void => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') return
    const projection = caretProjection.current
    if (state.focus?.token === projection.syncedFocusToken) return
    const pending = projection.pendingCaret
    if (
      pending?.restoredCaret !== undefined &&
      currentPendingCaretInput(pending, state, projection.currentRevision, inputs.current.get(pending.nodeId)) !==
        undefined
    )
      return
    projection.consumeFocus(state.focus?.token)
    const target = requireNode(state.document, state.location.selectedNodeId).node
    const next = focusCaretTransition(
      projection.authority.caret,
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
    (direction: 'in' | 'out', count: number, confineOutdentToCurrentParent = false): void => {
      nodeVisualCommands.shiftNodeVisual(
        { store, commandState: vimCommandState.current, nodeVisualSelection },
        direction,
        count,
        confineOutdentToCurrentParent,
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
    (
      nodeId: string,
      direction: 'in' | 'out',
      count: number,
      selection: { start: number; end: number },
      cursor?: number,
      confineOutdentToCurrentParent = false,
    ): void => {
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
        cursor,
        confineOutdentToCurrentParent,
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
          readAuthority: () => caretProjection.current.authority,
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
      commandState: vimCommandState.current,
      finishVimReplace,
      getMode: () => caretProjection.current.mode,
      changeVimMode,
    })
  }, [finishVimReplace, changeVimMode, vimSession, vimCommandState])

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
        return caretProjection.current.mode
      },
      get commandState(): VimCommandState {
        return vimCommandState.current
      },
      finishReplace: (input, retreatCursor, preserveDomSelection) =>
        finishVimReplace(input, retreatCursor, preserveDomSelection),
      finishInsert: finishVimInsert,
      register: registerHandle,
      getCaretState: (nodeId, cursor, imageActive) =>
        caretProjection.current.authority.nodeId === nodeId
          ? { ...caretProjection.current.authority.caret, cursor }
          : { cursor, imageActive },
      applyCaretState,
      setMode: changeVimMode,
    }),
    [finishVimReplace, finishVimInsert, changeVimMode, vimCommandState, registerHandle, applyCaretState],
  )

  const moveVimViewport = useCallback(
    (nodeId: string, motion: VimViewportMotion, cursor: number, count = 1): void => {
      moveViewportSelection(
        {
          store,
          syncImageCaretToFocus,
          beforeSelect: (preserve) => {
            preserveViewport.current = preserve
          },
        },
        nodeId,
        motion,
        cursor,
        count,
      )
    },
    [store, syncImageCaretToFocus],
  )

  // Keyboard motion keeps context beyond the selected row; a pointer press on a visible row must not
  // move the content under the pointer (docs/PRODUCT.md §20.8).
  const pointerDriven = useRef(false)
  useEffect(() => viewportReveal.mount(), [viewportReveal])
  useEffect(() => {
    const onPointer = (): void => {
      pointerDriven.current = true
    }
    const onKey = (): void => {
      pointerDriven.current = false
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [])

  useLayoutEffect(() => {
    const projection = caretProjection.current
    const changes = projection.beginCommit(focus, vimMode)
    // One commit pipeline owns precedence: authority, mode, focus, Visual restoration,
    // pending placement, decoration, then completion. Unrelated commits skip focus/mode work.
    if (focus !== undefined && focus.token !== projection.syncedFocusToken) syncImageCaretToFocus()
    const focusedInput = focus === undefined ? undefined : inputs.current.get(focus.nodeId)
    if (store.search.session.getSnapshot().draft === undefined && changes.modeChanged && focusedInput !== undefined) {
      if (vimMode === 'normal') {
        // Cmd+A's deliberate selection survives the transition to Normal.
        if (!hasMultiCharacterSelection(focusedInput)) setNormalCaret(focusedInput, getCaret(focusedInput))
      } else if (vimMode === 'insert' || vimMode === 'replace') setCaret(focusedInput, getCaret(focusedInput))
    }

    if (changes.focusChanged && focus !== undefined) {
      const work = projection.captureFocusWork()
      // Capture the policy once per focus token; later input must not reinterpret its deferred pass.
      const keepContext = !pointerDriven.current
      const preserve = preserveViewport.current
      preserveViewport.current = false
      pointerDriven.current = false
      const restoring = !initialFocusApplied.current && store.getRestoredSelectedRowTop() !== undefined
      initialFocusApplied.current = true
      const isCurrent = (): boolean => {
        const state = store.getSnapshot()
        return state.status === 'ready' && state.focus?.token === focus.token
      }
      if (!viewportReveal.hasLine()) viewportReveal.cancel()
      const applyFocus = (firstPass = false): void => {
        if (store.search.session.getSnapshot().draft !== undefined) return
        const input = inputs.current.get(focus.nodeId)
        if (input === undefined) return
        // Suppress native scrolling; the reveal policy decides how far to scroll.
        input.focus({ preventScroll: true })
        if (!preserve) {
          const row = input.closest('.node-row, .agenda-row') ?? input
          if (viewportReveal.hasLine()) viewportReveal.correct()
          else if (restoring) {
            // Session restoration owns startup alignment and its asynchronous geometry until input.
            if (firstPass) revealInViewport(row, keepContext)
          } else if (firstPass) viewportReveal.begin(row, keepContext, isCurrent)
          else viewportReveal.correct()
        }
        if (projection.mode === 'normal') {
          // Vertical navigation can resolve an image while focus carries the originating text column.
          const authority = projection.authority
          const cursor = authority.nodeId === focus.nodeId ? authority.caret.cursor : focus.cursor
          const target = normalCaretTarget(nodeText(input), cursor, hasAttachmentCharacter(input))
          if (!normalCaretIsDrawn(input, target)) setNormalCaret(input, cursor)
        } else if (input instanceof HTMLTextAreaElement) input.setSelectionRange(focus.cursor, focus.cursor)
        else setCaret(input, focus.cursor)
      }
      applyFocus(true)
      queueMicrotask(() => {
        if (projection.isCurrentFocusWork(work)) applyFocus()
      })
    }

    const visual = projection.takeVisual()
    if (visual !== undefined) {
      // Focus can blur the previous node and clear Visual endpoints; restore them after focus.
      if (visual.endpoints !== undefined)
        setVisualRange(
          vimCommandState.current,
          visual.nodeId,
          visual.endpoints.anchor,
          visual.endpoints.focus,
          visual.endpoints.hadText,
        )
      const input = inputs.current.get(visual.nodeId)
      if (input !== undefined) setSelectionRange(input, visual.start, visual.end)
    }

    const pending = projection.takeCaret()
    if (pending !== undefined) {
      const state = store.getSnapshot()
      const registeredInput = inputs.current.get(pending.nodeId)
      const input = currentPendingCaretInput(pending, state, projection.currentRevision, registeredInput)
      if (input !== undefined && store.search.session.getSnapshot().draft === undefined) {
        if (pending.refocus === true && input.ownerDocument.activeElement !== input) input.focus()
        if (pending.restoredCaret !== undefined) {
          projection.restoreDrag(
            pending.nodeId,
            pending.restoredCaret,
            state.status === 'ready' ? state.focus?.token : undefined,
          )
          setImageCaretNodeId(pending.restoredCaret.imageActive ? pending.nodeId : undefined)
          if (vimMode === 'normal') setNormalCaret(input, pending.cursor)
          else setCaret(input, pending.cursor)
        } else if (pending.normal) setNormalCaret(input, pending.cursor)
        else if (vimMode !== 'normal') setCaret(input, pending.cursor)
      }
    }

    // React can replace a class or underline span without emitting selectionchange.
    const active = document.activeElement
    if (active instanceof HTMLElement && active.classList.contains('node-input')) {
      active.classList.toggle('node-input-text-selected', hasMultiCharacterSelection(active))
      // Re-rendered text replaces the underline spans, so the caret rule is applied again after a commit.
      if (!(active instanceof HTMLTextAreaElement)) updateDateLikeUnderline(active)
    }
    completion.reconcile()
  })

  useEffect(() => {
    const update = (): void => {
      for (const input of inputs.current.values()) {
        if (!(input instanceof HTMLTextAreaElement)) {
          updateSelectedLinks(input)
          updateDateLikeUnderline(input)
        }
        if (input === document.activeElement) {
          input.classList.toggle('node-input-text-selected', hasMultiCharacterSelection(input))
        }
      }
    }
    document.addEventListener('selectionchange', update)
    // Blur does not always report a selection change, but it ends the caret rule for the element.
    document.addEventListener('focusout', update)
    return () => {
      document.removeEventListener('selectionchange', update)
      document.removeEventListener('focusout', update)
    }
  }, [])

  useEffect(() => {
    const redraw = (input: HTMLElement): void => {
      if (input.ownerDocument.activeElement !== input || caretProjection.current.mode !== 'normal') return
      // A resize notification can arrive after a mode change; re-drawing the Normal block caret
      // must not discard a deliberate multi-character selection such as Cmd+A's select-all.
      if (hasMultiCharacterSelection(input)) return
      setNormalCaret(input, getCaret(input))
    }
    // While the primary button is held, the native press owns the selection: it places a collapsed
    // caret and extends it as the pointer drags. The block caret is itself a one-character native
    // selection, so a press on it would start a native text drag instead; collapse it before the
    // press is handled. Re-observing an input after a render reports it again, and redrawing the
    // block mid-press would replace the selection being extended, so the block is drawn again only
    // when the press ends.
    let pressed = false
    const onPress = (event: PointerEvent): void => {
      if (event.button !== 0) return
      pressed = true
      const target = event.target instanceof Element ? event.target : undefined
      const row = target?.closest<HTMLElement>('.agenda-row')
      // A read-only row has no input blur handler. Leaving its row surface must still end
      // Replace, just as blur to an outside control does when an editor owns focus.
      if (caretProjection.current.mode === 'replace' && document.activeElement?.matches('.agenda-row') && !row) {
        takeReplaceClick(vimSession.current)
        changeVimMode('normal')
      }
      if (
        caretProjection.current.mode === 'replace' &&
        !shortcuts.isContextMenuClick(event) &&
        row !== undefined &&
        row !== null &&
        !target?.closest('.node-input, button, a[href]')
      ) {
        // Row surfaces can replace an editor during selection, before it receives blur. Resolve
        // its buffer here and keep the click intent through focus changes to read-only rows.
        // Defer native focus until the row's click selects it; focusing on press could unmount
        // the pressed row and send its release to the list instead of the destination row.
        event.preventDefault()
        finishVimReplace(undefined, false, true)
        beginReplaceClick(vimSession.current, row.dataset.agendaKey)
      }
      const input = document.activeElement
      if (!(input instanceof HTMLElement) || event.shiftKey || caretProjection.current.mode !== 'normal') return
      if (!(event.target instanceof Node) || !input.contains(event.target)) return
      if (![...inputs.current.values()].includes(input) || hasMultiCharacterSelection(input)) return
      setCaret(input, getCaret(input))
    }
    const onRelease = (event: Event): void => {
      if (
        event.type === 'blur' &&
        caretProjection.current.mode === 'replace' &&
        document.activeElement?.matches('.agenda-row')
      ) {
        takeReplaceClick(vimSession.current)
        changeVimMode('normal')
      }
      const target = event.target instanceof Element ? event.target : undefined
      const agendaPressedKey = vimSession.current.replaceClickAgendaKey
      const agendaClick =
        event.type === 'pointerup' &&
        agendaPressedKey !== undefined &&
        target?.closest<HTMLElement>('.agenda-row')?.dataset.agendaKey === agendaPressedKey
      // The input's mouseup follows this event in the same task; a release it never receives
      // (outside any input, a cancelled pointer, a lost window) must not leave the click pending.
      globalThis.setTimeout(() => {
        const moved = vimSession.current.replaceClickMoved === true
        if (!takeReplaceClick(vimSession.current) || caretProjection.current.mode !== 'replace') return
        if (!agendaClick) {
          if (moved) changeVimMode('normal')
          return
        }
        const input = document.activeElement
        const entry = [...inputs.current.entries()].find(([, candidate]) => candidate === input)
        if (entry === undefined) return // A read-only row retains the mode without an edit session.
        const [nodeId, editor] = entry
        const baseline = editor instanceof HTMLTextAreaElement ? editor.value : readEditableContent(editor).text
        beginReplaceSession(vimSession.current, { nodeId, baseline, position: getCaret(editor) })
      })
      if (!pressed) return
      pressed = false
      const input = document.activeElement
      if (input instanceof HTMLElement && [...inputs.current.values()].includes(input)) redraw(input)
    }
    document.addEventListener('pointerdown', onPress, true)
    globalThis.addEventListener('pointerup', onRelease, true)
    globalThis.addEventListener('pointercancel', onRelease, true)
    // A release outside an inactive window never arrives, so losing focus also ends the press.
    globalThis.addEventListener('blur', onRelease)
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
            if (pressed) return
            for (const entry of entries) redraw(entry.target as HTMLElement)
          })
    normalCaretResizeObserver.current = observer
    for (const input of inputs.current.values()) observer?.observe(input)
    return () => {
      observer?.disconnect()
      document.removeEventListener('pointerdown', onPress, true)
      globalThis.removeEventListener('pointerup', onRelease, true)
      globalThis.removeEventListener('pointercancel', onRelease, true)
      globalThis.removeEventListener('blur', onRelease)
      normalCaretResizeObserver.current = undefined
    }
  }, [changeVimMode, finishVimReplace, shortcuts])

  const bindings = useCallback(
    (node: TreeNode): NodeInputBindings =>
      decorateCompletionBindings(node, {
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
        ...createTextEditHandlers(
          {
            store,
            composing,
            pendingLinkDraft,
            schedulePendingCaret,
            getMode: () => caretProjection.current.mode,
            session: vimSession.current,
            commandState: vimCommandState.current,
            finishVimReplace,
            setComposing,
          },
          node,
        ),
        ...createPointerHandlers(
          {
            store,
            capturePasteClipboard,
            selectedNodeId,
            persistenceLocked,
            vimMode,
            commandState: vimCommandState.current,
            session: vimSession.current,
            vimTextCommandState,
            getMode: () => caretProjection.current.mode,
            getInput: (id) => inputs.current.get(id),
            readAuthority: () => caretProjection.current.authority,
            applyCaretState,
            changeVimMode,
            finishVimInsert,
            finishVimReplace,
            setSelectAllNodeId,
            shortcuts,
          },
          node,
        ),
        onKeyDown: createEditorKeyDownHandler({
          store,
          shortcuts,
          nativePaste: capturePasteClipboard !== undefined,
          node,
          isComposing: () => composing,
          setSelectAllNodeId,
          onPreviewAttachment,
          shiftFocusedNode: (direction, selection, cursor) => {
            if (store.shiftNodeVisual(direction, node.id, node.id, 1, cursor, true))
              schedulePendingVisualSelection({ nodeId: node.id, start: selection.start, end: selection.end })
          },
          vim: !vimEnabled
            ? undefined
            : createVimKeyboardState(
                {
                  store,
                  vimMode,
                  registerHandle,
                  commandState: vimCommandState.current,
                  session: vimSession.current,
                  readAuthority: () => caretProjection.current.authority,
                  finishVimInsert,
                  finishVimReplace,
                  applyCaretState,
                  moveVimViewport,
                  revealVerticalCaret,
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
      }),
    [
      decorateCompletionBindings,
      capturePasteClipboard,
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
      revealVerticalCaret,
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
      shortcuts,
    ],
  )

  const setVimEditing = useCallback(
    (enabled: boolean): void => {
      sessionFinish.switchVimEditing(
        {
          store,
          getInput: (id) => inputs.current.get(id),
          readAuthority: () => caretProjection.current.authority,
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

  return {
    restoreSearchFocus: () => {
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      if (state.agenda !== undefined) {
        const row = document.querySelector<HTMLElement>(
          `.agenda-row[data-agenda-key="${CSS.escape(state.agenda.selectedKey)}"]`,
        )
        if (row !== null && row.querySelector('.node-input') === null) {
          row.focus({ preventScroll: true })
          return
        }
      }
      const id = state.location.selectedNodeId
      const input = inputs.current.get(id)
      if (input === undefined) return
      input.focus({ preventScroll: true })
      const authority = caretProjection.current.authority
      if (authority.nodeId === id) applyCaretState(id, authority.caret)
    },
    bindings,
    dragFreeze,
    setVimEditing,
    vimTextCommandState,
    completionPopup: completion.presentation,
    acceptCompletion: completion.accept,
  }
}
