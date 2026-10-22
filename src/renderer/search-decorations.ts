import { prepareSearch, searchText } from '../domain/text-search'
import type { TextDecoration } from './editor-dom'
import { useEffect, useState } from 'react'

/** Only mounted text is scanned. Oversized rows and pasted queries yield too. */
export function useSearchDecorations(text: string, query: string): readonly TextDecoration[] {
  const [result, setResult] = useState<{ text: string; query: string; ranges: TextDecoration[] }>()
  useEffect(() => {
    if (!query) return
    function* scan(): Generator<undefined, TextDecoration[]> {
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
          setResult({ text, query, ranges: next.value })
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
  }, [text, query])
  return query && result?.text === text && result.query === query ? result.ranges : []
}
