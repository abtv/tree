import {
  currentWordEnd,
  findCharacter,
  firstNonWhitespace,
  moveWORDBackward,
  moveWORDEnd,
  moveWORDForward,
  moveWordBackward,
  moveWordEnd,
  moveWordEndBackward,
  moveWordForward,
  textObjectRange,
} from './vim-editing'
import {
  applySurroundEdits,
  surroundChangeEdits,
  surroundDeleteEdits,
  surroundLineRange,
  surroundWrapEdits,
  type VimSurroundEdits,
} from './vim-surround'
import type { LinkedTextEdit, LinkRange } from '../domain/document'
import type { VimFindCommand } from './vim-keyboard-types'
import type { VimSurroundChange, VimTextChange } from './vim-keyboard-types'
import { vimPastePosition } from './vim-editing'

// Mutation triage: `Number('')` is `0`, which the surrounding `Math.max(1, ...)` raises to `1`, so
// both the empty-string test and its forced-false branch are equivalent to the literal `1`.
export function parseCount(value: string): number {
  return value === '' ? 1 : Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Number(value)))
}

export function isTextMotion(key: string): boolean {
  return 'hlwWbBeE0^$'.includes(key) && key.length === 1
}

export function isTextObjectKey(key: string): boolean {
  return key.length === 1 && 'wW"\'`()[]{}<>'.includes(key)
}

export function insertPosition(text: string, cursor: number, entry: 'i' | 'a' | 'I' | 'A'): number {
  if (entry === 'I') return firstNonWhitespace(text)
  if (entry === 'A') return text.length
  if (entry === 'a') return Math.min(cursor + 1, text.length)
  return cursor
}

/** Clamp a completed Normal-mode edit to text, or to its terminal image character. */
export function normalEditCursor(cursor: number, textLength: number, hasAttachment: boolean): number {
  return Math.max(0, Math.min(cursor, hasAttachment ? textLength : Math.max(0, textLength - 1)))
}

interface TextMotionResult {
  target: number
  start: number
  end: number
}

export function textMotion(
  text: string,
  cursor: number,
  motion: string,
  count: number,
  changeWord = false,
): TextMotionResult | undefined {
  const length = text.length
  let target = cursor
  let start = cursor
  let end: number
  if (motion.length === 2 && (motion[0] === 'i' || motion[0] === 'a') && isTextObjectKey(motion[1]!)) {
    const range = textObjectRange(text, cursor, motion[0], motion[1]!, count)
    if (range === undefined) return undefined
    return { target: range.start, start: range.start, end: range.end }
  }
  if (motion === 'x') end = Math.min(length, cursor + count)
  else if (motion === 'X') {
    start = Math.max(0, cursor - count)
    end = cursor
    target = start
  } else if (motion === 'all') {
    start = 0
    end = length
    target = 0
  } else if (motion === '0' || motion === '^') {
    target = motion === '0' ? 0 : firstNonWhitespace(text)
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
  } else if (motion === '$') {
    target = Math.max(0, length - 1)
    end = length
  } else if (motion === 'h' || motion === 'l') {
    target = Math.max(0, Math.min(length, cursor + (motion === 'h' ? -count : count)))
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
  } else if (
    motion === 'w' ||
    motion === 'W' ||
    motion === 'b' ||
    motion === 'B' ||
    motion === 'e' ||
    motion === 'E' ||
    motion === 'ge'
  ) {
    for (let index = 0; index < count; index += 1) {
      const before = target
      if (motion === 'b') target = moveWordBackward(text, target)
      else if (motion === 'B') target = moveWORDBackward(text, target)
      else if (motion === 'e') target = moveWordEnd(text, target)
      else if (motion === 'E') target = moveWORDEnd(text, target)
      else if (motion === 'ge') target = moveWordEndBackward(text, target)
      else if (motion === 'W') target = moveWORDForward(text, target)
      // Mutation triage: only `w` reaches this arm, so forcing `motion === 'w'` true is equivalent.
      else if (motion === 'w' && changeWord && /\S/u.test(text[cursor] ?? '') && index === count - 1)
        target = currentWordEnd(text, target)
      else target = moveWordForward(text, target)
      if (target === before) break
    }
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
    if (motion === 'e' || motion === 'E' || (motion === 'w' && changeWord && /\S/u.test(text[cursor] ?? '')))
      end = Math.min(length, end + 1)
    // Mutation triage: a motion is at most two characters, so removing the `^` anchor cannot make a
    // non-find motion match `[fFtT].`.
  } else if (/^[fFtT]./u.test(motion)) {
    const kind = motion[0]
    const found = findCharacter(
      text,
      cursor,
      motion.slice(1),
      // Mutation triage: `findCharacter` treats any direction other than `'forward'` as backward.
      kind === 'f' || kind === 't' ? 'forward' : 'backward',
      count,
    )
    if (found === undefined) return undefined
    target = kind === 't' ? found - 1 : kind === 'T' ? found + 1 : found
    start = Math.min(cursor, target)
    end = Math.max(cursor, target)
    if (kind === 'f' || kind === 't') end = Math.min(length, end + 1)
  } else return undefined
  return { target, start, end }
}

