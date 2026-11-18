import { expect, it } from 'vitest'
import fc from 'fast-check'
import { searchHarness } from './test/search-harness'
import type { SearchPosition, SearchRequest } from './search-executor'
import type { DayNumber } from '../domain/calendar-date'

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

it('preserves streaming navigation from captured, matching, manual and missing origins with exact results', () => {
  fc.assert(
    fc.property(
      fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 2, maxLength: 10 }),
      fc.nat(),
      fc.integer({ min: 0, max: 12 }),
      fc.constantFrom(1, 2, 19, Number.MAX_SAFE_INTEGER),
      fc.boolean(),
      fc.boolean(),
      (sizes, seed, offset, count, agenda, fromHeading) => {
        const roots = sizes.map((size, index) => ({ id: String(index), text: 'a\u0301 '.repeat(size), children: [] }))
        const days = [1, 2].map((d) => ({
          day: d as DayNumber,
          rows: roots.map((n) => ({ nodeId: n.id, depth: 0, role: 'match' as const })),
        }))
        const context: SearchRequest = {
          id: 1,
          revision: 1,
          scopeKey: 'test',
          document: { roots },
          query: '\u0301',
          scope: agenda ? { kind: 'agenda', projection: days } : { kind: 'tree', parentId: null },
          operation: {
            kind: 'count',
            collect: { origin: { nodeId: '0', offset: 0, ...(agenda && { day: days[0]!.day }) } },
          },
        }
        const harness = searchHarness()
        const result = harness.run(context)
        if (result.kind !== 'count' || !result.exact) throw new Error('Expected exact count')
        const origin: SearchPosition =
          agenda && fromHeading
            ? { beforeDay: 2 as DayNumber, offset }
            : {
                nodeId: String(seed % (sizes.length + 1)),
                offset,
                ...(agenda && { day: days[seed % 2]!.day }),
              }

        for (const direction of [-1, 1] as const) {
          const operation = { kind: 'navigate' as const, origin, direction, count }
          const streamed = harness.run({ ...context, operation })
          const cached = harness.run({ ...context, operation: { ...operation, exact: result.exact } })

          expect(cached).toEqual(streamed)
        }
      },
    ),
  )
})
