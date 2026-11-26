import { expect, it } from 'vitest'
import fc from 'fast-check'
import { prepareSearch, searchText } from './text-search'
import { searchScope } from './search-scope'

function pattern(query: string, nativeShortText = false) {
  const work = prepareSearch(query, { nativeShortText })
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

it('agrees with Unicode regular-expression matching across scripts, case folds and astral characters', () => {
  const characters = [
    ...['a', 'A', 's', 'S', 'ſ', 'k', 'K', 'K', 'ß', 'ẞ', 'к', 'К', 'ё', 'Ё', 'σ', 'ς', 'Σ'],
    ...['\u{10400}', '\u{10428}', '😀', '́', ' ', '.'],
    // Lone surrogates, which adjacent draws can also join into a pair.
    ...['\ud83d', '\ude00'],
  ]
  const text = (maxLength: number) =>
    fc.array(fc.constantFrom(...characters), { maxLength }).map((parts) => parts.join(''))

  fc.assert(
    fc.property(text(60), text(4), (source, query) => {
      const literal = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const expected =
        query.length === 0
          ? []
          : [...source.matchAll(new RegExp(literal, /\p{Lu}/u.test(query) ? 'gu' : 'giu'))].map((match) => ({
              start: match.index,
              end: match.index + match[0].length,
            }))

      for (const nativeShortText of [false, true])
        expect([...searchText(source, pattern(query, nativeShortText))].filter((match) => match !== undefined)).toEqual(
          expected,
        )
    }),
  )
})

it('resumes the right match offset when iterators share a native pattern', () => {
  const prepared = pattern('.', true)
  const first = searchText('.. .,', prepared)
  const other = searchText('... .', prepared)

  expect(first.next().value).toEqual({ start: 0, end: 1 })
  expect(other.next().value).toEqual({ start: 0, end: 1 })
  expect(other.next().value).toEqual({ start: 1, end: 2 })
  expect(first.next().value).toEqual({ start: 1, end: 2 })
  expect(first.next().value).toEqual({ start: 3, end: 4 })
  expect(other.next().value).toEqual({ start: 2, end: 3 })
  expect(other.next().value).toEqual({ start: 4, end: 5 })
  expect(other.next().done).toBe(true)
})

it('uses bounded native work only when both the query and row fit the native limits', () => {
  const atQueryLimit = pattern('z'.repeat(32), true)
  const beyondQueryLimit = pattern('z'.repeat(33), true)
  const atTextLimit = 'a'.repeat(512)
  const beyondTextLimit = 'a'.repeat(513)

  expect([...searchText(atTextLimit, atQueryLimit)]).toEqual([undefined])
  expect([...searchText(beyondTextLimit, atQueryLimit)]).toHaveLength(64)
  expect([...searchText(atTextLimit, beyondQueryLimit)]).toHaveLength(64)
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