export function repeatedFindMotion(find: VimFindCommand | undefined, reverse: boolean): string | undefined {
  if (find === undefined) return undefined
  const kind = reverse ? (find.kind === 'f' ? 'F' : find.kind === 'F' ? 'f' : find.kind === 't' ? 'T' : 't') : find.kind
  return kind + find.character
}

export function transformCase(text: string, mode: 'toggle' | 'lower' | 'upper'): string {
  if (mode === 'lower') return text.toLocaleLowerCase()
  if (mode === 'upper') return text.toLocaleUpperCase()
  return Array.from(text, (character) =>
    character === character.toLocaleUpperCase() ? character.toLocaleLowerCase() : character.toLocaleUpperCase(),
  ).join('')
}

/**
 * The edits that change the case of `[start, end)` outside every hyperlink. A link's text is its URL,
 * so recasing it would change the address and drop the link; the case commands leave link text as it
 * is (`docs/PRODUCT.md` §20.2) and rewrite only the segments between links. Segments whose case does
 * not change produce no edit.
 */
export function caseEdits(
  text: string,
  links: readonly LinkRange[],
  start: number,
  end: number,
  mode: 'toggle' | 'lower' | 'upper',
): LinkedTextEdit[] {
  const edits: LinkedTextEdit[] = []
  const addSegment = (from: number, to: number): void => {
    if (to <= from) return
    const original = text.slice(from, to)
    const inserted = transformCase(original, mode)
    if (inserted !== original) edits.push({ start: from, end: to, inserted })
  }
  let from = start
  for (const link of [...links].sort((a, b) => a.start - b.start)) {
    if (link.end <= from) continue
    if (link.start >= end) break
    addSegment(from, link.start)
    from = Math.max(from, link.end)
  }
  addSegment(from, end)
  return edits
}

