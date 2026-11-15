import { expect, it } from 'vitest'
import { characterBoundaries, characterStart, moveCharacterOffset } from './text-characters'

// @requirement PRODUCT.md §22.1
it('reuses segmentation for repeated caret motions in a long unchanged node', () => {
  const text = `${'A🚀👩‍💻Z'.repeat(2000)}`
  const boundaries = characterBoundaries(text)
  const samples: number[] = []
  for (let batch = 0; batch < 20; batch++) {
    const start = performance.now()
    let cursor = 0
    for (let move = 0; move < 1000; move++) cursor = moveCharacterOffset(text, cursor, 1)

    samples.push((performance.now() - start) / 1000)

    expect(cursor).toBeGreaterThan(1000)
    expect(characterBoundaries(text)).toBe(boundaries)
  }

  console.log('PERF text-character-motion', { maxBatchMeanMs: Math.max(...samples), characters: boundaries.length - 1 })

  expect(Math.max(...samples)).toBeLessThan(1)
})

// @requirement PRODUCT.md §22.2
it('keeps repeated boundary lookups fast throughout a long unchanged row', () => {
  const text = 'a🚀e\u0301 '.repeat(10_000)
  characterBoundaries(text)
  const samples: number[] = []

  for (const offset of [0, Math.floor(text.length / 2), text.length - 1]) {
    const started = performance.now()
    let total = 0
    for (let index = 0; index < 1000; index++) {
      total += characterStart(text, offset)
      total += moveCharacterOffset(text, offset, 1)
      total += moveCharacterOffset(text, offset, -1)
    }
    samples.push(performance.now() - started)

    expect(total).toBeGreaterThan(0)
  }

  console.log('PERF long-row-boundary-lookup', { samples, textLength: text.length })

  expect(Math.max(...samples)).toBeLessThan(50)
})
