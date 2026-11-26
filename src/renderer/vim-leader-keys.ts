import { useEffect, type KeyboardEvent } from 'react'
import {
  advanceVimLeader,
  cancelVimLeader,
  hasPendingVimLeader,
  type VimCommandState,
  type VimLeaderCommand,
} from './vim-command-state'
import { isNeutralKeydown } from './vim-keyboard-handler'
import type { VimTextCommandState } from './vim-session-finish'

/**
 * Cancel an unfinished Leader before a shortcut with a modifier key runs. A shortcut listener on
 * `document` can stop such a key before React dispatches it to `handleVimLeaderKey`, so this
 * listens on `window`, whose capture phase precedes every `document` listener.
 */
export function useVimLeaderShortcutCancel(state: VimCommandState): void {
  useEffect(() => {
    const cancel = (event: globalThis.KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey) cancelVimLeader(state)
    }

    window.addEventListener('keydown', cancel, true)
    return () => window.removeEventListener('keydown', cancel, true)
  }, [state])
}

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
