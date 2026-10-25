import { expect, it } from 'vitest'
import { runNodeSearch } from './node-search'

it('slices a 10000-node result set and a 250000-character nonmatch', () => {
  for (const document of [
    { roots: Array.from({ length: 10_000 }, (_, i) => ({ id: String(i), text: 'needle', children: [] })) },
    { roots: [{ id: 'long', text: 'a'.repeat(250_000), children: [] }] },
  ]) {
    const callbacks: (() => void)[] = []
    let count = -1
    let slices = 0
    const start = performance.now()
    runNodeSearch(
      document,
      'needle',
      (results) => {
        count = results.length
      },
      {
        schedule: (callback) => {
          callbacks.push(callback)
          return () => undefined
        },
      },
    )
    while (callbacks.length > 0) {
      callbacks.shift()!()
      slices++
    }

    expect(count).toBe(document.roots.length === 1 ? 0 : 10_000)
    expect(slices).toBeGreaterThan(1)
    expect(performance.now() - start).toBeLessThan(2000)
  }
})
