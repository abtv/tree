import type { EditorSnapshot } from '../application/editor-store'
import type { NormalCaretTarget } from './link-caret'
import type { PendingCaret } from './node-input-types'
import type { VimMode } from './vim-editing'

export function pendingCaretAfterModeChange(
  pending: PendingCaret | undefined,
  mode: VimMode,
  revision: number,
): PendingCaret | undefined {
  // A change command schedules its native insertion point before switching mode. Keep
  // that compatible projection while invalidating focus work from the preceding mode.
  return pending !== undefined && pending.normal === (mode === 'normal') ? { ...pending, revision } : undefined
}

export function normalCaretIsDrawn(input: HTMLElement, target: NormalCaretTarget): boolean {
  return (
    input instanceof HTMLTextAreaElement &&
    (target.kind === 'block'
      ? input.selectionStart === target.start && input.selectionEnd === target.end
      : input.selectionStart === target.position && input.selectionEnd === target.position)
  )
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
    (pending.input !== undefined && pending.input !== input)
  )
    return undefined
  return input
}
