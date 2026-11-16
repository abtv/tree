import { expect, it } from 'vitest'
import { starredNodes } from './starred-nodes'
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
  expect(starredNodes(document)).toHaveLength(1)
  const changed = editNodeText(document, '0', 'Edited')
  reads = 0

  const result = starredNodes(changed)
  expect(result).toHaveLength(1)
  expect(reads).toBeLessThan(10)
  expect(starredNodes(changed)).toBe(result)
  expect(performance.now() - start).toBeLessThan(2000)
})
