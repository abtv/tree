import {
  replaceClickAgendaKey,
  replaceClickMoved,
  resolveReplaceCommit,
  settleReplaceClick,
  beginReplaceClick,
  createVimEditSessionState,
  takeReplaceClick,
} from './vim-edit-session'
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { EditorStore, FocusIntent, NodeVisualCommand } from '../application/editor-store'
import { requireNode, type LinkRange, type TreeNode } from '../domain/document'
import { moveCharacterOffset } from '../domain/text-characters'
import type { NodeVisualSelection, PendingCaret, PendingVisualSelection } from './node-input-types'
import {
  collapseSelectionToAnchor,
  hasMultiCharacterSelection,
  nodeText,
  getCaret,
  getPointerSelectionEndpoints,
  getSelectionEndpoints,
  getSelectionRange,
  readEditableContent,
  hasAttachmentCharacter,
  isCollapsedSelection,
  setCaret,
  setNormalCaret,
  isSelectionWithin,
  setSelectionRange,
  textAreaOffsetAtPoint,
  textCellAtPoint,
  updateDateLikeUnderline,
  updateSelectedLinks,
} from './editor-dom'
import { keepsEditorFocusOnPress } from './blank-press-focus'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import type { VimTextCommandState } from './vim-session-finish'
import { freezeCaret, releaseCaret, type CaretFreeze, type NodeDragCaretFreeze } from './drag-caret-freeze'
import { normalCaretTarget } from './link-caret'
import {
  characterCaretTransition,
  pointerCaretTransition,
  pointerCellTransition,
  pointerSelectionTransition,
} from './vim-caret-transition'
import { revealInViewport } from './scroll-viewport'
import { createViewportReveal } from './viewport-reveal'
import { moveViewportSelection } from './vim-viewport-motion'
import type { VimFoldCommand, VimRegister, VimStructuralChange, VimViewportMotion } from './vim-keyboard-types'
import {
  clearCommandAssembly,
  clearVisualRange,
  createVimCommandState,
  followVisualRange,
  setVisualRange,
  type VimCommandState,
} from './vim-command-state'
import type { NodeInputBindings } from './NodeInput'
import type { VimMode } from './vim-editing'
import { focusCaretTransition, type VimCaretState } from './vim-caret-transition'
import { repeatStructural as replayStructural } from './vim-structural-repeat'
import * as nodeVisualCommands from './vim-node-visual-commands'
import * as sessionFinish from './vim-session-finish'
import { currentPendingCaretInput, normalCaretIsDrawn } from './caret-projection-rules'
import { CaretProjectionState } from './caret-projection-state'
import { SearchFocusController } from './search-focus-controller'
import { createVimKeyboardState } from './vim-keyboard-state'
import { createPointerHandlers } from './node-input-pointer-handlers'
import { createTextEditHandlers } from './node-input-text-handlers'
import { useCompletion } from './use-completion'
import { EditorComposition } from './editor-composition'
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

interface HeldTextPress {
  input: HTMLElement
  ordinary: boolean
  extending: boolean
  pressOffset: number | undefined
  /**
   * The character under a single, unmodified press in Normal or character Visual mode, which
   * decides the mode and range by Vim's cell rule; a multi-click or `Shift` press leaves it
   * undefined and keeps the native selection's word, line or extension.
   */
  pressCell: number | undefined
  /** The native drag's anchor boundary: the press's own, then the last one written, which Chromium keeps. */
  anchorBoundary: number | undefined
  point: { x: number; y: number }
  followedMode: 'normal' | 'visual' | undefined
}

