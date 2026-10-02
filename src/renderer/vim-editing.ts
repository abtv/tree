export type VimMode = 'insert' | 'normal' | 'replace' | 'visual' | 'visual-node'

export function moveCharacterCursor(
  cursor: number,
  direction: 'left' | 'right',
  textLength: number,
  hasAttachment: boolean,
  count = 1,
): number {
  const lastCharacter = hasAttachment ? textLength : Math.max(0, textLength - 1)
  return Math.max(0, Math.min(lastCharacter, cursor + (direction === 'left' ? -count : count)))
}

/** The final text character reached before a counted right motion clamps on the image. */
export function imageTextReturnCursor(cursor: number, count: number, textLength: number): number | undefined {
  if (textLength === 0) return undefined
  return Math.min(textLength - 1, cursor + count - 1)
}

type CharacterClass = 'space' | 'word' | 'punctuation'

// Mutation triage: only the `'space'` label is compared outside this function; `'word'` and
// `'punctuation'` only have to differ from it and from each other, so replacing a label with the
// empty string cannot change a motion or text-object result.
function characterClass(character: string): CharacterClass {
  if (/\s/u.test(character)) return 'space'
  if (/[\p{L}\p{N}_]/u.test(character)) return 'word'
  return 'punctuation'
}

export interface VimTextObjectRange {
  start: number
  end: number
}

const PAIRS: Record<string, string> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<' }

export function textObjectRange(
  text: string,
  cursor: number,
  modifier: 'i' | 'a',
  object: string,
  count = 1,
): VimTextObjectRange | undefined {
  if (text.length === 0 || count < 1) return undefined
  const position = Math.max(0, Math.min(cursor, text.length - 1))
  if (object === 'w' || object === 'W') {
    // Mutation triage: as in `characterClass`, the `'space'`/`'WORD'` labels only separate
    // whitespace from non-whitespace; the around-extension below re-tests whitespace directly.
    const classify = (character: string): string =>
      object === 'W' ? (/\s/u.test(character) ? 'space' : 'WORD') : characterClass(character)
    const kind = classify(text[position] ?? '')
    let start = position
    let end = position + 1
    while (start > 0 && classify(text[start - 1] ?? '') === kind) start -= 1
    while (end < text.length && classify(text[end] ?? '') === kind) end += 1
    // Mutation triage: `end` never exceeds `text.length` here, so an inclusive bound or forced-true
    // guard reads only the empty string at `text[text.length]`, which cannot extend a run.
    for (let index = 1; index < count; index += 1) {
      if (end >= text.length) break
      const nextKind = classify(text[end] ?? '')
      while (end < text.length && classify(text[end] ?? '') === nextKind) end += 1
      if (nextKind === 'space' && end < text.length) {
        const following = classify(text[end] ?? '')
        while (end < text.length && classify(text[end] ?? '') === following) end += 1
      }
    }
    // Mutation triage: forcing this guard true only enters whitespace re-tests that the characters
    // already decide, and the inclusive bounds read an undefined non-space neighbor at the node edge.
    if (modifier === 'a' && kind !== 'space') {
      if (end < text.length && /\s/u.test(text[end] ?? '')) {
        while (end < text.length && /\s/u.test(text[end] ?? '')) end += 1
      } else {
        while (start > 0 && /\s/u.test(text[start - 1] ?? '')) start -= 1
      }
    }
    return { start, end }
  }
  // Mutation triage: bounds that read one past the end see a non-quote character; the backslash
  // accumulator's sign does not change its parity; and a missing pair falls through to `undefined`
  // whether or not the explicit guards run.
  if (object === '"' || object === "'" || object === '`') {
    const delimiters: number[] = []
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== object) continue
      let backslashes = 0
      for (let before = index - 1; before >= 0 && text[before] === '\\'; before -= 1) backslashes += 1
      if (backslashes % 2 === 0) delimiters.push(index)
    }
    for (let index = 0; index + 1 < delimiters.length; index += 2) {
      const open = delimiters[index]!
      const close = delimiters[index + 1]!
      if (open <= position && position <= close && count === 1)
        return modifier === 'a' ? { start: open, end: close + 1 } : { start: open + 1, end: close }
    }
    return undefined
  }
  // Mutation triage: a stray close pops an injected or empty stack element, whose numeric
  // comparison is false; past-end reads cannot equal a bracket; and the redundant open guard is
  // covered by that numeric comparison.
  const pair = PAIRS[object]
  if (pair === undefined) return undefined
  const openCharacter = '([{<'.includes(object) ? object : pair
  const closeCharacter = '([{<'.includes(object) ? pair : object
  const stack: number[] = []
  const enclosing: VimTextObjectRange[] = []
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === openCharacter) stack.push(index)
    else if (text[index] === closeCharacter) {
      const open = stack.pop()
      if (open !== undefined && open <= position && position <= index) enclosing.push({ start: open, end: index + 1 })
    }
  }
  const match = enclosing[count - 1]
  if (match === undefined) return undefined
  return modifier === 'a' ? match : { start: match.start + 1, end: match.end - 1 }
}

