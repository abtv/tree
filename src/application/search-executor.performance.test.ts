import { expect, it } from 'vitest'
import { searchHarness } from './test/search-harness'
import { searchCaret, type SearchRequest } from './search-executor'

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
