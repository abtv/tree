export type AgendaElement = 'day' | 'gap' | 'match' | 'context'
export type AgendaAction =
  | 'navigate'
  | 'fold'
  | 'text'
  | 'clipboard'
  | 'strikethrough'
  | 'history'
  | 'empty-delete'
  | 'structure'
  | 'create'
  | 'split'
  | 'open-sibling'
  | 'node-put'
  | 'start-move'
  | 'put-move'
  | 'whole-node-visual'

/** Agenda policy: which synthetic or real row accepts each command family. */
const POLICY: Readonly<Record<AgendaAction, readonly AgendaElement[]>> = {
  navigate: ['day', 'gap', 'match', 'context'],
  fold: ['day', 'gap', 'match', 'context'],
  text: ['match'],
  clipboard: ['match'],
  strikethrough: ['match'],
  history: ['day', 'gap', 'match', 'context'],
  'empty-delete': ['match'],
  // Stryker disable next-line ArrayDeclaration: The injected string is not an AgendaElement, so this still rejects every valid element.
  structure: [],
  create: ['day'],
  split: ['match'],
  'open-sibling': ['match'],
  // Stryker disable next-line ArrayDeclaration: The injected string is not an AgendaElement, so this still rejects every valid element.
  'node-put': [],
  // `dd` starts a pending move only from a direct match; `p`/`P` drops it on any row of a day, never on a gap (D4).
  'start-move': ['match'],
  'put-move': ['day', 'match', 'context'],
  'whole-node-visual': ['match'],
}

export function agendaAllows(element: AgendaElement, action: AgendaAction): boolean {
  return POLICY[action].includes(element)
}
