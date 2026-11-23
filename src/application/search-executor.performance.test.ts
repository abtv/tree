import { expect, it } from 'vitest'
import { searchHarness } from './test/search-harness'
import { searchCaret, type SearchNeighborhood, type SearchRequest } from './search-executor'

it('refills nearby matches without recounting the rest of a wide tree', () => {
  const document = {
    roots: Array.from({ length: 5000 }, (_, i) => ({ id: String(i), text: 'a' + 'x'.repeat(100), children: [] })),
  }
  const scope = { kind: 'tree' as const, parentId: null }
  const neighborhood: SearchNeighborhood = {}
  const harness = searchHarness(8192)
  const next = (nodeId: string) =>
    harness.run({
      document,
      scope,
      scopeKey: 'root',
      revision: 1,
      id: 1,
      query: 'a',
      operation: { kind: 'navigate', origin: { nodeId, offset: 0 }, direction: 1, count: 1, neighborhood },
    })
  expect(next('0')).toMatchObject({ destination: { nodeId: '1' }, total: 5000 })
  const beforeRefill = harness.slices()

  const result = next('32')

  expect(result).toMatchObject({ destination: { nodeId: '33' }, ordinal: 34, total: 5000 })
  // Measured one work slice for this refill and 63 for a full scan.
  expect(harness.slices() - beforeRefill).toBeLessThanOrEqual(2)
})

it('yields on wide scopes and oversized text with bounded total scan time', () => {
  const request: SearchRequest = {
    id: 1,
    revision: 1,
    scopeKey: 'root',
    scope: { kind: 'tree', parentId: null },
    query: 'absent',
    operation: { kind: 'count' },
    document: {
      roots: Array.from({ length: 10_000 }, (_, index) => ({ id: String(index), text: 'ordinary text', children: [] })),
    },
  }
  for (const document of [
    request.document,
    { roots: [{ id: 'long', text: 'a'.repeat(250_000), children: [] }] },
    { roots: [{ id: 'combining', text: `a${'\u0301'.repeat(250_000)}`, children: [] }] },
  ]) {
    const harness = searchHarness(2048)
    const started = performance.now()

    const result = harness.run({ ...request, document })
    const elapsed = performance.now() - started

    expect(result).toEqual({ kind: 'count', total: 0, capped: false })
    expect(harness.slices()).toBeGreaterThan(10)
    // Generous CI regression ceiling; deterministic slice tests guard responsiveness separately.
    expect(elapsed).toBeLessThan(2000)
  }
})

it('resolves only a selected grapheme in oversized ordinary and combining text', () => {
  for (const text of ['a'.repeat(250_000), `a${'\u0301'.repeat(250_000)}`, '👩‍💻'.repeat(50_000)]) {
    const started = performance.now()

    const caret = searchCaret(text, text.length - 1)

    expect(caret).toBeGreaterThanOrEqual(0)
    // Native ICU calls are indivisible; this is measured evidence, not a universal bound.
    expect(performance.now() - started).toBeLessThan(100)
  }
})
