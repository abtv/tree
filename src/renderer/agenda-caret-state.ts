import { arrivalCaret, type RowCaret } from './agenda-row-caret'

/** Native caret coordinates stay in CaretProjectionState; only synthetic rows own offsets here. */
export type AgendaCaretState =
  | { readonly kind: 'native'; readonly key: string; readonly focusToken: number | undefined }
  | {
      readonly kind: 'synthetic'
      readonly key: string
      readonly focusToken: number | undefined
      readonly caret: RowCaret
    }

export interface AgendaCaretArrival {
  readonly key: string
  readonly focusToken: number | undefined
  readonly surface: 'native' | 'synthetic'
  readonly cursor: number
}

/** Currency includes the occurrence and focus intent, including reselection of the same node. */
export function arriveAgendaCaret(state: AgendaCaretState | undefined, arrival: AgendaCaretArrival): AgendaCaretState {
  if (state?.key === arrival.key && state.focusToken === arrival.focusToken && state.kind === arrival.surface)
    return state
  const identity = { key: arrival.key, focusToken: arrival.focusToken }
  return arrival.surface === 'native'
    ? { ...identity, kind: 'native' }
    : { ...identity, kind: 'synthetic', caret: { key: arrival.key, anchor: arrival.cursor, focus: arrival.cursor } }
}

export function agendaCaret(state: AgendaCaretState): RowCaret {
  return state.kind === 'synthetic' ? state.caret : arrivalCaret(state.key)
}

export function moveAgendaCaret(state: AgendaCaretState, caret: RowCaret): AgendaCaretState {
  return state.kind === 'synthetic' && state.key === caret.key ? { ...state, caret } : state
}

/** A blur preserves desired X only for the exact vertical arrival already published by the store. */
export function isAgendaVerticalArrival(
  sourceKey: string | undefined,
  targetKey: string | undefined,
  selectedKey: string | undefined,
  focusToken: number | undefined,
  goal: { agendaKey?: string; focusToken: number | undefined } | undefined,
): boolean {
  return (
    goal?.agendaKey !== undefined &&
    sourceKey !== goal.agendaKey &&
    targetKey === goal.agendaKey &&
    selectedKey === goal.agendaKey &&
    focusToken === goal.focusToken
  )
}