// Mutation triage: the two prefix bounds are redundant with each other, and a forced-true or
// inclusive bound still stops when `before[start]` and `after[start]` differ or one is undefined.
export function textDifference(before: string, after: string): { start: number; end: number; inserted: string } {
  let start = 0
  while (start < before.length && start < after.length && before[start] === after[start]) start += 1
  let suffix = 0
  while (
    suffix < before.length - start &&
    suffix < after.length - start &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix += 1
  return { start, end: before.length - suffix, inserted: after.slice(start, after.length - suffix) }
}

export type CalculatedTextChange =
  | { kind: 'yank'; registerText?: string }
  | {
      kind: 'edit'
      start: number
      end: number
      inserted: string
      nextText: string
      nextCursor: number
      registerText?: string
      /** Set for a case change: the disjoint edits that rewrite the range around its hyperlinks. */
      edits?: LinkedTextEdit[]
    }

export function calculateTextChange(
  text: string,
  cursor: number,
  change: VimTextChange,
  replay = false,
  links: readonly LinkRange[] = [],
): CalculatedTextChange | undefined {
  let caseEditList: LinkedTextEdit[] | undefined
  let start = cursor
  let end = cursor
  // Mutation triage: every branch that reads `inserted` assigns it first, so the initializer is dead.
  let inserted = ''
  let nextCursor = cursor
  if (change.kind === 'delete' || change.kind === 'change' || change.kind === 'yank') {
    const range = textMotion(text, cursor, change.motion, change.count, change.kind === 'change')
    if (range === undefined) return undefined
    start = range.start
    end = range.end
    if (change.kind === 'yank') {
      return { kind: 'yank', ...(start === end ? {} : { registerText: text.slice(start, end) }) }
    }
    inserted = change.insertedText ?? ''
    nextCursor = start + Math.max(0, inserted.length - 1)
  } else if (change.kind === 'replace') {
    end = cursor + change.count
    if (end > text.length || start === end) return undefined
    inserted = change.character.repeat(change.count)
    nextCursor = Math.max(cursor, end - 1)
  } else if (change.kind === 'substitute') {
    end = Math.min(text.length, cursor + change.count)
    inserted = change.insertedText ?? ''
    nextCursor = start + Math.max(0, inserted.length - 1)
  } else if (change.kind === 'insert') {
    start = insertPosition(text, cursor, change.entry)
    end = start
    inserted = change.insertedText ?? ''
    nextCursor = start + Math.max(0, inserted.length - 1)
  } else if (change.kind === 'paste') {
    start = vimPastePosition(text.length, cursor, change.after)
    end = start
    inserted = change.text
    // `gp` and `gP` leave the caret on the character after the text; the Normal caret clamps it.
    nextCursor = start + inserted.length - (change.past === true ? 0 : 1)
  } else if (change.kind === 'overwrite') {
    end = Math.min(text.length, cursor + change.replaced)
    inserted = change.text
    nextCursor = cursor + Math.max(0, inserted.length - 1)
    // Mutation triage: `case` is the last arm of an exhaustive union, so only `case` reaches it.
  } else if (change.kind === 'case') {
    if (change.motion === undefined) end = Math.min(text.length, cursor + change.count)
    else {
      const range = textMotion(text, cursor, change.motion, change.count)
      if (range === undefined) return undefined
      start = range.start
      end = range.end
    }
    if (start === end) return undefined
    caseEditList = caseEdits(text, links, start, end, change.mode)
    const recased = applySurroundEdits(text, caseEditList)
    inserted = recased.slice(start, recased.length - (text.length - end))
    // `~` advances past the changed text; an operator leaves the caret at the start of its range.
    nextCursor = change.motion === undefined ? start + inserted.length : start
  }
  const registerText =
    start !== end && (change.kind === 'delete' || change.kind === 'change' || change.kind === 'substitute')
      ? text.slice(start, end)
      : undefined
  // Mutation triage: this OR is evaluated only once `replay` is true, and callers set `replay` only
  // for insert/change/substitute, so forcing one disjunct true cannot change a replay.
  if (replay && (change.kind === 'insert' || change.kind === 'change' || change.kind === 'substitute')) {
    const baseline = text.slice(0, start) + text.slice(end)
    const position = Math.max(0, Math.min(start + (change.insertOffset ?? 0), baseline.length))
    const finalText =
      baseline.slice(0, position) +
      inserted +
      baseline.slice(Math.min(baseline.length, position + (change.deleteCount ?? 0)))
    const edit = textDifference(text, finalText)
    start = edit.start
    end = edit.end
    inserted = edit.inserted
    nextCursor = Math.max(0, position + (change.insertedText ?? '').length - 1)
  }
  return {
    kind: 'edit',
    start,
    end,
    inserted,
    nextText: text.slice(0, start) + inserted + text.slice(end),
    nextCursor,
    // Mutation triage: spreading `{ registerText: undefined }` is the same for every value reader.
    ...(registerText === undefined ? {} : { registerText }),
    ...(caseEditList === undefined ? {} : { edits: caseEditList }),
  }
}

export type CalculatedSurround = VimSurroundEdits & { nextText: string }

/** Resolve a surround command into the disjoint edits that apply it and the resulting text. */
export function calculateSurround(
  text: string,
  cursor: number,
  change: VimSurroundChange,
): CalculatedSurround | undefined {
  const resolved = resolveSurroundEdits(text, cursor, change)
  if (resolved === undefined) return undefined
  return { ...resolved, nextText: applySurroundEdits(text, resolved.edits) }
}

function resolveSurroundEdits(text: string, cursor: number, change: VimSurroundChange): VimSurroundEdits | undefined {
  if (change.kind === 'surround-delete') return surroundDeleteEdits(text, cursor, change.target, change.count)
  if (change.kind === 'surround-change')
    return surroundChangeEdits(text, cursor, change.target, change.delimiter, change.count)
  const range =
    change.motion === 'line' ? surroundLineRange(text) : textMotion(text, cursor, change.motion, change.count)
  if (range === undefined) return undefined
  return surroundWrapEdits(range.start, range.end, change.delimiter)
}
