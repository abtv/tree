import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { advanceVimLeader, cancelVimLeader, hasPendingVimLeader, type VimLeaderCommand } from './vim-command-state'
import { isNeutralKeydown } from './vim-keyboard-handler'
import type { VimTextCommandState } from './vim-session-finish'

function pressId(event: Pick<globalThis.KeyboardEvent, 'code' | 'key'>): string {
  return event.code && event.code !== 'Unidentified' ? event.code : event.key
}

interface LeaderSurface {
  vim: VimTextCommandState
  isTarget(target: Element): boolean
}

const isNoteTarget = (target: Element): boolean =>
  target.closest('.node-input') !== null || target.matches('.agenda-row[tabindex]')

export type VimLeaderRouter = (
  event: KeyboardEvent<HTMLElement>,
  surface?: LeaderSurface,
) => VimLeaderCommand | 'consumed' | undefined

/** Keep ownership of a consumed press until its release, even when it opens a popup. */
export function useVimLeaderRouting(vim: VimTextCommandState): VimLeaderRouter {
  const [consumedPresses] = useState(() => new Set<string>())
  const state = vim.commandState
  const routedState = useRef(state)
  useEffect(() => {
    const cancel = (): void => {
      cancelVimLeader(state)
      if (routedState.current !== state) cancelVimLeader(routedState.current)
    }
    // The popup and shortcut listeners on document can take keys before React sees them.
    const keydown = (event: globalThis.KeyboardEvent): void => {
      const id = pressId(event)
      if (!event.repeat) consumedPresses.delete(id)
      else if (consumedPresses.has(id)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) cancel()
    }
    const keyup = (event: globalThis.KeyboardEvent): void => {
      consumedPresses.delete(pressId(event))
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('keyup', keyup, true)
    // A still-held press can resume auto-repeat when this window regains focus.
    window.addEventListener('blur', cancel)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('keyup', keyup, true)
      window.removeEventListener('blur', cancel)
    }
  }, [consumedPresses, state])

  return (event, surface) => {
    const owner = surface?.vim ?? vim
    routedState.current = owner.commandState
    const result = handleVimLeaderKey(event, owner, surface?.isTarget ?? isNoteTarget)
    if (result !== undefined && !event.repeat) consumedPresses.add(pressId(event))
    return result
  }
}

/** Route app commands before either the editable or the read-only Agenda keyboard adapter. */
function handleVimLeaderKey(
  event: KeyboardEvent<HTMLElement>,
  vim: VimTextCommandState,
  isTarget: (target: Element) => boolean,
): VimLeaderCommand | 'consumed' | undefined {
  const state = vim.commandState
  if (vim.mode !== 'normal' || (event.key !== ' ' && !hasPendingVimLeader(state))) return undefined
  const target = event.target
  if (
    event.defaultPrevented ||
    event.nativeEvent.isComposing ||
    !(target instanceof Element) ||
    target.closest('dialog, [role="dialog"]') !== null ||
    !isTarget(target)
  ) {
    cancelVimLeader(state)
    return undefined
  }
  if (isNeutralKeydown(event.key)) return undefined
  if (event.ctrlKey || event.metaKey || event.altKey) {
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
