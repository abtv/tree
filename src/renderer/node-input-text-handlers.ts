import type { FormEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import { reconcileLinkTextEdit, type LinkRange, type TreeNode } from '../domain/document'
import type { NodeInputBindings } from './NodeInput'
import type { PendingCaret } from './node-input-types'
import { getCaret, readEditableContent } from './editor-dom'
import { currentLinkDraft } from './link-caret'
import { clearPending, type VimCommandState } from './vim-command-state'
import { beginReplaceSession, type VimEditSessionState } from './vim-edit-session'
import type { VimMode } from './vim-editing'

interface TextEditHandlerDeps {
  store: EditorStore
  composing: boolean
  pendingLinkDraft: { current: { nodeId: string; range: LinkRange } | undefined }
  schedulePendingCaret: (request: Omit<PendingCaret, 'normal' | 'revision' | 'focusToken'>) => void
  getMode: () => VimMode
  session: VimEditSessionState
  commandState: VimCommandState
  finishVimReplace: (input?: HTMLElement, retreat?: boolean, preserveSelection?: boolean) => boolean
  setComposing: (value: boolean) => void
}

export function createTextEditHandlers(
  deps: TextEditHandlerDeps,
  node: TreeNode,
): Pick<
  NodeInputBindings,
  'onTextChange' | 'onContentInput' | 'onContentChange' | 'onCompositionEnd' | 'onCompositionStart'
> {
  const {
    store,
    composing,
    pendingLinkDraft,
    schedulePendingCaret,
    getMode,
    session,
    commandState,
    finishVimReplace,
    setComposing,
  } = deps
  return {
    onTextChange: (event) => {
      const text = event.currentTarget.value
      // Replacing the textarea would cancel a native composition and orphan its compositionend,
      // so link recognition waits for the first edit after the composition.
      const composingNow = composing || (event.nativeEvent as Partial<InputEvent> | undefined)?.isComposing === true
      // A textarea holds a node without links, so a link can only appear here when typing completes a URL.
      const edit = reconcileLinkTextEdit(node.text, node.links ?? [], text)
      if (composingNow || edit.links.length === 0) {
        store.editText(node.id, text)
        return
      }
      // The node now has a link, so its textarea is replaced by the rich editor; restore focus and
      // the caret on the new element once it is mounted.
      schedulePendingCaret({
        nodeId: node.id,
        cursor: event.currentTarget.selectionStart,
        refocus: true,
      })
      store.editContent(node.id, text, edit.links, edit.createsNewLink)
    },
    onContentInput: (event: FormEvent<HTMLElement>) => {
      const cursor = getCaret(event.currentTarget)
      const content = readEditableContent(event.currentTarget)
      schedulePendingCaret({
        nodeId: node.id,
        input: event.currentTarget,
        cursor,
      })
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
      if (getMode() === 'replace') {
        const baseline =
          event.currentTarget instanceof HTMLTextAreaElement
            ? event.currentTarget.value
            : readEditableContent(event.currentTarget).text
        beginReplaceSession(session, {
          nodeId: node.id,
          baseline,
          position: getCaret(event.currentTarget),
        })
      }
    },
    onCompositionStart: () => {
      clearPending(commandState)
      finishVimReplace(undefined, false, true)
      setComposing(true)
    },
  }
}
