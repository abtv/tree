import { expect, it } from 'vitest'
import fc from 'fast-check'
import { prepareSearch, searchText } from './text-search'
import { searchScope } from './search-scope'

function pattern(query: string) {
  const work = prepareSearch(query)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

it('agrees with forward literal nonoverlapping search for arbitrary ASCII text', () => {
  fc.assert(
    fc.property(fc.string(), fc.string({ maxLength: 20 }), (text, query) => {
      const source = /[A-Z]/.test(query) ? text : text.toLowerCase()
      const expected: { start: number; end: number }[] = []
      if (query.length > 0) {
        let offset = source.indexOf(query)
        while (offset !== -1) {
          expected.push({ start: offset, end: offset + query.length })
          offset = source.indexOf(query, offset + query.length)
        }
      }
      expect([...searchText(text, pattern(query))].filter((match) => match !== undefined)).toEqual(expected)
    }),
  )
})

it('keeps DFS identity and order after moving branches without mutating nodes', () => {
  fc.assert(
    fc.property(fc.array(fc.string(), { maxLength: 50 }), (texts) => {
      const roots = texts.map((text, index) => ({
        id: `p${index}`,
        text,
        children: [{ id: `c${index}`, text, children: [] }],
      }))
      const document = { roots }
      const moved = { roots: [...roots].reverse() }
      for (const current of [document, moved]) {
        const rows = [...searchScope(current, { kind: 'tree', parentId: null })].filter((row) => row !== undefined)
        expect(rows.map((row) => row.nodeId)).toEqual(current.roots.flatMap((root) => [root.id, root.children[0]!.id]))
      }
      expect(document.roots).toBe(roots)
    }),
  )
})
