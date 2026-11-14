import type { TreeNode } from './document-types'
import { nodeTags, tagPrefix, type TagPrefix } from './tags'
import { prepareSearch, searchText, type SearchPattern, type SearchWork, type TextMatch } from './text-search'

export interface NodeSearchTerm {
  readonly pattern: SearchPattern
  readonly prefix: TagPrefix | undefined
  readonly valid: boolean
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
    const pattern = yield* prepareSearch(prefix === undefined ? token : token.slice(1))
    const valid = prefix === undefined || /^[#@&][\p{L}\p{Nd}_-]+$/u.test(token)
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
): Generator<undefined, readonly TextMatch[]> {
  const terms = yield* prepareNodeSearch(query)
  let ranges = tagMatches
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
