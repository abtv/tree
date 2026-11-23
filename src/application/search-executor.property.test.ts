import { expect, it } from 'vitest'
import fc from 'fast-check'
import { searchHarness } from './test/search-harness'
import type { SearchDestination, SearchNeighborhood, SearchPosition, SearchRequest } from './search-executor'
import type { DayNumber } from '../domain/calendar-date'
import { searchScope, type SearchScope, type SearchText } from '../domain/search-scope'

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

it('jumps from retained capped-search positions exactly as a fresh scan does', () => {
  const nodeText = fc.array(fc.constantFrom('a', 'a', 'b', ' '), { maxLength: 12 }).map((chars) => chars.join(''))
  const step = fc.record({
    origin: fc.constantFrom('repeat', 'repeat', 'repeat', 'manual', 'heading'),
    direction: fc.constantFrom(1 as const, -1 as const),
    count: fc.oneof(fc.constant(1), fc.integer({ min: 1, max: 300 }), fc.integer({ min: 1, max: 20_000 })),
    pick: fc.nat(),
    offset: fc.nat(),
  })
  fc.assert(
    fc.property(
      fc.array(fc.array(nodeText, { minLength: 1, maxLength: 4 }), { minLength: 1, maxLength: 40 }),
      // A large node places Tree totals on both sides of the 8192-match retention limit.
      fc.option(fc.record({ at: fc.nat(), size: fc.integer({ min: 8100, max: 8250 }) }), { freq: 3 }),
      fc.constantFrom('a', 'aa', 'ab'),
      fc.boolean(),
      fc.option(fc.nat()),
      fc.array(fc.array(fc.nat(), { maxLength: 8 }), { minLength: 1, maxLength: 6 }),
      fc.array(step, { minLength: 1, maxLength: 40 }),
      (texts, large, query, agenda, narrow, dayPicks, steps) => {
        const roots = texts.map(([own, ...children], i) => ({
          id: `r${i}`,
          text: own!,
          children: children.map((child, j) => ({ id: `r${i}c${j}`, text: child, children: [] })),
        }))
        if (large !== null) {
          const node = { id: 'large', text: 'a'.repeat(large.size), children: [] }
          roots.splice(large.at % (roots.length + 1), 0, node)
        }
        const ids = roots.flatMap((root) => [root.id, ...root.children.map((child) => child.id)])
        const projection = dayPicks.map((picks, i) => {
          const dayIds = new Set(picks.map((pick) => ids[pick % ids.length]!))
          if (i === 0 && large !== null) dayIds.add('large')
          return {
            day: (100 + 2 * i) as DayNumber,
            rows: [...dayIds].map((nodeId) => ({ nodeId, depth: 0, role: 'match' as const })),
          }
        })
        const parents = roots.filter((root) => root.children.length > 0)
        const focusedDay = narrow === null ? undefined : projection[narrow % projection.length]!.day
        const zoomedId = narrow === null || parents.length === 0 ? null : parents[narrow % parents.length]!.id
        const scope: SearchScope = agenda
          ? { kind: 'agenda', projection, ...(focusedDay !== undefined && { focusedDay }) }
          : { kind: 'tree', parentId: zoomedId }
        const document = { roots }
        const occurrences = [...searchScope(document, scope)].filter((item): item is SearchText => item !== undefined)
        const context = { id: 1, revision: 1, scopeKey: 'test', document, scope, query }
        const neighborhood: SearchNeighborhood = {}
        const retained = searchHarness(512)
        const fresh = searchHarness(512)
        let last: SearchDestination | undefined
        const originFor = (kind: string, pick: number, offset: number): SearchPosition => {
          // The editor repeats from the start of the match it last reached.
          if (kind === 'repeat' && last !== undefined)
            return { nodeId: last.nodeId, ...(last.day !== undefined && { day: last.day }), offset: last.start }
          if (kind === 'heading' && agenda) return { beforeDay: projection[pick % projection.length]!.day, offset: 0 }
          const occurrence = occurrences[pick % Math.max(1, occurrences.length)]
          if (occurrence === undefined) return { nodeId: roots[0]!.id, offset: 0 }
          const { nodeId, day, text } = occurrence
          return { nodeId, ...(day !== undefined && { day }), offset: offset % (text.length + 1) }
        }

        for (const { origin: kind, direction, count, pick, offset } of steps) {
          const operation = { kind: 'navigate' as const, origin: originFor(kind, pick, offset), direction, count }

          const result = retained.run({ ...context, operation: { ...operation, neighborhood } })

          expect(result).toEqual(fresh.run({ ...context, operation }))
          if (result.kind === 'navigate' && result.destination !== undefined) last = result.destination
        }
      },
    ),
  )
})
