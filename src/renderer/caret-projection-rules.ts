import type { EditorSnapshot } from '../application/editor-store'
import type { NormalCaretTarget } from './link-caret'
import type { PendingCaret } from './node-input-types'
export { pendingCaretAfterModeChange } from './caret-projection-state'

export function normalCaretIsDrawn(input: HTMLElement, target: NormalCaretTarget): boolean {
  return (
    input instanceof HTMLTextAreaElement &&
    (target.kind === 'block'
      ? input.selectionStart === target.start && input.selectionEnd === target.end
      : input.selectionStart === target.position && input.selectionEnd === target.position)
  )
}

/**
 * A row's textarea is replaced by the rich element when its text first resembles a date, so work
 * scheduled for the removed textarea belongs to the element that replaced it (docs/PRODUCT.md §20.10).
 */
function replacedByRichElement(scheduled: HTMLElement, current: HTMLElement): boolean {
  return scheduled instanceof HTMLTextAreaElement && !scheduled.isConnected && !(current instanceof HTMLTextAreaElement)
}

export function currentPendingCaretInput(
  pending: PendingCaret,
  state: EditorSnapshot,
  revision: number,
  input: HTMLElement | undefined,
): HTMLElement | undefined {
  if (
    state.status !== 'ready' ||
    state.location.selectedNodeId !== pending.nodeId ||
    state.focus?.token !== pending.focusToken ||
    pending.revision !== revision ||
    input === undefined ||
    !input.isConnected ||
    (pending.input !== undefined && pending.input !== input && !replacedByRichElement(pending.input, input))
  )
    return undefined
  return input
}
