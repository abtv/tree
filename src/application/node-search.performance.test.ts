import { expect, it } from 'vitest'
import { runNodeSearch, searchNodes } from './node-search'

it('slices a 10000-node result set and a 250000-character nonmatch', () => {
  for (const document of [
    { roots: Array.from({ length: 10_000 }, (_, i) => ({ id: String(i), text: 'needle', children: [] })) },
    { roots: [{ id: 'long', text: 'a'.repeat(250_000), children: [] }] },
    {
      roots: [
        {
          id: 'image',
          text: '',
          attachment: {
            id: 'png',
            mimeType: 'image/png' as const,
            searchText: 'a'.repeat(1_048_576),
          },
          children: [],
        },
      ],
    },
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

it('scans long ancestor context once while matching many descendants', () => {
  const document = {
    roots: [
      {
        id: 'root',
        text: `${'x'.repeat(250_000)} context @alex #k8s &meeting`,
        children: Array.from({ length: 1000 }, (_, index) => ({
          id: String(index),
          text: 'opensearch-dashboards',
          children: [],
        })),
      },
    ],
  }
  const start = performance.now()
  const work = searchNodes(document, 'context @alex #k8s &meeting opensearch')
  let step = work.next()
  let checkpoints = 0
  while (!step.done) {
    checkpoints++
    step = work.next()
  }

  expect(step.value).toHaveLength(1000)
  expect(checkpoints).toBeLessThan(600_000)
  expect(performance.now() - start).toBeLessThan(2000)
})
