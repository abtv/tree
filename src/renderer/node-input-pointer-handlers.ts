import type { ClipboardEvent, FocusEvent, MouseEvent, SyntheticEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { TreeNode } from '../domain/document'
import { getCaret, getSelectionRange, isCollapsedSelection, setNormalCaret } from './editor-dom'
import {
  executeEditorContextMenuCommand,
  finishVimSessionBeforeTextEdit,
  type VimTextCommandState,
} from './editor-input-handlers'
import type { NodeInputBindings } from './NodeInput'
import { clearCommandAssembly, type VimCommandState } from './vim-command-state'
import { pointerCaretTransition, type VimCaretState } from './vim-caret-transition'
import type { VimMode } from './vim-editing'

interface PointerHandlerDeps {
  store: EditorStore
  selectedNodeId: string | undefined
  persistenceLocked: boolean
  vimMode: VimMode
  commandState: VimCommandState
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
      if (getMode() === 'replace') changeVimMode('normal')
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
      // A structural session's typed text lives in the node `o`/`O`/Visual `c`/`s` created, not in
      // the node under the pointer. This mousedown runs before the focused input's blur, so let
      // that blur finish the structural session rather than capturing the clicked node's text; a
      // plain session is still consumed here, so a pointer focus interruption records nothing
      // (PRODUCT §20.2.1 T8).
      if (commandState.structuralInsert === undefined) finishVimInsert(event.currentTarget)
      // A right-click opens the context menu, which will run Cut or Paste against the visible
      // selection, so this commit must not rewrite the DOM; a left click keeps the existing
      // reset-to-typed-end behavior.
      finishVimReplace(event.currentTarget, false, event.button === 2)
      clearCommandAssembly(commandState)
    },
    onMouseUp: (event: MouseEvent<HTMLElement>) => {
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
