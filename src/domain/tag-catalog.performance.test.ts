import { expect, it } from 'vitest'
import { TagCatalog } from './tag-catalog'
import { TAG_PREFIXES } from './tags'

// @requirement PRODUCT.md §20.13
// @requirement PRODUCT.md §22.1
it('updates three mixed catalogs without rescanning unchanged nodes or keeping removed names', () => {
  let reads = 0
  let roots = Array.from({ length: 30_000 }, (_, index) => ({
    id: String(index),
    get text() {
      reads++
      return `#topic_${index} @person_${index} &event_${index}`
    },
    children: [],
  }))
  const catalogs = TAG_PREFIXES.map((prefix) => new TagCatalog(prefix))
  const initial = { roots }
  for (const catalog of catalogs) catalog.update(initial)
  reads = 0

  for (let edit = 0; edit < 10; edit++) {
    roots = [...roots]
    roots[0] = { id: '0', text: `#changed_${edit} @changed_${edit} &changed_${edit}`, children: [] }
    const document = { roots }
    for (const catalog of catalogs) catalog.update(document)
  }

  expect(reads).toBe(0)
  for (const [index, prefix] of TAG_PREFIXES.entries()) {
    expect(catalogs[index]!.suggest('draft', `${prefix}changed`, 8)?.suggestions).toEqual(['changed_9'])
  }
})

// @requirement PRODUCT.md §20.14
it('keeps continuous global Search suggestions within the catalog scale budget', () => {
  const catalog = new TagCatalog()
  catalog.update({
    roots: Array.from({ length: 10_000 }, (_, index) => ({
      id: String(index),
      text: `#project_${index} #Work`,
      children: [],
    })),
  })
  const samples: number[] = []

  for (let batch = 0; batch < 100; batch++) {
    for (const query of ['#', '#project_9', '#pt9', '#Work']) {
      const start = performance.now()
      catalog.searchSuggestions(query)
      samples.push(performance.now() - start)
    }
  }
  const p99Ms = samples.toSorted((a, b) => a - b)[Math.ceil(samples.length * 0.99) - 1]!

  console.log('PERF global-tag-catalog', { p99Ms })
  expect(p99Ms).toBeLessThan(5)
})

// @requirement PRODUCT.md §20.13
// @requirement PRODUCT.md §22.1
it('obtains tag suggestions below five milliseconds in a 10000-tag document', () => {
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

  // GitHub Actions measured p99 at 3.33 ms; allow roughly 50% headroom for CI timing variation.
  expect(samples[Math.floor(samples.length * 0.99)]).toBeLessThan(5)
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
