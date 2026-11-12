export type AgendaElement = 'day' | 'match'
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
  navigate: ['day', 'match'],
  fold: ['day'],
  text: ['match'],
  clipboard: ['match'],
  strikethrough: ['match'],
  history: ['day', 'match'],
  'empty-delete': [],
  // Stryker disable next-line ArrayDeclaration: The injected string is not an AgendaElement, so this still rejects every valid element.
  structure: [],
  create: [],
  split: [],
  'open-sibling': [],
  // Stryker disable next-line ArrayDeclaration: The injected string is not an AgendaElement, so this still rejects every valid element.
  'node-put': [],
  'start-move': [],
  'put-move': [],
  'whole-node-visual': [],
}

export function agendaAllows(element: AgendaElement, action: AgendaAction): boolean {
  return POLICY[action].includes(element)
}