// Mutation triage: entering the run on whitespace consumes the same run before the whitespace
// skip, and an inclusive or forced-true bound reads the empty string at the node edge.
export function moveWordForward(text: string, cursor: number): number {
  let next = Math.max(0, Math.min(cursor, text.length))
  if (next < text.length && characterClass(text[next] ?? '') !== 'space') {
    const kind = characterClass(text[next] ?? '')
    while (next < text.length && characterClass(text[next] ?? '') === kind) next += 1
  }
  while (next < text.length && characterClass(text[next] ?? '') === 'space') next += 1
  return next
}

export function moveWordBackward(text: string, cursor: number): number {
  let next = Math.max(cursor - 1, 0)
  while (next > 0 && characterClass(text[next] ?? '') === 'space') next -= 1
  const kind = characterClass(text[next] ?? '')
  while (next > 0 && characterClass(text[next - 1] ?? '') === kind) next -= 1
  return next
}

// Mutation triage: an over-extended clamp is corrected by the terminal guard below; entering the
// space skip from a non-space reaches the same run end; and inclusive bounds read the empty string
// at the node edge.
export function moveWordEnd(text: string, cursor: number): number {
  if (text.length === 0) return 0
  let next = Math.max(0, Math.min(cursor, text.length - 1))
  if (characterClass(text[next] ?? '') !== 'space') next += 1
  while (next < text.length && characterClass(text[next] ?? '') === 'space') next += 1
  if (next >= text.length) return text.length - 1
  const kind = characterClass(text[next] ?? '')
  while (next + 1 < text.length && characterClass(text[next + 1] ?? '') === kind) next += 1
  return next
}

// Mutation triage: as in `moveWordForward`, forcing the whitespace skip true reads only the node
// edge, where the empty string is not whitespace.
export function moveWORDForward(text: string, cursor: number): number {
  let next = Math.max(0, Math.min(cursor, text.length))
  while (next < text.length && !/\s/u.test(text[next] ?? '')) next += 1
  while (next < text.length && /\s/u.test(text[next] ?? '')) next += 1
  return next
}

export function moveWORDBackward(text: string, cursor: number): number {
  let next = Math.max(cursor - 1, 0)
  while (next > 0 && /\s/u.test(text[next] ?? '')) next -= 1
  while (next > 0 && !/\s/u.test(text[next - 1] ?? '')) next -= 1
  return next
}

// Mutation triage: an over-extended clamp falls through to the terminal guard; forcing the
// non-whitespace test true lets the following run scan reach the same WORD end; and inclusive
// bounds read the empty string at the node edge.
export function moveWORDEnd(text: string, cursor: number): number {
  if (text.length === 0) return 0
  let next = Math.max(0, Math.min(cursor, text.length - 1))
  if (!/\s/u.test(text[next] ?? '')) next += 1
  while (next < text.length && /\s/u.test(text[next] ?? '')) next += 1
  if (next >= text.length) return text.length - 1
  while (next + 1 < text.length && !/\s/u.test(text[next + 1] ?? '')) next += 1
  return next
}

// Mutation triage: the empty-text and non-positive-cursor guards both return `0` on their own, and
// the inclusive scan bounds stop at the same non-matching or out-of-range character.
export function moveWordEndBackward(text: string, cursor: number): number {
  if (text.length === 0 || cursor <= 0) return 0
  let next = Math.min(cursor - 1, text.length - 1)
  const currentKind = characterClass(text[Math.min(cursor, text.length - 1)] ?? '')
  if (currentKind !== 'space' && characterClass(text[next] ?? '') === currentKind) {
    while (next >= 0 && characterClass(text[next] ?? '') === currentKind) next -= 1
  }
  while (next > 0 && /\s/u.test(text[next] ?? '')) next -= 1
  return Math.max(0, next)
}

// Mutation triage: the empty-text guard returns `0`, and the unguarded path also returns `0`.
export function currentWordEnd(text: string, cursor: number): number {
  if (text.length === 0) return 0
  let next = Math.max(0, Math.min(cursor, text.length - 1))
  const kind = characterClass(text[next] ?? '')
  while (next + 1 < text.length && characterClass(text[next + 1] ?? '') === kind) next += 1
  return next
}

export function findCharacter(
  text: string,
  cursor: number,
  character: string,
  direction: 'forward' | 'backward',
  count = 1,
): number | undefined {
  let position = cursor
  for (let index = 0; index < count; index += 1) {
    position =
      direction === 'forward' ? text.indexOf(character, position + 1) : text.lastIndexOf(character, position - 1)
    if (position < 0) return undefined
  }
  return position
}

export function firstNonWhitespace(text: string): number {
  return text.search(/\S/u) === -1 ? 0 : text.search(/\S/u)
}

export function vimPastePosition(textLength: number, cursor: number, after: boolean): number {
  const boundedCursor = Math.max(0, Math.min(cursor, textLength))
  return after ? Math.min(boundedCursor + 1, textLength) : boundedCursor
}

export function isImageCaretCursor(hasAttachment: boolean, textLength: number, cursor: number): boolean {
  return hasAttachment && cursor >= textLength
}
