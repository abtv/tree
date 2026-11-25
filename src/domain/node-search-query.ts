import type { TreeNode } from './document-types'
import { tagNameMatch } from './tag-search'
import { nodeTags, tagPrefix, type TagPrefix } from './tags'
import {
  prepareSearch,
  searchText,
  wholeSearchMatcher,
  type SearchPattern,
  type SearchWork,
  type TextMatch,
} from './text-search'

export interface NodeSearchTerm {
  readonly pattern: SearchPattern
  readonly prefix: TagPrefix | undefined
  readonly valid: boolean
}

export interface InferredSearchMarker {
  readonly fragment: string
  readonly name: string
}

/** A complete marker term uses the same syntax for matching and query presentation. */
export function validNodeSearchMarker(text: string): TagPrefix | undefined {
  return /^[#@&][\p{L}\p{Nd}_-]+$/u.test(text) ? tagPrefix(text) : undefined
}

/** Locate the marker term at the caret, retaining the surrounding query. */
export function nodeSearchCompletionTerm(
  query: string,
  caret = query.length,
): { readonly start: number; readonly end: number; readonly text: string } | undefined {
  let start = Math.max(0, Math.min(caret, query.length))
  let end = start
  while (start > 0 && !/\s/u.test(query[start - 1]!)) start--
  while (end < query.length && !/\s/u.test(query[end]!)) end++

  const text = query.slice(start, end)
  return tagPrefix(text) === undefined ? undefined : { start, end, text }
}

/** Prepare each term independently so an uppercase term does not change its neighbours. */
export function* prepareNodeSearch(query: string): Generator<undefined, readonly NodeSearchTerm[]> {
  const terms: NodeSearchTerm[] = []
  const seen = new Set<string>()
  let token = ''
  function* append(): Generator<undefined> {
    if (!token || seen.has(token)) return
    seen.add(token)
    const prefix = tagPrefix(token)
    const pattern = yield* prepareSearch(prefix === undefined ? token : token.slice(1), {
      nativeShortText: prefix === undefined,
    })
    const valid = prefix === undefined || validNodeSearchMarker(token) !== undefined
    terms.push({ pattern, prefix, valid })
  }

  for (const character of query) {
    if (/\s/u.test(character)) {
      yield* append()
      token = ''
    } else token += character
    yield undefined
  }
  yield* append()
  return terms
}

/** Marker terms retain recognized-tag boundaries; ordinary terms are literal substrings. */
export function* searchNodeTerm(node: TreeNode, term: NodeSearchTerm): SearchWork<TextMatch> {
  if (term.prefix === undefined) {
    yield* searchText(node.text, term.pattern)
    if (node.attachment?.searchText) yield* searchText(node.attachment.searchText, term.pattern)
    return
  }
  if (!term.valid) return
  for (const match of nodeTags(node, term.prefix)) {
    yield undefined
    for (const nameMatch of searchText(match.name, term.pattern)) {
      yield undefined
      if (nameMatch?.start === 0 && nameMatch.end === match.name.length) {
        yield { start: match.start, end: match.end }
        break
      }
    }
  }
}

/** Merge sorted highlight ranges without duplicating text or blocking cancellation. */
export function* mergeSearchMatches(
  left: readonly TextMatch[],
  right: readonly TextMatch[],
): Generator<undefined, TextMatch[]> {
  const merged: TextMatch[] = []
  let a = 0
  let b = 0
  while (a < left.length || b < right.length) {
    const match = b >= right.length || (a < left.length && left[a]!.start <= right[b]!.start) ? left[a++]! : right[b++]!
    const previous = merged.at(-1)
    if (previous !== undefined && match.start < previous.end) {
      merged[merged.length - 1] = { start: previous.start, end: Math.max(previous.end, match.end) }
    } else merged.push(match)
    yield undefined
  }
  return merged
}

/** Marker ranges come from actual nodes, retaining link exclusions and complete names. */
export function* nodeSearchHighlights(
  text: string,
  query: string,
  tagMatches: readonly TextMatch[],
  markerFragments?: readonly InferredSearchMarker[],
): Generator<undefined, readonly TextMatch[]> {
  const terms = yield* prepareNodeSearch(query)
  let ranges =
    markerFragments === undefined ? tagMatches : yield* fragmentMarkerRanges(text, terms, tagMatches, markerFragments)
  for (const term of terms) {
    if (term.prefix !== undefined) continue
    const matches: TextMatch[] = []
    for (const match of searchText(text, term.pattern)) {
      if (match !== undefined) matches.push(match)
      yield undefined
    }
    ranges = yield* mergeSearchMatches(ranges, matches)
  }
  return ranges
}

/** The search supplies recognized occurrences. Trim only ranges not matched by an explicit full term. */
function* fragmentMarkerRanges(
  text: string,
  terms: readonly NodeSearchTerm[],
  ranges: readonly TextMatch[],
  fragments: readonly InferredSearchMarker[],
): Generator<undefined, TextMatch[]> {
  const markerTerms = terms.filter((term) => term.prefix !== undefined && term.valid)
  const inferred = new Map<string, { fragment: string; matches: (name: string) => boolean }[]>()
  for (const { fragment, name } of fragments) {
    yield undefined
    const prefix = fragment[0]!
    const matchers = inferred.get(prefix) ?? []
    matchers.push({ fragment: fragment.slice(1), matches: wholeSearchMatcher(name) })
    inferred.set(prefix, matchers)
  }
  const highlights: TextMatch[] = []
  marker: for (const range of ranges) {
    yield undefined
    const prefix = text[range.start]!
    const matchers = inferred.get(prefix)
    if (matchers === undefined) {
      highlights.push(range)
      continue
    }
    const name = text.slice(range.start + 1, range.end)
    for (const term of markerTerms) {
      if (term.prefix !== prefix) continue
      for (const match of searchText(name, term.pattern)) {
        yield undefined
        if (match?.start !== 0 || match.end !== name.length) continue
        highlights.push(range)
        continue marker
      }
    }
    const parts: TextMatch[] = []
    for (const matcher of matchers) {
      yield undefined
      if (!matcher.matches(name)) continue
      const match = tagNameMatch(name, matcher.fragment)
      if (match !== undefined) {
        parts.push({
          start: range.start + (match.start === 0 ? 0 : 1 + match.start),
          end: range.start + 1 + match.end,
        })
      }
    }
    if (parts.length === 1) highlights.push(parts[0]!)
    else if (parts.length > 1) {
      const merged = yield* mergeSearchMatches(
        parts.sort((a, b) => a.start - b.start),
        [],
      )
      for (const match of merged) {
        yield undefined
        highlights.push(match)
      }
    }
  }
  return highlights
}
