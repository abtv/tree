export type VimMode = 'insert' | 'normal' | 'replace' | 'visual'

type CharacterClass = 'space' | 'word' | 'punctuation'

function characterClass(character: string): CharacterClass {
  if (/\s/u.test(character)) return 'space'
  if (/[\p{L}\p{N}_]/u.test(character)) return 'word'
  return 'punctuation'
}

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

export function moveWORDEnd(text: string, cursor: number): number {
  if (text.length === 0) return 0
  let next = Math.max(0, Math.min(cursor, text.length - 1))
  if (!/\s/u.test(text[next] ?? '')) next += 1
  while (next < text.length && /\s/u.test(text[next] ?? '')) next += 1
  if (next >= text.length) return text.length - 1
  while (next + 1 < text.length && !/\s/u.test(text[next + 1] ?? '')) next += 1
  return next
}

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
