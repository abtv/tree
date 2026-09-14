export const SAVE_WORD_THRESHOLD = 10
export const SAVE_IDLE_MILLISECONDS = 10_000
export const SAVE_MAX_CONSECUTIVE_FAILURES = 3
export const CLEANUP_MAX_CONSECUTIVE_FAILURES = 3

function isWhitespace(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character)
}

function countWordStarts(text: string, preceding: string | undefined): number {
  let count = 0
  for (let index = 0; index < text.length; index += 1) {
    const current = text[index]!
    if (isWhitespace(current)) continue
    const before = index === 0 ? preceding : text[index - 1]
    if (isWhitespace(before)) count += 1
  }
  return count
}

export function countInsertedWords(previous: string, next: string): number {
  if (previous === next) return 0
  let prefix = 0
  const shared = Math.min(previous.length, next.length)
  while (prefix < shared && previous[prefix] === next[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - 1 - suffix] === next[next.length - 1 - suffix]
  ) {
    suffix += 1
  }
  const inserted = next.slice(prefix, next.length - suffix)
  return countWordStarts(inserted, prefix === 0 ? undefined : next[prefix - 1])
}

export function countPastedWords(pasted: string, preceding: string | undefined): number {
  const lines = pasted.replace(/\r\n?/g, '\n').split('\n')
  let count = 0
  for (let index = 0; index < lines.length; index += 1) {
    count += countWordStarts(lines[index]!, index === 0 ? preceding : undefined)
  }
  return count
}
