import { expect, it } from 'vitest'
import { RecentNodes } from './recent-nodes'
import type { Document } from '../domain/document'

// @requirement PRODUCT.md §20.14
it('prepares and reads recent-node data below one millisecond at p99', () => {
  let document: Document = {
    roots: Array.from({ length: 10_000 }, (_, i) => ({
      id: `n${i}`,
      text: `Node ${i} ${'long title '.repeat(30)}`,
      children: [],
    })),
  }
  const recent = new RecentNodes()
  recent.load(
    Array.from({ length: 100 }, (_, i) => `n${9999 - i}`),
    document,
  )
  const updates: number[] = []
  const reads: number[] = []
  for (let i = 0; i < 1200; i++) {
    const next = { roots: [{ id: `new${i}`, text: 'New node', children: [] }, ...document.roots.slice(0, 9999)] }
    const start = performance.now()
    recent.recordChange(document, next, `new${i}`)
    recent.update(next)
    const updated = performance.now()
    recent.getResults()
    const read = performance.now()
    if (i >= 200) {
      updates.push(updated - start)
      reads.push(read - updated)
    }
    document = next
  }
  const p99 = (values: number[]) => values.sort((a, b) => a - b)[Math.ceil(values.length * 0.99) - 1]!
  console.info(JSON.stringify({ recentNodes: { updateP99: p99(updates), readP99: p99(reads) } }))
  expect(p99(updates)).toBeLessThan(1)
  expect(p99(reads)).toBeLessThan(1)
})
