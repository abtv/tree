import { expect, it } from 'vitest'
import { markedAndStarredNodes } from './starred-nodes'
import { editNodeText, type Document } from '../domain/document'

it('reuses unchanged branch summaries after editing a 10000-node document', () => {
  let reads = 0
  const document: Document = {
    roots: [
      {
        id: 'root',
        text: 'Root',
        children: Array.from({ length: 10_000 }, (_, index) => ({
          id: `${index}`,
          text: `Node ${index}`,
          ...(index === 5000 ? { starred: true as const } : {}),
          get children() {
            reads++
            return []
          },
        })),
      },
    ],
  }
  const start = performance.now()
  expect(markedAndStarredNodes(document)).toHaveLength(1)
  const changed = editNodeText(document, '0', 'Edited')
  reads = 0

  const result = markedAndStarredNodes(changed)
  expect(result).toHaveLength(1)
  expect(reads).toBeLessThan(10)
  expect(markedAndStarredNodes(changed)).toBe(result)
  expect(performance.now() - start).toBeLessThan(2000)
})

it('groups 6000 flagged nodes into three document-ordered parts within budget', () => {
  const document: Document = {
    roots: Array.from({ length: 100 }, (_, release) => ({
      id: `release-${release}`,
      text: `Release 0.${99 - release} - shared release title`,
      children: Array.from({ length: 60 }, (_, index) => ({
        id: `${release}-${index}`,
        text: `${59 - index} - Shared task title`,
        children: [],
        ...(index % 3 === 0 ? { marked: true as const, starred: true as const } : {}),
        ...(index % 3 === 1 ? { marked: true as const } : {}),
        ...(index % 3 === 2 ? { starred: true as const } : {}),
      })),
    })),
  }

  const start = performance.now()
  const results = markedAndStarredNodes(document)
  const elapsed = performance.now() - start

  expect(results).toHaveLength(6000)
  expect(results.slice(0, 2).map(({ id }) => id)).toEqual(['0-0', '0-3'])
  // Sorted grouping measured 9.5 ms on an Apple Silicon Mac (2026-11-23); document order does less work.
  expect(elapsed).toBeLessThan(200)
})
