import type { KeyboardEvent } from 'react'
import { advanceVimLeader, cancelVimLeader, hasPendingVimLeader, type VimLeaderCommand } from './vim-command-state'
import { isNeutralKeydown } from './vim-keyboard-handler'
import type { VimTextCommandState } from './vim-session-finish'

/** Route app commands before either the editable or the read-only Agenda keyboard adapter. */
export function handleVimLeaderKey(
  event: KeyboardEvent<HTMLElement>,
  vim: VimTextCommandState,
): VimLeaderCommand | 'consumed' | undefined {
  const state = vim.commandState
  if (vim.mode !== 'normal' || (event.key !== ' ' && !hasPendingVimLeader(state))) return undefined
  const target = event.target
  if (
    event.defaultPrevented ||
    event.nativeEvent.isComposing ||
    !(target instanceof Element) ||
    target.closest('dialog, [role="dialog"]') !== null ||
    !(target.closest('.node-input') || target.matches('.agenda-row[tabindex]'))
  ) {
    cancelVimLeader(state)
    return undefined
  }
  if (isNeutralKeydown(event.key)) return undefined
  if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Tab') {
    cancelVimLeader(state)
    return undefined
  }
  const result = advanceVimLeader(state, event.shiftKey ? '' : event.key, event.repeat, event.timeStamp)
  if (result !== undefined) {
    event.preventDefault()
    event.stopPropagation()
  }
  return result
}
