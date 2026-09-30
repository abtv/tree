import fc from 'fast-check'

/**
 * An independent expected-state model of Normal-mode caret, image, edit, and history behavior. It
 * deliberately does not call the production caret transitions, so both the handler-level and the
 * production-hook sequence suites can use it as an oracle.
 */
export type SequenceEvent =
  | { kind: 'motion'; key: 'h' | 'l' | 'j' | 'k' | '0' | '$'; count: number }
  | { kind: 'delete'; count: number }
  | { kind: 'replace-character'; count: number; character: 'Z' | 'q' }
  | { kind: 'focus'; index: number; position: number }
  | { kind: 'interrupt'; count: number }
  | { kind: 'history'; direction: 'undo' | 'redo'; shortcut: boolean }

export type SequenceSpec = { text: string; image: boolean }

export interface SequenceExpected {
  texts: string[]
  index: number
  cursor: number
  image: boolean
  returned: number | undefined
  past: string[][]
  future: string[][]
}

export const maximum = (spec: SequenceSpec, text: string): number =>
  spec.image ? text.length : Math.max(0, text.length - 1)

export function expectedStep(state: SequenceExpected, specs: readonly SequenceSpec[], event: SequenceEvent): void {
  const spec = specs[state.index]!
  const text = state.texts[state.index]!
  const length = text.length
  if (event.kind === 'focus') {
    state.index = event.index % specs.length
    state.cursor = Math.min(event.position, maximum(specs[state.index]!, state.texts[state.index]!))
    state.image = specs[state.index]!.image && state.cursor === state.texts[state.index]!.length
    state.returned = undefined
    return
  }
  if (event.kind === 'interrupt') return
  if (event.kind === 'history') {
    const source = event.direction === 'undo' ? state.past : state.future
    const target = event.direction === 'undo' ? state.future : state.past
    const prior = source.pop()
    if (prior === undefined) return
    const outgoing = [...state.texts]
    target.push(outgoing)
    state.texts = prior
    // Undo and redo select the change and put the caret at its start, then the ordinary focus
    // transition clamps that offset and decides whether the node's image becomes the active caret.
    const changed = prior.findIndex((value, index) => value !== outgoing[index])
    if (changed < 0) {
      state.cursor = 0
      state.image = specs[state.index]!.image && state.texts[state.index]!.length === 0
      state.returned = undefined
      return
    }
    state.index = changed
    const restored = prior[changed]!
    let offset = 0
    while (
      offset < restored.length &&
      offset < outgoing[changed]!.length &&
      restored[offset] === outgoing[changed]![offset]
    )
      offset += 1
    state.image = specs[changed]!.image && offset >= restored.length
    state.cursor = state.image ? restored.length : Math.min(offset, Math.max(0, restored.length - 1))
    state.returned = undefined
    return
  }
  if (event.kind === 'replace-character') {
    if (state.cursor + event.count > length) return
    const replacement = event.character.repeat(event.count)
    const next = text.slice(0, state.cursor) + replacement + text.slice(state.cursor + event.count)
    if (next !== text) {
      state.past.push([...state.texts])
      state.future = []
      state.texts[state.index] = next
    }
    state.cursor += event.count - 1
    state.image = false
    state.returned = undefined
    return
  }
  if (event.kind === 'delete') {
    const end = Math.min(length, state.cursor + event.count)
    if (end > state.cursor) {
      state.past.push([...state.texts])
      state.future = []
      state.texts[state.index] = text.slice(0, state.cursor) + text.slice(end)
      state.cursor = Math.min(state.cursor, maximum(spec, state.texts[state.index]!))
      state.image = spec.image && state.cursor === state.texts[state.index]!.length
      state.returned =
        state.image && state.texts[state.index]!.length > 0 ? state.texts[state.index]!.length - 1 : undefined
    }
    return
  }
  const { key, count } = event
  if (key === '0' || key === '$') {
    state.cursor = key === '0' ? 0 : Math.max(0, length - 1)
    state.image = spec.image && state.cursor === length
    state.returned = undefined
    return
  }
  if (key === 'h') {
    if (state.image && length > 0) {
      state.cursor = Math.max(0, (state.returned ?? length - 1) - count + 1)
      state.image = false
      state.returned = undefined
    } else state.cursor = Math.max(0, state.cursor - count)
    return
  }
  if (key === 'l') {
    const old = state.cursor
    state.cursor = Math.min(maximum(spec, text), old + count)
    if (spec.image && !state.image && state.cursor === length && length > 0)
      state.returned = Math.min(length - 1, old + count - 1)
    state.image = spec.image && state.cursor === length
    return
  }
  let navigationCursor = state.cursor
  for (let step = 0; step < count; step += 1) {
    const current = specs[state.index]!
    const currentLength = state.texts[state.index]!.length
    if (step === 0 && key === 'j' && current.image && !state.image && state.cursor < currentLength) {
      state.returned = state.cursor
      state.cursor = currentLength
      state.image = true
      navigationCursor = currentLength
      continue
    }
    if (step === 0 && key === 'k' && current.image && state.image && currentLength > 0) {
      state.cursor = state.returned ?? currentLength - 1
      state.image = false
      state.returned = undefined
      navigationCursor = state.cursor
      continue
    }
    const nextIndex = state.index + (key === 'j' ? 1 : -1)
    if (nextIndex < 0 || nextIndex >= specs.length) break
    const requested = step === 0 ? (key === 'j' && state.image ? 0 : state.cursor) : navigationCursor
    if (step === 0 && key === 'j' && state.image) navigationCursor = 0
    state.index = nextIndex
    const destination = specs[nextIndex]!
    const destinationLength = state.texts[nextIndex]!.length
    state.image = destination.image && (key === 'k' || requested >= destinationLength)
    state.cursor = state.image ? destinationLength : Math.min(requested, Math.max(0, destinationLength - 1))
    state.returned =
      state.image && key === 'k' && destinationLength > 0 ? Math.min(requested, destinationLength - 1) : undefined
  }
}

export const sequenceEventArbitrary: fc.Arbitrary<SequenceEvent> = fc.oneof(
  {
    weight: 5,
    arbitrary: fc.record({
      kind: fc.constant('motion' as const),
      key: fc.constantFrom<'h' | 'l' | 'j' | 'k'>('h', 'l', 'j', 'k'),
      count: fc.integer({ min: 1, max: 12 }),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('motion' as const),
      key: fc.constantFrom<'0' | '$'>('0', '$'),
      count: fc.constant(1),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('delete' as const), count: fc.integer({ min: 1, max: 8 }) }) },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('replace-character' as const),
      count: fc.integer({ min: 1, max: 6 }),
      character: fc.constantFrom<'Z' | 'q'>('Z', 'q'),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('focus' as const), index: fc.nat(8), position: fc.nat(12) }) },
  {
    weight: 1,
    arbitrary: fc.record({ kind: fc.constant('interrupt' as const), count: fc.integer({ min: 1, max: 9 }) }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('history' as const),
      direction: fc.constantFrom<'undo' | 'redo'>('undo', 'redo'),
      shortcut: fc.boolean(),
    }),
  },
)
