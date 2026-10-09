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
  | 'node-put'
  | 'whole-node-visual'

/** AG-14 policy; later tasks enable creation and occurrence moves explicitly. */
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
  // Stryker disable next-line ArrayDeclaration: The injected string is not an AgendaElement, so this still rejects every valid element.
  create: [],
  // Stryker disable next-line ArrayDeclaration: The injected string is not an AgendaElement, so this still rejects every valid element.
  'node-put': [],
  // Stryker disable next-line ArrayDeclaration: The injected string is not an AgendaElement, so this still rejects every valid element.
  'whole-node-visual': [],
}

export function agendaAllows(element: AgendaElement, action: AgendaAction): boolean {
  return POLICY[action].includes(element)
}
