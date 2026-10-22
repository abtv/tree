import { expect, it } from 'vitest'
import fc from 'fast-check'
import { searchHarness } from './test/search-harness'

it('navigates both directions through the same ordered corpus after reorder and removal', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 1, maxLength: 12 }),
      fc.integer({ min: 1, max: 1000 }),
      (sizes, count) => {
        const roots = sizes.map((size, index) => ({ id: String(index), text: 'x '.repeat(size), children: [] }))
        for (const ordered of [roots, [...roots].reverse(), roots.slice(1)]) {
          const matches = ordered.flatMap((node) =>
            Array.from({ length: node.text.length / 2 }, (_, index) => ({ nodeId: node.id, offset: index * 2 })),
          )
          if (matches.length === 0) continue
          const originIndex = Math.floor(matches.length / 2)
          const origin = matches[originIndex]!
          for (const direction of [-1, 1] as const) {
            const expectedIndex =
              (((originIndex + direction * count) % matches.length) + matches.length) % matches.length
            const expected = matches[expectedIndex]!
            const result = searchHarness().run({
              id: 1,
              revision: 1,
              scopeKey: 'root',
              scope: { kind: 'tree', parentId: null },
              document: { roots: ordered },
              query: 'x',
              operation: { kind: 'navigate', origin, direction, count },
            })
            expect(result).toMatchObject({
              kind: 'navigate',
              ordinal: expectedIndex + 1,
              total: matches.length,
              destination: { nodeId: expected.nodeId, start: expected.offset },
            })
          }
        }
      },
    ),
  )
})
