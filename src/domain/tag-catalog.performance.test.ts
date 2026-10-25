import { expect, it } from 'vitest'
import { TagCatalog } from './tag-catalog'

// @requirement PRODUCT.md §20.13
// @requirement PRODUCT.md §22.1
it('obtains tag suggestions below one millisecond in a 10000-tag document', () => {
  const catalog = new TagCatalog()
  const roots = Array.from({ length: 10_000 }, (_, index) => ({
    id: `${index}`,
    text: `#project_${index} #Work`,
    children: [],
  }))
  catalog.update({ roots })
  const samples: number[] = []
  const queries = ['#', '#p', '#pro', '#project_9', '#pt9', '#Work', '#absent']
  const byQuery = new Map<string, number[]>()
  for (let batch = 0; batch < 100; batch++) {
    for (const query of queries) {
      const start = performance.now()
      catalog.suggest('draft', query, query.length)
      const elapsed = performance.now() - start
      samples.push(elapsed)
      const values = byQuery.get(query) ?? []
      values.push(elapsed)
      byQuery.set(query, values)
    }
  }
  samples.sort((a, b) => a - b)
  console.log('PERF tag-catalog', {
    p50Ms: samples[Math.floor(samples.length * 0.5)],
    p99Ms: samples[Math.floor(samples.length * 0.99)],
  })
  console.log([...byQuery].map(([query, values]) => [query, values.toSorted((a, b) => a - b)[50], Math.max(...values)]))

  expect(samples[Math.floor(samples.length * 0.99)]).toBeLessThan(1)
})

// @requirement PRODUCT.md §22.1
it('updates a 30000-node catalog without reparsing unchanged text or retaining stale tags', () => {
  let reads = 0
  let roots = Array.from({ length: 30_000 }, (_, index) => ({
    id: `${index}`,
    get text() {
      reads++
      return `#project_${index}`
    },
    children: [],
  }))
  const catalog = new TagCatalog()
  catalog.update({ roots })
  reads = 0
  const elapsed: number[] = []
  for (let edit = 0; edit < 50; edit++) {
    roots = [...roots]
    roots[0] = { id: '0', text: `#changed_${edit}`, children: [] }
    const start = performance.now()
    catalog.update({ roots })
    elapsed.push(performance.now() - start)
  }

  expect(reads).toBe(0)
  expect(catalog.suggest('draft', '#changed', 8)?.suggestions).toEqual(['changed_49'])
  expect(elapsed.toSorted((a, b) => a - b)[47]).toBeLessThan(10)
})
