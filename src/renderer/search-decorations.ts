import { prepareSearch, searchText, type TextMatch } from '../domain/text-search'
import { nodeSearchHighlights } from '../domain/node-search-query'
import type { TextDecoration } from './editor-dom'
import { useEffect, useMemo, useState } from 'react'

function* localRanges(text: string, query: string): Generator<undefined, TextDecoration[]> {
  const pattern = yield* prepareSearch(query)
  const ranges: TextDecoration[] = []
  for (const match of searchText(text, pattern)) {
    if (match !== undefined) ranges.push({ ...match, className: 'search-match' })
    yield undefined
  }
  return ranges
}

/** Only mounted text is scanned. Oversized rows and pasted queries yield too. */
export function useSearchDecorations(
  text: string,
  query: string,
  tagMatches?: readonly TextMatch[],
): readonly TextDecoration[] {
  // Bound the synchronous pass across mounted rows. Long text, pasted queries and
  // global multi-term results keep their incremental path.
  const immediate = useMemo(() => {
    if (!query) return []
    if (tagMatches !== undefined || text.length + query.length > 1024) return undefined
    const scan = localRanges(text, query)
    let step = scan.next()
    while (!step.done) step = scan.next()
    return step.value
  }, [text, query, tagMatches])
  const [result, setResult] = useState<{
    text: string
    query: string
    tagMatches: readonly TextMatch[] | undefined
    ranges: TextDecoration[]
  }>()
  useEffect(() => {
    if (immediate !== undefined) return
    function* scan(): Generator<undefined, TextDecoration[]> {
      if (tagMatches !== undefined) {
        const matches = yield* nodeSearchHighlights(text, query, tagMatches)
        const ranges: TextDecoration[] = []
        for (const match of matches) {
          ranges.push({ ...match, className: 'search-match' })
          yield undefined
        }
        return ranges
      }
      return yield* localRanges(text, query)
    }
    const work = scan()
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = (): void => {
      for (let step = 0; step < 2048; step++) {
        const next = work.next()
        if (next.done) {
          setResult({ text, query, tagMatches, ranges: next.value })
          return
        }
      }
      timer = setTimeout(run, 0)
    }
    run()
    return () => {
      clearTimeout(timer)
      work.return([])
    }
  }, [text, query, tagMatches, immediate])
  if (immediate !== undefined) {
    // Release the previous oversized row and its ranges when the fast path takes over.
    if (result !== undefined) setResult(undefined)
    return immediate
  }
  return result?.text === text && result.query === query && result.tagMatches === tagMatches ? result.ranges : []
}
