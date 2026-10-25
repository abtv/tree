import { expect, it } from 'vitest'
import { EmojiHistory } from './emoji-history'
import { suggestEmoji } from '../domain/emoji-completion'
import catalog from '../domain/emoji-catalog.json'

// @requirement PRODUCT.md §22.1
it('bounds MRU update work and reuses the cached initial catalog on input', () => {
  const history = new EmojiHistory(undefined, () => undefined)
  const names = Object.keys(catalog)
  history.load(names.slice(0, 100))
  const samples: number[] = []
  for (let index = 0; index < 1000; index++) {
    const start = performance.now()
    history.remember(names[index % names.length]!)
    const initial = history.suggestions

    expect(suggestEmoji(':', 1, initial)?.suggestions).toBe(initial)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  console.info('PERF emoji-history', { updateAndReadP99Ms: samples[990] })

  expect(samples[990]).toBeLessThan(1)
  expect(history.suggestions).toHaveLength(names.length)
})