export interface NodeInputBindingsResult {
  readSearchCaret: () => number
  restoreSearchFocus: () => void
  completionPopup: CompletionPopupPresentation | undefined
  acceptCompletion: (index: number) => void
  isEditorComposing: (target: EventTarget | null) => boolean
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
  const searchFocus = useMemo(
    () =>
      new SearchFocusController(() => ({
        draft: store.search.session.getSnapshot().draft !== undefined,
        searchFocused: document.activeElement?.matches('.search-input-line input') === true,
      })),
    [store],
  )
  const pendingLinkDraft = useRef<{ nodeId: string; range: LinkRange } | undefined>(undefined)
  const [composition] = useState(() => new EditorComposition())
  const [, requestProjectionCommit] = useReducer((revision: number) => revision + 1, 0)
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
  // While the primary button is held on a node editor, the native press owns that editor's
  // selection: it places the caret at the press and extends it as the pointer drags. A Normal block
  // caret drawn there by a focus or caret pass during the press would become the drag's anchor, so
  // the release draws it instead. `ordinary` marks a mouse press without Command, Control or Option,
  // whose selection decides between Normal and character Visual mode (docs/PRODUCT.md §20.2.6): the
  // mode follows it while the press is held, and the release settles it. `extending` marks a Shift
  // press, `pressOffset` is a text area's offset under the press, and `point` is where the pointer
  // was last seen. `followedMode` is the mode the held press last followed its selection into; a
  // press that never settles ends a Visual mode it followed.
  const heldTextPress = useRef<HeldTextPress | undefined>(undefined)

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
    composition,
    shortcuts,
  )
  const decorateCompletionBindings = completion.decorate

  // The one writer of the renderer Vim mode. Character Visual mode and its range end together, so
  // every transition out of `'visual'` clears the range here (docs/PRODUCT.md §20.2.20).
  const changeVimMode = useCallback(
    (mode: VimMode): void => {
      if (mode !== 'visual') clearVisualRange(vimCommandState.current)
      caretProjection.current.changeMode(mode)
      setVimMode(mode)
    },
    [setVimMode],
  )

  // Character Visual mode needs a selection. A press that ends without its release (a node drag, a
  // cancelled pointer, a lost window, a context menu or a press that takes over) selects nothing for
  // Vim, so it ends a Visual mode it followed; a press that began in Visual mode left it when it
  // replaced the old range (docs/PRODUCT.md §20.2.6).
  const endFollowedVisual = useCallback(
    (pressed: HeldTextPress | undefined = heldTextPress.current): void => {
      const followed = pressed?.followedMode
      if (pressed === undefined || followed === undefined) return
      pressed.followedMode = undefined
      // A command that changed the mode during the press keeps its own result.
      if (followed !== 'visual' || caretProjection.current.mode !== 'visual') return
      clearVisualRange(vimCommandState.current)
      changeVimMode('normal')
    },
    [changeVimMode],
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
      if (
        searchFocus.canProjectCaret() &&
        timing !== 'after-edit' &&
        input?.isConnected &&
        heldTextPress.current?.input !== input
      )
        setNormalCaret(input, caret.cursor)
    },
    [store, setImageCaretNodeId, searchFocus],
  )

  // The caret authority suspends the captured caret while a node drag freezes the text surface and
  // restores it when the frozen pointer is released, even if the release lands outside the list
  // (for example after Escape already ended the visual freeze).
  const beginFrozenCaret = useCallback(
    (nodeId: string, pointerId: number): void => {
      // A press held long enough to move the node is a drag, not a text click (PRODUCT §20.2.6),
      // so the blur below must end Replace mode as before. The drag clears the text selection
      // (PRODUCT §11), and character Visual mode cannot outlive its selection, so it ends for Normal
      // mode however the drag began (PRODUCT §20.2.8).
      takeReplaceClick(vimSession.current)
      endFollowedVisual()
      const endsVisual = caretProjection.current.mode === 'visual'
      const visualFocus = vimCommandState.current.visualFocus
      if (endsVisual) {
        clearVisualRange(vimCommandState.current)
        changeVimMode('normal')
      }
      const existing = frozenCaret.current
      if (existing !== undefined && existing.pointerId === pointerId) return
      if (existing !== undefined) {
        clearFrozenPointerListener()
        frozenCaret.current = undefined
      }
      const input = inputs.current.get(nodeId)
      if (input === undefined || document.activeElement !== input) {
        // A press on a row's blank area keeps another editor's focus (PRODUCT §20) until the hold
        // becomes a drag. The drag then finishes that editor's buffered session through its blur, as
        // the press used to, and gives focus back, so a cancelled drag leaves the editor usable.
        const active = document.activeElement
        const activeId = [...inputs.current.entries()].find(([, candidate]) => candidate === active)?.[0]
        if (active instanceof HTMLElement && activeId !== undefined) {
          active.blur()
          active.focus({ preventScroll: true })
          // The drag clears the editor's Visual range as well: Normal mode draws its block at the
          // active Visual end, as Escape would.
          if (endsVisual) applyCaretState(activeId, { cursor: visualFocus ?? getCaret(active), imageActive: false })
        }
        return
      }
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
    [applyCaretState, changeVimMode, clearFrozenPointerListener, releaseFrozenCaret, endFollowedVisual],
  )

  useEffect(
    () => () => {
      frozenCaret.current = undefined
      clearFrozenPointerListener()
    },
    [clearFrozenPointerListener],
  )

  const finishStructuralInsert = useCallback((input: HTMLElement): void => {
    sessionFinish.finishStructuralInsertSession({ commandState: vimCommandState.current }, input)
  }, [])

  const revealVerticalCaret = useCallback(
    (visual?: { nodeId: string; cursor: number }): void => {
      const projection = caretProjection.current
      const nodeId = visual?.nodeId ?? projection.authority.nodeId
      const caret = visual === undefined ? projection.authority.caret : { cursor: visual.cursor, imageActive: false }
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
          projection.mode === (visual === undefined ? 'normal' : 'visual') &&
          (visual === undefined || vimCommandState.current.visualFocus === visual.cursor)
        )
      }
      if (caret.imageActive) {
        const input = inputs.current.get(nodeId)
        if (input !== undefined) viewportReveal.begin(input.closest('.node-row') ?? input, true, isCurrent)
      } else viewportReveal.beginLine(() => inputs.current.get(nodeId), caret.cursor, isCurrent)
    },
    [store, viewportReveal],
  )

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
      nodeVisual: { exit: () => setNodeVisualSelection(undefined) },
      register: registerHandle,
      getCaretState: (nodeId, cursor, imageActive) =>
        caretProjection.current.authority.nodeId === nodeId
          ? { ...caretProjection.current.authority.caret, cursor }
          : { cursor, imageActive },
      applyCaretState,
      revealVerticalCaret,
      setMode: changeVimMode,
    }),
    [
      finishVimReplace,
      finishVimInsert,
      changeVimMode,
      vimCommandState,
      registerHandle,
      applyCaretState,
      revealVerticalCaret,
      setNodeVisualSelection,
    ],
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
    // A ref can detach and reattach on the same render. Only retire a composition
    // whose element is gone after React has finished committing the input tree.
    composition.releaseDetached()
    const projection = caretProjection.current
    const changes = projection.beginCommit(focus, vimMode)
    // One commit pipeline owns precedence: authority, mode, focus, Visual restoration,
    // pending placement, decoration, then completion. Unrelated commits skip focus/mode work.
    if (focus !== undefined && focus.token !== projection.syncedFocusToken) syncImageCaretToFocus()
    const focusedInput = focus === undefined ? undefined : inputs.current.get(focus.nodeId)
    // A node drag freezes its editor with the selection cleared (docs/PRODUCT.md §11); its release
    // restores the caret, so a mode change during the drag leaves the frozen editor alone.
    const frozen = focus !== undefined && frozenCaret.current?.nodeId === focus.nodeId
    if (searchFocus.canProjectCaret() && changes.modeChanged && focusedInput !== undefined && !frozen) {
      if (vimMode === 'normal') {
        // Cmd+A's deliberate selection survives the transition to Normal, and a held press keeps its own.
        if (!hasMultiCharacterSelection(focusedInput) && heldTextPress.current?.input !== focusedInput)
          setNormalCaret(focusedInput, getCaret(focusedInput))
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
      const origin = store.getSnapshot()
      const isCurrent = (): boolean => {
        const state = store.getSnapshot()
        return state.status === 'ready' && state.focus?.token === focus.token
      }
      if (!viewportReveal.hasLine()) viewportReveal.cancel()
      const applyFocus = (firstPass = false): void => {
        if (!searchFocus.canProjectFocus()) return
        const input = inputs.current.get(focus.nodeId)
        if (input === undefined) return
        // Suppress native scrolling; the reveal policy decides how far to scroll.
        const keepSearchFocus = searchFocus.keepsSearchFocus()
        if (!keepSearchFocus) input.focus({ preventScroll: true })
        if (!preserve) {
          const row = input.closest('.node-row, .agenda-row') ?? input
          if (firstPass && focus.revealLine === true) {
            const destination = () => inputs.current.get(focus.nodeId)
            if (origin.status === 'ready' && origin.agenda === undefined) {
              const isFindCurrent = (): boolean => {
                const state = store.getSnapshot()
                return (
                  state.status === 'ready' &&
                  state.document === origin.document &&
                  state.focus.token === focus.token &&
                  projection.isCurrentFocusWork(work)
                )
              }
              viewportReveal.beginLine(destination, focus.cursor, isFindCurrent, { wholeRowIfFits: true, keepContext })
            } else viewportReveal.beginLine(destination, focus.cursor, isCurrent)
          } else if (firstPass && focus.returnRowTop !== undefined)
            viewportReveal.beginAt(row, focus.returnRowTop, isCurrent)
          else if (viewportReveal.hasLine()) viewportReveal.correct()
          else if (restoring) {
            // Session restoration owns startup alignment and its asynchronous geometry until input.
            if (firstPass) revealInViewport(row, keepContext)
          } else if (firstPass) viewportReveal.begin(row, keepContext, isCurrent)
          else viewportReveal.correct()
        }
        searchFocus.completeFocusProjection(focus, keepSearchFocus)
        if (keepSearchFocus) return
        if (projection.mode === 'normal') {
          // Vertical navigation can resolve an image while focus carries the originating text column.
          const authority = projection.authority
          const cursor = authority.nodeId === focus.nodeId ? authority.caret.cursor : focus.cursor
          const target = normalCaretTarget(nodeText(input), cursor, hasAttachmentCharacter(input))
          // A press that moved focus here owns the selection; its release draws the block.
          if (!normalCaretIsDrawn(input, target) && heldTextPress.current?.input !== input)
            setNormalCaret(input, cursor)
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
      if (input !== undefined && searchFocus.canProjectFocus()) {
        if (pending.refocus === true && input.ownerDocument.activeElement !== input)
          input.focus({ preventScroll: pending.retainedSelection !== undefined })
        if (pending.restoredCaret !== undefined) {
          projection.restoreDrag(
            pending.nodeId,
            pending.restoredCaret,
            state.status === 'ready' ? state.focus?.token : undefined,
          )
          setImageCaretNodeId(pending.restoredCaret.imageActive ? pending.nodeId : undefined)
          if (vimMode === 'normal') setNormalCaret(input, pending.cursor)
          else setCaret(input, pending.cursor)
        } else if (pending.retainedSelection !== undefined) {
          const { anchor, focus: selectionFocus } = pending.retainedSelection
          setSelectionRange(input, anchor, selectionFocus)
        } else if (pending.normal) {
          if (heldTextPress.current?.input !== input) setNormalCaret(input, pending.cursor)
        } else if (vimMode !== 'normal') setCaret(input, pending.cursor)
      }
    }

    // Character Visual mode never outlives its range or the node editor that owns it. A path that
    // reached another node, or lost the range, without leaving the mode ends it here, at the one
    // projection point, rather than showing Visual mode with nothing selected (docs/PRODUCT.md §20.2.6).
    const active = document.activeElement
    if (projection.mode === 'visual' && active instanceof HTMLElement) {
      const activeNodeId = [...inputs.current.entries()].find(([, candidate]) => candidate === active)?.[0]
      const range = vimCommandState.current
      if (activeNodeId !== undefined && (range.visualAnchor === undefined || range.visualNodeId !== activeNodeId))
        changeVimMode('normal')
    }

    // React can replace a class or underline span without emitting selectionchange.
    if (active instanceof HTMLElement && active.classList.contains('node-input')) {
      active.classList.toggle('node-input-text-selected', hasMultiCharacterSelection(active))
      // Re-rendered text replaces the underline spans, so the caret rule is applied again after a commit.
      if (!(active instanceof HTMLTextAreaElement)) updateDateLikeUnderline(active)
    }
    completion.reconcile()
  })

  useEffect(() => {
    let drafting = store.search.session.getSnapshot().draft !== undefined
    return store.search.subscribe(() => {
      const draft = store.search.session.getSnapshot().draft !== undefined
      const opening = draft && !drafting
      drafting = draft
      if (!opening) return
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      const input = inputs.current.get(state.location.selectedNodeId)
      // Capture before query decoration can replace the editor or its text nodes.
      if (input !== undefined && document.activeElement === input)
        searchFocus.borrowSelection(state.focus, getSelectionEndpoints(input))
    })
  }, [store, searchFocus])

  useEffect(() => {
    const releaseSearchFocus = (event: FocusEvent): void => {
      if (event.target instanceof Element && event.target.matches('.node-input, .agenda-row'))
        searchFocus.editorFocused()
    }
    document.addEventListener('focusin', releaseSearchFocus)
    return () => document.removeEventListener('focusin', releaseSearchFocus)
  }, [searchFocus])

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
    let pointerPhase: 'held' | 'released' = 'released'
    let textPress: { key: string; down: PointerEvent } | undefined
    const gestureSession = vimSession.current
    let settlementTimer: ReturnType<typeof globalThis.setTimeout> | undefined
    // The pointer that holds the press. Another pointer's press or release, such as a finger lifted
    // from a touch screen during a mouse drag, leaves that press alone. A mouse press, or a new
    // primary pointer of the held pointer's type, proves that the earlier press ended even if its
    // release was lost, so it takes over.
    let heldPointer: { id: number; type: string } | undefined
    const pointerIdOf = (event: Event): number | undefined =>
      'pointerId' in event ? (event as PointerEvent).pointerId : undefined
    const onPress = (event: PointerEvent): void => {
      if (event.button !== 0) return
      if (
        pointerPhase === 'held' &&
        heldPointer !== undefined &&
        event.pointerId !== heldPointer.id &&
        event.pointerType !== 'mouse' &&
        !(event.isPrimary && event.pointerType === heldPointer.type)
      )
        return
      // A press that takes over from one whose release was lost ends that press without settling it.
      endFollowedVisual()
      pointerPhase = 'held'
      heldPointer = { id: event.pointerId, type: event.pointerType }
      const pressedNode = event.target instanceof Node ? event.target : undefined
      const pressedInput =
        pressedNode === undefined
          ? undefined
          : [...inputs.current.values()].find((candidate) => candidate.contains(pressedNode))
      const ordinary = event.pointerType === 'mouse' && !event.metaKey && !event.ctrlKey && !event.altKey
      const pressMode = caretProjection.current.mode
      heldTextPress.current =
        pressedInput === undefined
          ? undefined
          : {
              input: pressedInput,
              ordinary,
              extending: event.shiftKey,
              // Read before the native press moves the caret: a text area reports no drag direction.
              pressOffset:
                pressedInput instanceof HTMLTextAreaElement
                  ? textAreaOffsetAtPoint(pressedInput, event.clientX, event.clientY)
                  : undefined,
              // Measured before the native press moves the caret to the boundary nearest the pointer.
              // A press in whole-node Visual mode is measured too: its release ends that mode and then
              // settles as a click in Normal mode.
              pressCell:
                ordinary &&
                !event.shiftKey &&
                (pressMode === 'normal' || pressMode === 'visual' || pressMode === 'visual-node')
                  ? textCellAtPoint(pressedInput, event.clientX, event.clientY)
                  : undefined,
              anchorBoundary: undefined,
              point: { x: event.clientX, y: event.clientY },
              followedMode: undefined,
            }
      // A cell press replaces a character Visual selection at once, so a press that then ends without
      // a release or a move, such as a cancelled pointer, never leaves Visual mode without a range.
      if (heldTextPress.current?.pressCell !== undefined && pressMode === 'visual') changeVimMode('normal')
      const target = event.target instanceof Element ? event.target : undefined
      const row = target?.closest<HTMLElement>('.agenda-row')
      const key = row?.dataset.agendaKey
      textPress =
        caretProjection.current.mode === 'replace' && key && target?.closest('.node-input')
          ? { key, down: event }
          : undefined
      // A read-only row has no input blur handler. Leaving its row surface must still end
      // Replace, just as blur to an outside control does when an editor owns focus. A blank press
      // keeps the row's focus, and with it Replace, as it keeps an editor's.
      if (
        caretProjection.current.mode === 'replace' &&
        document.activeElement?.matches('.agenda-row') &&
        !row &&
        !target?.closest('[data-editor-focus-borrow]') &&
        !keepsEditorFocusOnPress(event, document.activeElement)
      ) {
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
      const mode = caretProjection.current.mode
      if (!(input instanceof HTMLElement) || event.shiftKey || (mode !== 'normal' && mode !== 'visual')) return
      if (!(event.target instanceof Node) || !input.contains(event.target)) return
      if (![...inputs.current.values()].includes(input)) return
      // An ordinary press starts a new selection, as in Vim, rather than a native drag of a Visual or
      // Cmd+A range, which Chromium would collapse only after the release that settles the mode. A
      // modified press keeps such a range for its own action.
      if ((mode === 'visual' || hasMultiCharacterSelection(input)) && heldTextPress.current?.ordinary !== true) return
      setCaret(input, getCaret(input))
    }
    // A double or triple click selects a word or a line natively, as Vim's do, so it leaves the
    // cell rule for the native selection.
    const onMouseDown = (event: MouseEvent): void => {
      const pressed = heldTextPress.current
      if (pressed !== undefined && event.detail >= 2) pressed.pressCell = undefined
    }
    // A Control-click opens a native menu that can swallow the release, so the press stops owning
    // the selection here; otherwise later keyboard motions would draw no block caret.
    const onContextMenu = (): void => {
      endFollowedVisual()
      heldTextPress.current = undefined
    }
    const heldEndpoints = (pressed: HeldTextPress): { anchor: number; focus: number } =>
      getPointerSelectionEndpoints(pressed.input, {
        ...pressed.point,
        extending: pressed.extending,
        pressOffset: pressed.pressOffset,
      })
    /**
     * A single press decides by the characters under the press and the pointer, as Vim does, not by
     * the boundary nearest the pointer (PRODUCT §20.2.6). Chromium keeps an anchor written into the
     * drag it is extending as its base, so the pressed character stays selected in either direction;
     * it recomputes the moving end on every move, so only the release writes that end, which can lag
     * one character behind the pointer until then. The command-state range is always exact.
     */
    // The boundary the native press anchored its drag at: a text area reports no direction, so the
    // offset under the press, read before the press, names it.
    const pressBoundary = (pressed: HeldTextPress): number =>
      pressed.input instanceof HTMLTextAreaElement
        ? (pressed.pressOffset ?? pressed.input.selectionStart)
        : getSelectionEndpoints(pressed.input).anchor
    const settleCellPress = (pressed: HeldTextPress, nodeId: string, target: TreeNode, released: boolean): void => {
      const input = pressed.input
      const mode = caretProjection.current.mode
      const next = pointerCellTransition(
        target.text,
        pressed.pressCell!,
        textCellAtPoint(input, pressed.point.x, pressed.point.y),
      )
      if (released) {
        if (next.mode === 'visual') setSelectionRange(input, next.anchorBoundary, next.focusBoundary)
      } else {
        pressed.followedMode = next.mode
        const nativeBase = pressed.anchorBoundary ?? pressBoundary(pressed)
        pressed.anchorBoundary = nativeBase
        // The anchor is written only where the native press chose another boundary, always with a
        // selected character after it, because Chromium turns a drag whose selection was rewritten as
        // a caret into a caret move, and only once the native drag has extended a selection. Before
        // that, Chromium has not yet chosen between extending and dragging a selection: a written
        // selection under the press would make it drag that text and cancel the pointer.
        const focus =
          next.mode === 'visual' ? next.focusBoundary : moveCharacterOffset(target.text, next.anchorBoundary, 1)
        const extending =
          input instanceof HTMLTextAreaElement ? input.selectionStart !== input.selectionEnd : !isCollapsedSelection()
        if (nativeBase !== next.anchorBoundary && focus !== next.anchorBoundary && extending) {
          setSelectionRange(input, next.anchorBoundary, focus)
          pressed.anchorBoundary = next.anchorBoundary
        }
      }
      const caretAt = (cursor: number): VimCaretState =>
        pointerCaretTransition(
          caretProjection.current.authority.caret,
          cursor,
          target.text.length,
          target.attachment !== undefined,
        )
      if (next.mode === 'normal') {
        if (mode === 'visual') changeVimMode('normal')
        // The block is drawn on the pressed character, not at the boundary the native press chose.
        if (released) applyCaretState(nodeId, caretAt(next.cursor))
        return
      }
      applyCaretState(nodeId, caretAt(next.focus), false, 'preserve-selection')
      if (released) setVisualRange(vimCommandState.current, nodeId, next.anchor, next.focus, target.text.length > 0)
      else followVisualRange(vimCommandState.current, nodeId, next.anchor, next.focus)
      changeVimMode('visual')
    }
    /**
     * An ordinary text press leaves character Visual mode for a selection and Normal mode for a caret.
     * The mode follows the selection while the press is held, as Vim's does during a drag, and the
     * release settles it.
     */
    const settlePointerSelection = (pressed: HeldTextPress, released: boolean): void => {
      const input = pressed.input
      const mode = caretProjection.current.mode
      if (mode !== 'normal' && mode !== 'visual') return
      const nodeId = [...inputs.current.entries()].find(([, candidate]) => candidate === input)?.[0]
      const state = store.getSnapshot()
      if (nodeId === undefined || state.status !== 'ready') return

      const target = requireNode(state.document, nodeId).node
      if (pressed.pressCell !== undefined) {
        settleCellPress(pressed, nodeId, target, released)
        return
      }
      const endpoints = heldEndpoints(pressed)
      // A drag that left a browser rich field also selected other nodes. The release keeps the range
      // within this node, so the mode, the highlight and the commands all use the same text; a
      // rewrite before it would reset the native drag.
      if (released && !isSelectionWithin(input)) setSelectionRange(input, endpoints.anchor, endpoints.focus)
      const next = pointerSelectionTransition(target.text, endpoints)
      if (!released) pressed.followedMode = next.mode
      if (next.mode === 'normal') {
        if (mode !== 'visual') return
        clearVisualRange(vimCommandState.current)
        changeVimMode('normal')
        return
      }
      applyCaretState(
        nodeId,
        pointerCaretTransition(
          caretProjection.current.authority.caret,
          next.focus,
          target.text.length,
          target.attachment !== undefined,
        ),
        false,
        'preserve-selection',
      )
      // The release remembers the selection for `gv`; a press that never settles leaves that memory alone.
      if (released) setVisualRange(vimCommandState.current, nodeId, next.anchor, next.focus, target.text.length > 0)
      else followVisualRange(vimCommandState.current, nodeId, next.anchor, next.focus)
      changeVimMode('visual')
    }
    const holdsPressedEditor = (pressed: HeldTextPress | undefined): pressed is HeldTextPress =>
      pressed?.ordinary === true && pressed.input === document.activeElement
    const onMove = (event: PointerEvent): void => {
      const pressed = heldTextPress.current
      if (pressed === undefined || pointerPhase !== 'held' || event.pointerId !== heldPointer?.id) return
      pressed.point = { x: event.clientX, y: event.clientY }
      // A cell press follows the pointer itself: the character under it can change while the native
      // selection stays the same, and a write here precedes the native extension that keeps it.
      if (pressed.pressCell !== undefined && holdsPressedEditor(pressed)) settlePointerSelection(pressed, false)
    }
    // The native press extends the selection after its move event, so the selection change, not the
    // move, is when a held native press has a new selection to follow.
    const onSelectionChange = (): void => {
      const pressed = heldTextPress.current
      // A cell press follows it too: the first extension is when its anchor can be written safely.
      if (pointerPhase === 'held' && holdsPressedEditor(pressed)) settlePointerSelection(pressed, false)
    }
    // A Visual command typed while the press is still held reads the native selection. A range that
    // left a browser rich field is therefore kept within the pressed node before the key is handled,
    // as the release would keep it; the key gives up the native drag.
    const onKeyDown = (event: KeyboardEvent): void => {
      const pressed = heldTextPress.current
      if (
        pointerPhase !== 'held' ||
        !holdsPressedEditor(pressed) ||
        ['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)
      )
        return
      if (pressed.pressCell !== undefined) {
        // The key gives up the press: its command may edit the text or change the mode, so neither a
        // later move nor the release settles the press again. The moving end of the native drag can
        // lag the range, so the exact range is written first for a native command that reads it.
        heldTextPress.current = undefined
        if (pressed.followedMode !== 'visual') {
          // A still press is a click on the pressed character, so the key acts there, as after a click.
          const nodeId = [...inputs.current.entries()].find(([, candidate]) => candidate === pressed.input)?.[0]
          const state = store.getSnapshot()
          if (nodeId === undefined || state.status !== 'ready' || caretProjection.current.mode !== 'normal') return
          const target = requireNode(state.document, nodeId).node
          applyCaretState(
            nodeId,
            pointerCaretTransition(
              caretProjection.current.authority.caret,
              pressed.pressCell,
              target.text.length,
              target.attachment !== undefined,
            ),
          )
          return
        }
        const next = pointerCellTransition(
          nodeText(pressed.input),
          pressed.pressCell,
          textCellAtPoint(pressed.input, pressed.point.x, pressed.point.y),
        )
        if (next.mode === 'visual') setSelectionRange(pressed.input, next.anchorBoundary, next.focusBoundary)
        return
      }
      if (pressed.followedMode !== 'visual') return
      if (isSelectionWithin(pressed.input)) return
      const endpoints = heldEndpoints(pressed)
      setSelectionRange(pressed.input, endpoints.anchor, endpoints.focus)
    }
    const onRelease = (event: Event): void => {
      // Another pointer's release leaves the held press, and its Replace click, in place; losing the
      // window ends any press.
      if (event.type !== 'blur' && pointerPhase === 'held' && pointerIdOf(event) !== heldPointer?.id) return
      if (
        event.type === 'blur' &&
        caretProjection.current.mode === 'replace' &&
        document.activeElement?.matches('.agenda-row')
      ) {
        takeReplaceClick(vimSession.current)
        changeVimMode('normal')
      }
      const target = event.target instanceof Element ? event.target : undefined
      const agendaPressedKey = replaceClickAgendaKey(vimSession.current)
      // A disappearing pinned row can move the pressed editor out from under a stationary
      // pointer. Its release still belongs to that editor if it retained focus and selection.
      const press = textPress
      textPress = undefined
      const focused = document.activeElement
      const focusedRow = focused?.closest<HTMLElement>('.agenda-row')
      if (
        event.type === 'pointerup' &&
        press !== undefined &&
        event instanceof PointerEvent &&
        event.pointerId === press.down.pointerId &&
        event.clientX === press.down.clientX &&
        event.clientY === press.down.clientY &&
        focused instanceof HTMLElement &&
        focused.matches('.node-input') &&
        focusedRow?.dataset.agendaKey === press.key &&
        focusedRow.dataset.nodeId &&
        !focused.contains(target ?? null) &&
        caretProjection.current.mode === 'replace'
      ) {
        const selection = getSelectionRange(focused)
        if (selection.start === selection.end && takeReplaceClick(vimSession.current)) {
          const baseline = focused instanceof HTMLTextAreaElement ? focused.value : readEditableContent(focused).text
          sessionFinish.startVimReplace(store, vimSession.current, {
            nodeId: focusedRow.dataset.nodeId,
            baseline,
            position: selection.start,
          })
        }
      }
      const agendaClick =
        event.type === 'pointerup' &&
        agendaPressedKey !== undefined &&
        target?.closest<HTMLElement>('.agenda-row')?.dataset.agendaKey === agendaPressedKey
      // The input's mouseup follows this event in the same task; a release it never receives
      // (outside any input, a cancelled pointer, a lost window) must not leave the click pending.
      const identity = settleReplaceClick(vimSession.current)
      if (identity !== undefined) {
        globalThis.clearTimeout(settlementTimer)
        settlementTimer = globalThis.setTimeout(() => {
          settlementTimer = undefined
          const moved = replaceClickMoved(vimSession.current)
          if (!takeReplaceClick(vimSession.current, identity) || caretProjection.current.mode !== 'replace') return
          if (!agendaClick) {
            if (moved) changeVimMode('normal')
            return
          }
          const input = document.activeElement
          const entry = [...inputs.current.entries()].find(([, candidate]) => candidate === input)
          if (entry === undefined) return // A read-only row retains the mode without an edit session.
          const [nodeId, editor] = entry
          const baseline = editor instanceof HTMLTextAreaElement ? editor.value : readEditableContent(editor).text
          sessionFinish.startVimReplace(store, vimSession.current, { nodeId, baseline, position: getCaret(editor) })
        })
      }
      // A node drag blurs the pressed editor, and a cancelled or interrupted press changes no mode.
      const pressed = heldTextPress.current
      heldTextPress.current = undefined
      // A click on node text ends whole-node Visual mode, as a click ends Visual mode in Vim; the
      // release then settles as a press in Normal mode. A press that became a node drag blurred its
      // editor first, so a reorder keeps the mode (PRODUCT §20.2.6, §20.2.8).
      if (
        event.type === 'pointerup' &&
        pressed !== undefined &&
        pressed.input === document.activeElement &&
        caretProjection.current.mode === 'visual-node'
      ) {
        setNodeVisualSelection(undefined)
        clearCommandAssembly(vimCommandState.current)
        changeVimMode('normal')
      }
      if (event instanceof MouseEvent && event.type === 'pointerup' && holdsPressedEditor(pressed)) {
        pressed.point = { x: event.clientX, y: event.clientY }
        settlePointerSelection(pressed, true)
      } else endFollowedVisual(pressed)
      if (pointerPhase !== 'held') return
      pointerPhase = 'released'
      const input = document.activeElement
      if (input instanceof HTMLElement && [...inputs.current.values()].includes(input)) redraw(input)
    }
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('contextmenu', onContextMenu, true)
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('keydown', onKeyDown, true)
    globalThis.addEventListener('pointermove', onMove, true)
    globalThis.addEventListener('pointerup', onRelease, true)
    globalThis.addEventListener('pointercancel', onRelease, true)
    // A release outside an inactive window never arrives, so losing focus also ends the press.
    globalThis.addEventListener('blur', onRelease)
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
            if (pointerPhase === 'held') return
            for (const entry of entries) redraw(entry.target as HTMLElement)
          })
    normalCaretResizeObserver.current = observer
    for (const input of inputs.current.values()) observer?.observe(input)
    return () => {
      globalThis.clearTimeout(settlementTimer)
      takeReplaceClick(gestureSession)
      observer?.disconnect()
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('contextmenu', onContextMenu, true)
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('keydown', onKeyDown, true)
      heldTextPress.current = undefined
      globalThis.removeEventListener('pointermove', onMove, true)
      globalThis.removeEventListener('pointerup', onRelease, true)
      globalThis.removeEventListener('pointercancel', onRelease, true)
      globalThis.removeEventListener('blur', onRelease)
      normalCaretResizeObserver.current = undefined
    }
  }, [applyCaretState, changeVimMode, finishVimReplace, endFollowedVisual, setNodeVisualSelection, shortcuts, store])

  const bindings = useCallback(
    (node: TreeNode): NodeInputBindings =>
      decorateCompletionBindings(node, {
        selectedAll: selectAllNodeId === node.id,
        disabled: persistenceLocked,
        readReplaceDraft: () => {
          const draft = vimSession.current.replace
          return draft?.nodeId === node.id ? resolveReplaceCommit(draft)?.finalText : undefined
        },
        inputRef: (input: HTMLElement | null) => {
          if (input === null) {
            const previous = inputs.current.get(node.id)
            if (previous instanceof HTMLTextAreaElement && previous.ownerDocument.activeElement === previous)
              caretProjection.current.retainInputSelection(node.id, previous, getSelectionEndpoints(previous))
            if (previous !== undefined) normalCaretResizeObserver.current?.unobserve(previous)
            inputs.current.delete(node.id)
          } else {
            inputs.current.set(node.id, input)
            normalCaretResizeObserver.current?.observe(input)
          }
        },
        // A deferred decoration can replace only this local field. Commit through the shared
        // caret pipeline as well so the replacement keeps focus and the native selection.
        onCompositionProjectionChange: requestProjectionCommit,
        ...createTextEditHandlers(
          {
            store,
            composition,
            pendingLinkDraft,
            schedulePendingCaret,
            requestProjectionCommit,
            getMode: () => caretProjection.current.mode,
            session: vimSession.current,
            commandState: vimCommandState.current,
            finishVimReplace,
          },
          node,
        ),
        ...createPointerHandlers(
          {
            store,
            capturePasteClipboard,
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
          isComposing: composition.owns,
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
      composition,
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
    readSearchCaret: () => {
      const input = selectedNodeId === undefined ? undefined : inputs.current.get(selectedNodeId)
      return caretProjection.current.mode === 'insert' && input !== undefined && searchFocus.canReadNativeCaret()
        ? getCaret(input)
        : caretProjection.current.authority.caret.cursor
    },
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
      const deferred = searchFocus.takeRestoration(state.focus, id)
      const selection = searchFocus.takeSelection(state.focus, id)
      input.focus({ preventScroll: true })
      if (deferred !== undefined) {
        if (caretProjection.current.mode === 'normal') applyCaretState(id, caretProjection.current.authority.caret)
        else setCaret(input, deferred.cursor)
      } else if (selection !== undefined) setSelectionRange(input, selection.anchor, selection.focus)
      else if (caretProjection.current.mode !== 'insert') {
        const authority = caretProjection.current.authority
        if (authority.nodeId === id) applyCaretState(id, authority.caret)
      }
      if (caretProjection.current.mode === 'replace' && vimSession.current.replace === undefined) {
        sessionFinish.startVimReplace(store, vimSession.current, {
          nodeId: id,
          baseline: nodeText(input),
          position: getCaret(input),
        })
      }
    },
    bindings,
    dragFreeze,
    setVimEditing,
    isEditorComposing: composition.owns,
    vimTextCommandState,
    completionPopup: completion.presentation,
    acceptCompletion: completion.accept,
  }
}
