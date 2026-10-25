import { expect, it } from 'vitest'
import { suggestEmoji } from './emoji-completion'

// @requirement PRODUCT.md §20.12
// @requirement PRODUCT.md §22.1
it('keeps shortcode recognition below one millisecond with long text and incremental edits', () => {
  const prefixes = [
    ':',
    ':c',
    ':ca',
    ':cat',
    ':r',
    ':ro',
    ':roc',
    ':rocke',
    ':rkt',
    ':wt',
    ':wtech',
    ':ma',
    ':woman_techn',
    ':no_such_emoji',
    'ordinary text',
  ]
  const workloads = prefixes.flatMap((prefix) => [prefix, `${'Ordinary text. '.repeat(1000)}${prefix}`])
  const samples: number[] = []
  let matches = 0
  for (let batch = 0; batch < 100; batch++) {
    const start = performance.now()
    for (const text of workloads) matches += suggestEmoji(text, text.length)?.suggestions.length ?? 0
    samples.push((performance.now() - start) / workloads.length)
  }

  samples.sort((a, b) => a - b)
  console.log('PERF emoji-completion', { p50Ms: samples[50], p99Ms: samples[99], calls: 100 * workloads.length })

  expect(matches).toBeGreaterThan(0)
  expect(samples[99]).toBeLessThan(1)
})
