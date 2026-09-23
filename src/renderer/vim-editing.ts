export type VimMode = 'insert' | 'normal' | 'visual'

export function moveWordForward(text: string, cursor: number): number {
  let next = Math.min(cursor + 1, text.length)
  while (next < text.length && /\w/u.test(text[next] ?? '')) next += 1
  while (next < text.length && !/\w/u.test(text[next] ?? '')) next += 1
  return next
}

export function moveWordBackward(text: string, cursor: number): number {
  let next = Math.max(cursor - 1, 0)
  while (next > 0 && !/\w/u.test(text[next] ?? '')) next -= 1
  while (next > 0 && /\w/u.test(text[next - 1] ?? '')) next -= 1
  return next
}

export function firstNonWhitespace(text: string): number {
  return text.search(/\S/u) === -1 ? 0 : text.search(/\S/u)
}

export function vimPastePosition(textLength: number, cursor: number, after: boolean): number {
  const boundedCursor = Math.max(0, Math.min(cursor, textLength))
  return after ? Math.min(boundedCursor + 1, textLength) : boundedCursor
}
