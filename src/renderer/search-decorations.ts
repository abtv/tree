import { prepareSearch, searchText, type TextMatch } from '../domain/text-search'
import { nodeSearchHighlights } from '../domain/node-search-query'
import type { TextDecoration } from './editor-dom'
import { useEffect, useState } from 'react'

/** Only mounted text is scanned. Oversized rows and pasted queries yield too. */
export function useSearchDecorations(
  text: string,
  query: string,
  tagMatches?: readonly TextMatch[],
): readonly TextDecoration[] {
  const [result, setResult] = useState<{
    text: string
    query: string
    tagMatches: readonly TextMatch[] | undefined
    ranges: TextDecoration[]
  }>()
  useEffect(() => {
    if (!query) return
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
      const pattern = yield* prepareSearch(query)
      const ranges: TextDecoration[] = []
      for (const match of searchText(text, pattern)) {
        if (match !== undefined) ranges.push({ ...match, className: 'search-match' })
        yield undefined
      }
      return ranges
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
  }, [text, query, tagMatches])
  return query && result?.text === text && result.query === query && result.tagMatches === tagMatches
    ? result.ranges
    : []
}
