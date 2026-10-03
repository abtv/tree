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
import { currentLinkDraft, normalCaretTarget } from './link-caret'
import { revealInViewport, viewportBounds } from './scroll-viewport'
import type { VimFoldCommand, VimRegister, VimStructuralChange, VimViewportMotion } from './vim-keyboard-types'
import {
  beginStructuralChildOpen,
  beginStructuralOpen,
  beginStructuralVisual,
  clearCommandAssembly,
  clearPending,
  createVimCommandState,
  recordRepeatChange,
  setVisualRange,
  structuralRepeatChange,
  swapNodeVisual,
  takeStructuralInsert,
  type VimCommandState,
} from './vim-command-state'
import { isNodeExpanded } from '../application/expansion-state'
import type { NodeInputBindings } from './NodeInput'
import { rememberIncomingNodes, rememberNodeRange, resolveVisualMemory } from './vim-visual-memory'
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
  /**
   * Whether Vim editing is enabled. While it is disabled the renderer Vim mode stays `insert` and
   * keys bypass Vim interpretation entirely, so the editor behaves as a standard text editor.
   */
  vimEnabled: boolean
  vimMode?: VimMode
  setVimMode?: (mode: VimMode) => void
  setImageCaretNodeId?: (nodeId: string | undefined) => void
  nodeVisualSelection?: { anchorId: string; focusId: string } | undefined
  setNodeVisualSelection?: (selection: { anchorId: string; focusId: string } | undefined) => void
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
  const pendingCaret = useRef<
    | {
        nodeId: string
        input?: HTMLElement
        cursor: number
        normal: boolean
        revision: number
        focusToken: number | undefined
      }
    | undefined
  >(undefined)
  const pendingVisualSelection = useRef<
    | { nodeId: string; start: number; end: number; endpoints?: { anchor: number; focus: number; hadText: boolean } }
    | undefined
  >(undefined)
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

  const changeVimMode = useCallback(
    (mode: VimMode): void => {
      if (mode !== latestVimMode.current) {
        const revision = ++caretRevision.current
        const pending = pendingCaret.current
        // A change command schedules its native insertion point before switching mode. Keep
        // that compatible projection while invalidating focus work from the preceding mode.
        pendingCaret.current =
          pending !== undefined && pending.normal === (mode === 'normal') ? { ...pending, revision } : undefined
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

  const restoreVisual = useCallback((): void => {
    const state = store.getSnapshot()
    if (state.status !== 'ready') return
    const restore = resolveVisualMemory(vimCommandState.current.lastVisual, state.document, state.location, (id) =>
      isNodeExpanded(state.expansion, id),
    )
    if (restore === undefined) return
    if (restore.kind === 'nodes') {
      setNodeVisualSelection({ anchorId: restore.anchorId, focusId: restore.focusId })
      store.selectNode(restore.focusId, 0)
      changeVimMode('visual-node')
      syncImageCaretToFocus()
      return
    }
    const start = Math.min(restore.anchor, restore.focus)
    store.selectNode(restore.nodeId, start)
    pendingVisualSelection.current = {
      nodeId: restore.nodeId,
      start,
      end: Math.max(restore.anchor, restore.focus) + 1,
      endpoints: { anchor: restore.anchor, focus: restore.focus, hadText: restore.hadText },
    }
    changeVimMode('visual')
  }, [store, setNodeVisualSelection, changeVimMode, syncImageCaretToFocus])

  const moveNodeVisual = useCallback(
    (direction: 'up' | 'down' | 'first' | 'last', count = 1): void => {
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
            : Math.max(0, Math.min(nodes.length - 1, index + (direction === 'down' ? count : -count)))
      const target = nodes[targetIndex]
      if (target === undefined) return
      setNodeVisualSelection({ ...nodeVisualSelection, focusId: target.id })
      rememberNodeRange(vimCommandState.current, state.document, nodeVisualSelection.anchorId, target.id)
      store.selectNode(target.id, 0)
      syncImageCaretToFocus()
    },
    [store, nodeVisualSelection, setNodeVisualSelection, syncImageCaretToFocus],
  )

  const commandNodeVisual = useCallback(
    (command: NodeVisualCommand, count = 1): void => {
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
      const repeat = command === 'p' || command === 'P' ? count : 1
      const result = store.applyNodeVisual(
        command,
        nodeVisualSelection.anchorId,
        nodeVisualSelection.focusId,
        source,
        '',
        repeat,
      )
      if (result === undefined) return
      const nextRegister = visualCommandRegister(command, result)
      if (nextRegister !== undefined) vimSession.current.register = nextRegister
      if ((command === 'p' || command === 'P') && source !== undefined) {
        // `gv` after a Visual put selects the incoming nodes: the copies start at the selected node.
        const next = store.getSnapshot()
        if (next.status === 'ready')
          rememberIncomingNodes(
            vimCommandState.current,
            next.document,
            next.location.selectedNodeId,
            source.nodes.length * repeat,
          )
      }
      if (command === 'c' || command === 's') {
        beginStructuralVisual(vimCommandState.current, nodeVisualSelection.focusId, command, span)
        changeVimMode('insert')
      } else {
        if (command !== 'y')
          recordRepeatChange(vimCommandState.current, {
            kind: 'structural-visual',
            command,
            span,
            ...(source === undefined ? {} : { source }),
            ...(repeat > 1 ? { repeat } : {}),
          })
        changeVimMode('normal')
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
      changeVimMode,
      syncImageCaretToFocus,
      vimSession,
      vimCommandState,
    ],
  )

  const verticalOperator = useCallback(
    (nodeId: string, operator: 'd' | 'y' | 'c', direction: 'down' | 'up', count: number): void => {
      const state = store.getSnapshot()
      if (state.status !== 'ready' || state.location.currentParentId === nodeId) return
      // The range is the node's own actual siblings, whatever depth it is displayed at, so expanded
      // descendant rows never count as members.
      const located = locateNode(state.document, nodeId)
      if (located === undefined) return
      const edge = Math.max(
        0,
        Math.min(located.siblings.length - 1, located.index + (direction === 'down' ? count : -count)),
      )
      const first = located.siblings[Math.min(located.index, edge)]
      const last = located.siblings[Math.max(located.index, edge)]
      if (first === undefined || last === undefined) return
      const span = Math.abs(located.index - edge) + 1
      const result = store.applyNodeVisual(operator, first.id, last.id)
      if (result === undefined) return
      const nextRegister = visualCommandRegister(operator, result)
      if (nextRegister !== undefined) vimSession.current.register = nextRegister
      if (operator === 'c') {
        beginStructuralVisual(vimCommandState.current, nodeId, 'c', span)
        changeVimMode('insert')
      } else if (operator === 'd') {
        recordRepeatChange(vimCommandState.current, { kind: 'structural-visual', command: 'd', span })
      }
    },
    [store, changeVimMode, vimSession, vimCommandState],
  )

  // Whole-node Visual keeps its endpoint IDs, direction, and mode across `>` and `<`: the moved rows
  // keep their IDs, so only the store changes and the selection state is left alone.
  const shiftNodeVisual = useCallback(
    (direction: 'in' | 'out', count: number): void => {
      if (nodeVisualSelection === undefined) return
      const { anchorId, focusId } = nodeVisualSelection
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      const anchor = locateNode(state.document, anchorId)
      const focus = anchor?.siblings.findIndex((node) => node.id === focusId) ?? -1
      if (anchor === undefined || focus < 0) return
      const span = Math.abs(anchor.index - focus) + 1
      if (store.shiftNodeVisual(direction, anchorId, focusId, count))
        recordRepeatChange(vimCommandState.current, { kind: 'structural-shift', direction, span, count })
    },
    [store, nodeVisualSelection],
  )

  // `J` and `gJ` end whole-node Visual mode only when the join happened; a rejected or impossible
  // join leaves the mode and the selected range alone.
  const joinNodeVisual = useCallback(
    (spaced: boolean): void => {
      if (nodeVisualSelection === undefined) return
      const { anchorId, focusId } = nodeVisualSelection
      const state = store.getSnapshot()
      if (state.status !== 'ready') return
      const anchor = locateNode(state.document, anchorId)
      const focus = anchor?.siblings.findIndex((node) => node.id === focusId) ?? -1
      if (anchor === undefined || focus < 0) return
      const span = Math.abs(anchor.index - focus) + 1
      if (!store.joinNodes({ anchorId, focusId }, spaced)) return
      recordRepeatChange(vimCommandState.current, { kind: 'structural-join', span, spaced })
      changeVimMode('normal')
      syncImageCaretToFocus()
      clearCommandAssembly(vimCommandState.current)
      setNodeVisualSelection(undefined)
    },
    [store, nodeVisualSelection, setNodeVisualSelection, changeVimMode, syncImageCaretToFocus, vimCommandState],
  )

  const shiftCurrentNode = useCallback(
    (nodeId: string, direction: 'in' | 'out', count: number, selection: { start: number; end: number }): void => {
      if (!store.shiftNodeVisual(direction, nodeId, nodeId, count)) return
      recordRepeatChange(vimCommandState.current, { kind: 'structural-shift', direction, span: 1, count })
      // The store's focus intent collapses the caret when the moved row renders; the layout effect
      // below restores the selection once it has.
      pendingVisualSelection.current = { nodeId, ...selection }
    },
    [store],
  )

  const repeatStructural = useCallback(
    (change: VimStructuralChange, cursor: number): boolean => {
      const state = store.getSnapshot()
      if (state.status !== 'ready' || state.persistenceLocked === true) return false
      if (change.kind === 'structural-delete') {
        // The register changes only when the deletion happened (a heading or locked store changes nothing).
        const span = change.span
        const located = locateNode(state.document, state.location.selectedNodeId)
        if (located === undefined || located.siblings.length - located.index < span) return false
        const removed = store.deleteSiblingRange(span)
        if (removed !== undefined)
          vimSession.current.register =
            removed.length === 1
              ? nodeRegister(removed[0]!)
              : { kind: 'nodes', value: { nodes: removed, sourceIds: removed.map((node) => node.id) } }
        return removed !== undefined
      } else if (change.kind === 'structural-open' || change.kind === 'structural-child-open') {
        if (change.kind === 'structural-open') store.createSiblingWithText(change.position, change.text)
        else store.createChildWithText(change.text)
        const next = store.getSnapshot()
        return next.status === 'ready' && next.document !== state.document
      } else if (change.kind === 'structural-put')
        return store.pasteNodeForest(
          state.location.selectedNodeId,
          change.position,
          { nodes: [change.source], sourceIds: change.sourceIds },
          change.repeat ?? 1,
          change.past === true,
        )
      else if (change.kind === 'structural-forest-put')
        return store.pasteNodeForest(
          state.location.selectedNodeId,
          change.position,
          change.source,
          change.repeat ?? 1,
          change.past === true,
        )
      else {
        // A repeated whole-node Visual mutation applies to the current node's own actual siblings.
        const located = locateNode(state.document, state.location.selectedNodeId)
        if (located === undefined || state.location.selectedNodeId === state.location.currentParentId) return false
        const end = located.siblings[located.index + change.span - 1]
        if (end === undefined) return false
        if (change.kind === 'structural-shift')
          return store.shiftNodeVisual(change.direction, located.node.id, end.id, change.count, cursor)
        if (change.kind === 'structural-join')
          return store.joinNodes({ anchorId: located.node.id, focusId: end.id }, change.spaced)
        const result = store.applyNodeVisual(
          change.command,
          located.node.id,
          end.id,
          change.source,
          change.text,
          change.repeat,
        )
        if (result !== undefined) {
          const nextRegister = visualCommandRegister(change.command, result)
          if (nextRegister !== undefined) vimSession.current.register = nextRegister
        }
        return result !== undefined
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
      const committedCursor = retreatCursor ? Math.max(0, rawCursor - 1) : rawCursor
      const next = editCaretTransition(prior, committedCursor, finalText.length, hasAttachment)
      // A command-driven commit must not rewrite the DOM: the visible text already equals the
      // committed text, and the user's selection is what the command is about to act on.
      if (input !== undefined && !preserveDomSelection) {
        setEditableText(input, finalText)
      }
      applyCaretState(
        session.nodeId,
        next,
        false,
        preserveDomSelection ? 'preserve-selection' : input === undefined ? 'after-edit' : 'immediate',
      )
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
    // A shutdown flush interrupts a pending plain Insert session: consume it without recording, so a
    // later Escape cannot capture the session the flush already ended (PRODUCT §20.2.1 T8). The
    // structural session needs its input's text to capture, so it stays pending for a later finish.
    takeInsertSession(vimSession.current)
    const committed = finishVimReplace()
    if (latestVimMode.current === 'replace') changeVimMode('normal')
    return committed
  }, [finishVimReplace, changeVimMode, vimSession])

  useEffect(() => store.registerPendingEditFinisher(finishPendingEdits), [store, finishPendingEdits])

  const finishVimInsert = useCallback(
    /**
     * Finish the pending Insert session. The structural session always captures; the plain session
     * is recorded for `.` only when Escape completed it on its own node. Every other finish (blur,
     * pointer, navigation, shortcut, toggle, flush) consumes it and keeps the previous repeatable
     * change (PRODUCT §20.2.1 T8). The registered-input check is the fail-closed backstop against a
     * session that crossed to another node without a blur consuming it first.
     */
    (input: HTMLElement, completed = false): void => {
      finishStructuralInsert(input)
      const session = takeInsertSession(vimSession.current)
      if (session === undefined) return
      if (!completed) return
      if (inputs.current.get(session.nodeId) !== input) return
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
      setMode: changeVimMode,
    }),
    [finishVimReplace, changeVimMode, vimCommandState],
  )

  const moveVimViewport = useCallback(
    (nodeId: string, motion: VimViewportMotion, cursor: number): void => {
      const viewport = viewportBounds()
      const visibleRows = Array.from(document.querySelectorAll<HTMLElement>('.node-row')).filter((row) => {
        const bounds = row.getBoundingClientRect()
        return bounds.top < viewport.bottom && bounds.bottom > viewport.top
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
        const matches =
          input instanceof HTMLTextAreaElement &&
          (target.kind === 'block'
            ? input.selectionStart === target.start && input.selectionEnd === target.end
            : input.selectionStart === target.position && input.selectionEnd === target.position)
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
    const input = inputs.current.get(pending.nodeId)
    if (
      state.status !== 'ready' ||
      state.location.selectedNodeId !== pending.nodeId ||
      state.focus?.token !== pending.focusToken ||
      pending.revision !== caretRevision.current ||
      input === undefined ||
      !input.isConnected ||
      (pending.input !== undefined && pending.input !== input)
    )
      return
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
      onTextChange: (event) => store.editText(node.id, event.currentTarget.value),
      onContentInput: (event: FormEvent<HTMLElement>) => {
        const cursor = getCaret(event.currentTarget)
        const content = readEditableContent(event.currentTarget)
        pendingCaret.current = {
          nodeId: node.id,
          input: event.currentTarget,
          cursor,
          normal: false,
          revision: ++caretRevision.current,
          focusToken: latestFocus.current?.token,
        }
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
        finishVimReplace(undefined, false, true)
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
        vim: !vimEnabled
          ? undefined
          : {
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
                  const authority = caretAuthority.current
                  if (authority.nodeId !== undefined)
                    applyCaretState(
                      authority.nodeId,
                      { ...authority.caret, imageTextReturnCursor: value },
                      false,
                      'preserve-selection',
                    )
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
              setMode: changeVimMode,
              openAttachment: onPreviewAttachment,
              setImageCaret: (nodeId, active, fromFocus) => {
                const snapshot = store.getSnapshot()
                if (snapshot.status !== 'ready') return
                const target = requireNode(snapshot.document, nodeId).node
                applyCaretState(
                  nodeId,
                  {
                    cursor: active
                      ? target.text.length
                      : Math.min(caretAuthority.current.caret.cursor, Math.max(0, target.text.length - 1)),
                    imageActive: active,
                    imageTextReturnCursor: active ? caretAuthority.current.caret.imageTextReturnCursor : undefined,
                  },
                  fromFocus,
                )
              },
              scheduleCaret: (input, cursor) => {
                pendingCaret.current = {
                  nodeId: node.id,
                  input,
                  cursor,
                  normal: false,
                  revision: ++caretRevision.current,
                  focusToken: latestFocus.current?.token,
                }
              },
              nodeVisual: {
                enter: (nodeId) => {
                  const state = store.getSnapshot()
                  if (state.status !== 'ready' || state.location.currentParentId === nodeId) return false
                  setNodeVisualSelection({ anchorId: nodeId, focusId: nodeId })
                  rememberNodeRange(vimCommandState.current, state.document, nodeId, nodeId)
                  return true
                },
                move: moveNodeVisual,
                swap: () => {
                  if (nodeVisualSelection !== undefined) {
                    setNodeVisualSelection({
                      anchorId: nodeVisualSelection.focusId,
                      focusId: nodeVisualSelection.anchorId,
                    })
                    swapNodeVisual(vimCommandState.current)
                  }
                },
                exit: () => setNodeVisualSelection(undefined),
                command: commandNodeVisual,
                shift: shiftNodeVisual,
                join: joinNodeVisual,
              },
              shiftCurrentNode,
              restoreVisual,
              verticalOperator,
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
      const state = store.getSnapshot()
      if (state.status !== 'ready') {
        changeVimMode(enabled ? 'normal' : 'insert')
        return
      }
      const node = requireNode(state.document, state.location.selectedNodeId).node
      const candidate = inputs.current.get(node.id)
      const input =
        candidate !== undefined && candidate.ownerDocument.activeElement === candidate ? candidate : undefined
      const hasAttachment = node.attachment !== undefined
      if (enabled) {
        changeVimMode('normal')
        const cursor = input === undefined ? (state.focus?.cursor ?? 0) : getCaret(input)
        // A deliberate multi-character selection survives the switch, as it survives other changes
        // into Normal mode; otherwise the block caret is drawn at the caret.
        applyCaretState(
          node.id,
          editCaretTransition({ cursor, imageActive: false }, cursor, node.text.length, hasAttachment),
          false,
          input === undefined || hasMultiCharacterSelection(input) ? 'preserve-selection' : 'immediate',
        )
        return
      }
      // Disabling resolves every Vim session the way a focus change would, except that the editor
      // keeps focus: Insert bookkeeping finishes, a pending replacement commits as one edit without
      // rewriting the visible text, and Visual ranges and an unfinished command clear.
      if (input !== undefined) finishVimInsert(input)
      finishVimReplace(input, false, true)
      clearCommandAssembly(vimCommandState.current)
      setNodeVisualSelection(undefined)
      const caret = caretAuthority.current.nodeId === node.id ? caretAuthority.current.caret : undefined
      const cursor =
        caret?.imageActive === true
          ? node.text.length
          : input === undefined
            ? (state.focus?.cursor ?? 0)
            : getCaret(input)
      applyCaretState(node.id, { cursor, imageActive: false }, false, 'preserve-selection')
      changeVimMode('insert')
    },
    [store, changeVimMode, applyCaretState, finishVimInsert, finishVimReplace, setNodeVisualSelection],
  )

  const dragFreeze = useMemo<NodeDragCaretFreeze>(
    () => ({ begin: beginFrozenCaret, end: releaseFrozenCaret }),
    [beginFrozenCaret, releaseFrozenCaret],
  )

  return { bindings, dragFreeze, setVimEditing }
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
