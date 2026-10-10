import type { ClipboardEvent, FocusEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { getCaret, getSelectionRange, isCollapsedSelection, readEditableContent, setNormalCaret } from './editor-dom'
import {
  executeEditorContextMenuCommand,
  finishVimSessionBeforeTextEdit,
  type VimTextCommandState,
} from './editor-input-handlers'
import type { NodeInputBindings } from './NodeInput'
import { clearCommandAssembly, type VimCommandState } from './vim-command-state'
import { pointerCaretTransition, type VimCaretState } from './vim-caret-transition'
import { beginReplaceClick, beginReplaceSession, takeReplaceClick, type VimEditSessionState } from './vim-edit-session'
import type { VimMode } from './vim-editing'

/** Keep a readonly occurrence mounted until its link click has been dispatched. */
export function preventReadOnlyLinkFocus(event: MouseEvent<HTMLElement>): void {
  const link = event.target instanceof Element ? event.target.closest('a[href]') : null
  if (link !== null && event.currentTarget.contains(link)) event.preventDefault()
}

interface PointerHandlerDeps {
  store: EditorStore
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
    finishVimInsert,
    finishVimReplace,
    setSelectAllNodeId,
  } = deps
  return {
    onBlur: () => {
      const input = getInput(node.id)
      setSelectAllNodeId(undefined)
      // A blur moves focus to a non-input control (a breadcrumb or enter-control click) or to
      // another node, so the command assembly that belongs to this node must clear with it.
      clearCommandAssembly(commandState)
      // A structural session (o/O/whole-node-Visual c/s) begins by creating a new node and
      // immediately moving focus onto it, which blurs *this* node as an incidental side effect
      // before the user has typed anything into the new one. Only finish a structural session
      // from blur once it is a different node's own blur — the one it actually began on.
      const structuralBeganHere = commandState.structuralInsert?.originNodeId === node.id
      if (input !== undefined && !structuralBeganHere) finishVimInsert(input)
      finishVimReplace()
      // An ordinary text click keeps Replace mode: its press is still pending when the previous
      // node blurs, and the destination node continues the mode on release (PRODUCT §20.2.6).
      // A blur caused by the window losing focus mid-press is not a click.
      if (getMode() === 'replace') {
        if (session.replaceClick === true && document.hasFocus()) session.replaceClickMoved = true
        else changeVimMode('normal')
      }
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
      if (event.metaKey) window.open(link.getAttribute('href') ?? '', '_blank')
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
      // Pointer interruption consumes both kinds of Insert bookkeeping without capturing text,
      // including a same-input press that never produces blur (PRODUCT §20.2.19).
      finishVimInsert(event.currentTarget)
      // A right-click opens the context menu, which will run Cut or Paste against the visible
      // selection, so this commit must not rewrite the DOM; a left click keeps the existing
      // reset-to-typed-end behavior. A pending replacement of another node is committed by that
      // node's blur, which must not write its text into this input.
      const foreignSession = session.replace !== undefined && session.replace.nodeId !== node.id
      if (!foreignSession) finishVimReplace(event.currentTarget, false, event.button === 2)
      takeReplaceClick(session)
      if (getMode() === 'replace' && event.button === 0 && !event.ctrlKey) beginReplaceClick(session)
      clearCommandAssembly(commandState)
    },
    onMouseUp: (event: MouseEvent<HTMLElement>) => {
      if (getMode() === 'replace') {
        // The release completes an ordinary text click: the replacement continues at the clicked
        // caret as a new session. A selection made by a press that left another node ends Replace,
        // as the blur did before; a same-node selection leaves the mode without a session.
        const moved = session.replaceClickMoved === true
        if (!takeReplaceClick(session)) return
        const input = event.currentTarget
        const selection = getSelectionRange(input)
        // A drag that began elsewhere and was released over this input must not start its session.
        if (input.ownerDocument.activeElement !== input || selection.start !== selection.end) {
          if (moved) changeVimMode('normal')
          return
        }
        const cursor = getCaret(input)
        applyCaretState(
          node.id,
          pointerCaretTransition(readAuthority().caret, cursor, node.text.length, node.attachment !== undefined),
          false,
          'preserve-selection',
        )
        const baseline = input instanceof HTMLTextAreaElement ? input.value : readEditableContent(input).text
        beginReplaceSession(session, { nodeId: node.id, baseline, position: cursor })
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
  }
}
