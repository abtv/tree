import { firstNonWhitespace, textObjectRange } from './vim-editing'

export interface VimSurroundPair {
  open: string
  close: string
}

/** Delimiter keys accepted where vim-surround expects a target or a replacement. */
const ALIASES: Record<string, string> = { b: ')', B: '}', r: ']', a: '>' }

const PAIRS: Record<string, VimSurroundPair> = {
  '(': { open: '( ', close: ' )' },
  ')': { open: '(', close: ')' },
  '[': { open: '[ ', close: ' ]' },
  ']': { open: '[', close: ']' },
  '{': { open: '{ ', close: ' }' },
  '}': { open: '{', close: '}' },
  '<': { open: '< ', close: ' >' },
  '>': { open: '<', close: '>' },
  '"': { open: '"', close: '"' },
  "'": { open: "'", close: "'" },
  '`': { open: '`', close: '`' },
}

export function surroundDelimiterKey(key: string): string | undefined {
  const resolved = ALIASES[key] ?? key
  return PAIRS[resolved] === undefined ? undefined : resolved
}

export function surroundPair(key: string): VimSurroundPair | undefined {
  const resolved = surroundDelimiterKey(key)
  // Mutation triage: indexing `PAIRS` with `undefined` is `undefined` just like the guard's result.
  return resolved === undefined ? undefined : PAIRS[resolved]
}

/** Opening bracket keys pad the inside; their closing counterparts do not. */
function padsInside(key: string): boolean {
  return '([{<'.includes(key)
}

export interface VimSurroundEdits {
  edits: { start: number; end: number; inserted: string }[]
  cursor: number
}

/** The text that results from applying an already-disjoint, ordered edit list. */
export function applySurroundEdits(
  text: string,
  edits: readonly { start: number; end: number; inserted: string }[],
): string {
  let output = ''
  let consumed = 0
  for (const edit of edits) {
    output += text.slice(consumed, edit.start) + edit.inserted
    consumed = edit.end
  }
  return output + text.slice(consumed)
}

/** Wrap [start, end) in the delimiters named by `key`. */
export function surroundWrapEdits(start: number, end: number, key: string): VimSurroundEdits | undefined {
  const pair = surroundPair(key)
  if (pair === undefined || end <= start) return undefined
  return {
    edits: [
      { start, end: start, inserted: pair.open },
      { start: end, end, inserted: pair.close },
    ],
    cursor: start,
  }
}

/** The whole-node range used by `yss`, which ignores leading whitespace as Vim's line range does. */
export function surroundLineRange(text: string): { start: number; end: number } {
  // Mutation triage: `firstNonWhitespace('')` is `0`, so the empty-text guard is redundant.
  return { start: text.length === 0 ? 0 : firstNonWhitespace(text), end: text.length }
}

interface SurroundTarget {
  around: { start: number; end: number }
  inner: { start: number; end: number }
}

function locateTarget(text: string, cursor: number, key: string, count: number): SurroundTarget | undefined {
  const resolved = surroundDelimiterKey(key)
  // Mutation triage: an unresolved key also makes both `textObjectRange` lookups undefined.
  if (resolved === undefined) return undefined
  // Mutation triage: any modifier other than `'a'` is the inner form, so replacing `'i'` is a no-op.
  const around = textObjectRange(text, cursor, 'a', resolved, count)
  const inner = textObjectRange(text, cursor, 'i', resolved, count)
  // Mutation triage: around and inner come from the same match, so they are undefined together.
  if (around === undefined || inner === undefined) return undefined
  return { around, inner }
}

/**
 * Trim one padding space from each side of the inner range when the target key is an opening
 * bracket, mirroring how that key pads the inside when it is used as a replacement.
 */
function trimmedInner(text: string, target: SurroundTarget, key: string): { start: number; end: number } {
  // Mutation triage: `surroundDelimiterKey` returns only opening brackets (all truthy) or
  // `undefined`, and `padsInside` accepts only opening brackets, so `??` and `&&` agree.
  const resolved = surroundDelimiterKey(key) ?? key
  if (!padsInside(resolved)) return target.inner
  const start = text[target.inner.start] === ' ' ? target.inner.start + 1 : target.inner.start
  // Mutation triage: forcing or widening this guard can only drop one padding space that the
  // disjoint surrounding edit already consumes, so the produced text is unchanged.
  const end = target.inner.end > start && text[target.inner.end - 1] === ' ' ? target.inner.end - 1 : target.inner.end
  return { start, end }
}

/** Remove the nearest enclosing pair named by `key`. */
export function surroundDeleteEdits(
  text: string,
  cursor: number,
  key: string,
  count: number,
): VimSurroundEdits | undefined {
  const target = locateTarget(text, cursor, key, count)
  if (target === undefined) return undefined
  const inner = trimmedInner(text, target, key)
  return {
    edits: [
      { start: target.around.start, end: inner.start, inserted: '' },
      { start: inner.end, end: target.around.end, inserted: '' },
    ],
    cursor: target.around.start,
  }
}

/** Replace the nearest enclosing pair named by `target` with the pair named by `replacement`. */
export function surroundChangeEdits(
  text: string,
  cursor: number,
  target: string,
  replacement: string,
  count: number,
): VimSurroundEdits | undefined {
  const located = locateTarget(text, cursor, target, count)
  const pair = surroundPair(replacement)
  if (located === undefined || pair === undefined) return undefined
  const inner = trimmedInner(text, located, target)
  return {
    edits: [
      { start: located.around.start, end: inner.start, inserted: pair.open },
      { start: inner.end, end: located.around.end, inserted: pair.close },
    ],
    cursor: located.around.start,
  }
}
