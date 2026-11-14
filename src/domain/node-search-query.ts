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
