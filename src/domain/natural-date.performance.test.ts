import { expect, it } from 'vitest'
import { dayNumberOf } from './calendar-date'
import { suggestDates } from './natural-date'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })

// @requirement PRODUCT.md §20.9
// @requirement PRODUCT.md §22.1
it('recognizes relative dates well below one millisecond, including incremental typing and long text', () => {
  const expressions = [
    ['two days ago', -2],
    ['in three weeks', 21],
    ['3 weeks ago', -21],
    ['in October', dayNumberOf({ year: 2027, month: 10, day: 1 }) - today],
    ['last October', -7],
    ['in five days', 5],
    ['2 days ago', -2],
    ['in twenty-five days', 25],
    ['ONE   HUNDRED days ago', -100],
  ] as const
  const cases = expressions.flatMap(([expression, offset]) => [
    { text: expression, caret: expression.length, offset },
    {
      text: `${'Ordinary surrounding text. '.repeat(600)}${expression} at noon`,
      caret: 'Ordinary surrounding text. '.length * 600 + expression.length,
      offset,
    },
  ])
  const firstStart = performance.now()
  const first = suggestDates('two days ago', 12, today)
  const firstMs = performance.now() - firstStart
  expect(first?.suggestions[0]?.day).toBe(today - 2)

  const completeExpressionSamples: number[] = []
  let completeMatches = 0
  for (const { text, caret, offset } of cases) {
    expect(suggestDates(text, caret, today)?.suggestions[0]?.day).toBe(today + offset)
    for (let batch = 0; batch < 20; batch++) {
      const start = performance.now()
      for (let call = 0; call < 50; call++) {
        completeMatches += suggestDates(text, caret, today)?.suggestions.length ?? 0
      }
      completeExpressionSamples.push((performance.now() - start) / 50)
    }
  }
  const prefixes = expressions.flatMap(([expression]) =>
    Array.from({ length: expression.length + 1 }, (_, length) => expression.slice(0, length)),
  )
  const workloads = [
    ...cases.map(({ text, caret }) => ({ text, caret })),
    ...prefixes.map((text) => ({ text, caret: text.length })),
  ]
  // Every batch includes complete expressions, misses, and changing text. This
  // avoids rewarding a cache of one repeated result and amortizes timer noise.
  const samples: number[] = []
  let matched = 0
  for (let batch = 0; batch < 100; batch++) {
    const start = performance.now()
    for (const { text, caret } of workloads) {
      matched += suggestDates(text, caret, today)?.suggestions.length ?? 0
    }
    samples.push((performance.now() - start) / workloads.length)
  }
  samples.sort((a, b) => a - b)
  // Batch means hide isolated slow calls, so the same workloads are also timed one
  // call at a time. Timer overhead (well under a microsecond) is small next to the
  // measured calls.
  const callSamples: number[] = []
  for (let round = 0; round < 100; round++) {
    for (const { text, caret } of workloads) {
      const start = performance.now()
      matched += suggestDates(text, caret, today)?.suggestions.length ?? 0
      callSamples.push(performance.now() - start)
    }
  }
  callSamples.sort((a, b) => a - b)
  console.log('PERF natural-date', {
    perCallP50Ms: callSamples[Math.floor(callSamples.length * 0.5)],
    perCallP99Ms: callSamples[Math.floor(callSamples.length * 0.99)],
    perCallMaxMs: callSamples[callSamples.length - 1],
    firstMs,
    mixedCalls: workloads.length * samples.length,
    completeExpressionCalls: completeExpressionSamples.length * 50,
    medianMs: samples[50],
    p99Ms: samples[99],
    slowestCompleteExpressionBatchMs: Math.max(...completeExpressionSamples),
  })
  expect(matched).toBeGreaterThanOrEqual(cases.length * samples.length)
  expect(completeMatches).toBe(completeExpressionSamples.length * 50)
  expect(firstMs).toBeLessThan(1)
  // Individual calls: p99 is about 0.17 ms alone and 0.36 ms while the whole unit
  // suite runs in parallel, from the long-text cases. The single slowest call
  // reached 1.3 ms under that load (garbage collection and neighboring workers), so
  // only the p99 is guarded and the maximum is reported.
  expect(callSamples[Math.floor(callSamples.length * 0.99)]).toBeLessThan(1)
  // A tenfold margin to the requested 1 ms budget; each batch is guarded.
  expect(samples[99]).toBeLessThan(0.1)
  // Long-text batches independently enforce the requested ceiling, so the
  // many short prefixes cannot hide a slower complete expression.
  expect(Math.max(...completeExpressionSamples)).toBeLessThan(1)
})
