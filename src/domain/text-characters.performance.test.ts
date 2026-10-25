import { expect, it } from 'vitest'
import { characterBoundaries, moveCharacterOffset } from './text-characters'

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
