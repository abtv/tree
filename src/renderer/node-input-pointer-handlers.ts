import {
  replaceClickAgendaKey,
  replaceClickMoved,
  beginReplaceSession,
  takeReplaceClick,
  type VimEditSessionState,
} from './vim-edit-session'
import { getCaret, getSelectionRange, isCollapsedSelection, readEditableContent, setNormalCaret } from './editor-dom'
import { executeEditorContextMenuCommand } from './editor-input-handlers'
import {
  finishVimBlur,
  prepareVimCommand,
  prepareVimPointerPress,
  type VimTextCommandState,
} from './vim-session-finish'
import type { NodeInputBindings } from './NodeInput'
import type { VimCommandState } from './vim-command-state'
import { pointerCaretTransition, type VimCaretState } from './vim-caret-transition'
import type { ClipboardEvent, FocusEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import type { VimMode } from './vim-editing'
import type { EditorServices } from '../application/editor-store-types'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'
import { isAgendaVerticalArrival } from './agenda-caret-state'

/** Keep a readonly occurrence mounted until its link click has been dispatched. */
export function preventReadOnlyLinkFocus(event: MouseEvent<HTMLElement>): void {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (link !== null && event.currentTarget.contains(link)) event.preventDefault()
}

interface PointerHandlerDeps {
  store: EditorStore
  capturePasteClipboard?: ((data: DataTransfer) => EditorServices['readClipboard']) | undefined
  selectedNodeId: string | undefined
  persistenceLocked: boolean
  vimMode: VimMode
  commandState: VimCommandState
  session: VimEditSessionState
  vimTextCommandState: VimTextCommandState
  getMode: () => VimMode
  getInput: (nodeId: string) => HTMLElement | undefined
  readAuthority: () => { nodeId?: string; caret: VimCaretState }
  applyCaretState: (
    nodeId: string,
    caret: VimCaretState,
    fromFocus?: boolean,
    timing?: 'immediate' | 'after-edit' | 'preserve-selection',
  ) => void
  changeVimMode: (mode: VimMode) => void
  finishVimInsert: (input: HTMLElement, completed?: boolean) => void
  finishVimReplace: (input?: HTMLElement, retreat?: boolean, preserveSelection?: boolean) => boolean
  setSelectAllNodeId: (nodeId: string | undefined) => void
  shortcuts?: ShortcutProfile | undefined
}

export function createPointerHandlers(
  deps: PointerHandlerDeps,
  node: TreeNode,
): Pick<
  NodeInputBindings,
  'onBlur' | 'onContextMenu' | 'onClick' | 'onCut' | 'onFocus' | 'onMouseDown' | 'onMouseUp' | 'onPaste' | 'onSelect'
> {
  const {
    store,
    capturePasteClipboard,
    selectedNodeId,
    persistenceLocked,
    vimMode,
    commandState,
    session,
    vimTextCommandState,
    getMode,
    getInput,
    readAuthority,
    applyCaretState,
    changeVimMode,
    setSelectAllNodeId,
    shortcuts = APPLE_SHORTCUTS,
  } = deps
  return {
    onBlur: (event?: FocusEvent<HTMLElement>) => {
      // Temporary command surfaces borrow focus without ending the editor's mode/session.
      if (
        event?.relatedTarget instanceof Element &&
        event.relatedTarget.closest('.command-input-line, [data-editor-focus-borrow]')
      )
        return
      const input = getInput(node.id)
      setSelectAllNodeId(undefined)
      // A blur moves focus to a non-input control (a breadcrumb or enter-control click) or to
      // another node, so the command assembly that belongs to this node must clear with it.
      const goal = commandState.verticalGoal
      const snapshot = store.getSnapshot()
      const verticalArrival =
        event?.relatedTarget instanceof Element &&
        event.relatedTarget.matches('.node-input,.agenda-row') &&
        goal !== undefined &&
        snapshot.status === 'ready' &&
        (snapshot.agenda === undefined
          ? goal.nodeId !== node.id && snapshot.location.selectedNodeId === goal.nodeId
          : isAgendaVerticalArrival(
              event.currentTarget.closest<HTMLElement>('.agenda-row')?.dataset.agendaKey,
              event.relatedTarget.closest<HTMLElement>('.agenda-row')?.dataset.agendaKey,
              snapshot.agenda.selectedKey,
              snapshot.focus.token,
              goal,
            )) &&
        snapshot.focus.token === goal.focusToken
      finishVimBlur(deps, node.id, input, { verticalArrival, windowFocused: document.hasFocus() })
      store.endTextSession()
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
      if (shortcuts.isPrimary(event)) window.open(link.getAttribute('href') ?? '', '_blank', 'noopener,noreferrer')
    },
    onCut: () => store.markNextTextEditStandalone(),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      const snapshot = store.getSnapshot()
      if (snapshot.status === 'ready' && snapshot.agenda !== undefined) {
        const key = event.currentTarget.closest<HTMLElement>('.agenda-row')?.dataset.agendaKey
        if (key !== undefined && key !== snapshot.agenda.selectedKey)
          store.applyAgenda({ kind: 'select', key, cursor: getCaret(event.currentTarget) })
        return
      }
      if (selectedNodeId !== node.id) store.selectNode(node.id, getCaret(event.currentTarget))
      else if (
        getMode() === 'normal' &&
        node.attachment !== undefined &&
        getCaret(event.currentTarget) === node.text.length
      )
        setNormalCaret(event.currentTarget, node.text.length)
    },
    onMouseDown: (event: MouseEvent<HTMLElement>) => {
      store.search.interruptNavigation()
      applyCaretState(
        node.id,
        pointerCaretTransition(
          readAuthority().caret,
          getCaret(event.currentTarget),
          node.text.length,
          node.attachment !== undefined,
        ),
        false,
        'preserve-selection',
      )
      if (event.button === 2) event.preventDefault()
      setSelectAllNodeId(undefined)
      getInput(node.id)?.classList.remove('select-all')
      store.endTextSession()
      prepareVimPointerPress(deps, node.id, event.currentTarget, {
        button: event.button,
        detail: event.detail,
        contextMenu: shortcuts.isContextMenuClick(event),
      })
    },
    onMouseUp: (event: MouseEvent<HTMLElement>) => {
      if (getMode() === 'replace') {
        // An Agenda row press can mount this editor before release. Its row-click adapter waits
        // until selection and focus have settled before starting the destination session.
        if (replaceClickAgendaKey(session) !== undefined) return
        // The release completes an ordinary text click: the replacement continues at the clicked
        // caret or double-clicked word as a new session. A dragged selection keeps its existing
        // interruption rule; a word selection stays visible until the first replacement key.
        const moved = replaceClickMoved(session)
        if (!takeReplaceClick(session)) return
        const input = event.currentTarget
        const selection = getSelectionRange(input)
        // A drag that began elsewhere and was released over this input must not start its session.
        const selectedWord = event.detail === 2 && selection.start !== selection.end
        if (input.ownerDocument.activeElement !== input || (selection.start !== selection.end && !selectedWord)) {
          if (moved) changeVimMode('normal')
          return
        }
        const cursor = selectedWord ? selection.start : getCaret(input)
        applyCaretState(
          node.id,
          pointerCaretTransition(readAuthority().caret, cursor, node.text.length, node.attachment !== undefined),
          false,
          'preserve-selection',
        )
        const baseline = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
        beginReplaceSession(session, {
          nodeId: node.id,
          baseline,
          position: cursor,
          ...(selectedWord ? { selectionEnd: selection.end } : {}),
        })
        return
      }
      if (getMode() !== 'normal') return
      applyCaretState(
        node.id,
        pointerCaretTransition(
          readAuthority().caret,
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
      prepareVimCommand(vimTextCommandState, 'text-edit', event.currentTarget)
      const source = capturePasteClipboard?.(event.clipboardData)
      void store
        .paste(node.id, getCaret(event.currentTarget), source)
        .catch((error: unknown) => store.reportError(error))
    },
    onSelect: (event: SyntheticEvent<HTMLElement>) => {
      if (vimMode === 'normal') return
      const target = event.currentTarget
      if (target instanceof HTMLTextAreaElement) {
        if (target.selectionStart !== target.selectionEnd) store.endTextSession()
      } else if (!isCollapsedSelection()) store.endTextSession()
    },
  }
}
