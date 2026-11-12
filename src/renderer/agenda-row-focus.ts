import type { FocusEvent } from 'react'
import type { EditorStore } from '../application/editor-store'
import type { VimTextCommandState } from './vim-session-finish'
import { isAgendaVerticalArrival } from './agenda-caret-state'

/** Synthetic rows have no input blur owner; keep their vertical intent scoped to navigation. */
export function createAgendaFocusHandlers(store: EditorStore, vim?: VimTextCommandState) {
  return {
    onPointerDownCapture: (): void => {
      if (vim !== undefined) vim.commandState.verticalGoal = undefined
    },
    onBlurCapture: (event: FocusEvent<HTMLElement>): void => {
      if (!(event.target instanceof Element) || event.target.closest('.node-input') !== null) return
      const source = event.target.closest('.agenda-row')
      const commands = vim?.commandState
      const goal = commands?.verticalGoal
      if (source === null || commands === undefined || goal === undefined) return
      const target = event.relatedTarget instanceof Element ? event.relatedTarget.closest('.agenda-row') : null
      const state = store.getSnapshot()
      const verticalArrival = isAgendaVerticalArrival(
        source.getAttribute('data-agenda-key') ?? undefined,
        target?.getAttribute('data-agenda-key') ?? undefined,
        state.status === 'ready' ? state.agenda?.selectedKey : undefined,
        state.status === 'ready' ? state.focus.token : undefined,
        goal,
      )
      if (!verticalArrival) commands.verticalGoal = undefined
    },
  }
}
