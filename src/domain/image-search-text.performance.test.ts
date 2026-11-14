import { expect, it } from 'vitest'
import { imageSearchTextEnrichment } from './image-search-text'
import { attachmentSummary, type Document } from './document'

it('enriches shared image history without copying unchanged subtrees', () => {
  const branch = {
    id: 'branch',
    text: '',
    children: Array.from({ length: 100_000 }, (_, index) => ({
      id: `child-${index}`,
      text: 'Unchanged',
      children: [],
    })),
  }
  const snapshots: Document[] = Array.from({ length: 200 }, (_, index) => ({
    roots: [
      { id: 'source', text: String(index), attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
      branch,
    ],
  }))
  for (const document of snapshots) attachmentSummary(document)
  const enrich = imageSearchTextEnrichment('image', 'Recognized')
  const start = performance.now()

  const results = snapshots.map(enrich)

  expect(performance.now() - start).toBeLessThan(200)
  expect(results.every((document) => document.roots[1] === branch)).toBe(true)
  expect(results.every((document) => document.roots[0]!.attachment?.searchText === 'Recognized')).toBe(true)
})

it('bounds enrichment across a wide document and full history', () => {
  const roots: Document['roots'] = Array.from({ length: 100_000 }, (_, index) => ({
    id: `node-${index}`,
    text: 'Unchanged',
    children: [],
    ...(index === 0 ? { attachment: { id: 'image', mimeType: 'image/png' as const } } : {}),
  }))
  const snapshots: Document[] = Array.from({ length: 200 }, (_, index) => ({
    roots: [{ ...roots[0]!, text: String(index) }, ...roots.slice(1)],
  }))
  for (const document of snapshots) attachmentSummary(document)
  const enrich = imageSearchTextEnrichment('image', 'Recognized')
  const start = performance.now()

  const results = snapshots.map(enrich)

  expect(performance.now() - start).toBeLessThan(200)
  expect(results.every((document) => document.roots[99_999] === roots[99_999])).toBe(true)
  expect(results.every((document) => document.roots[0]!.attachment?.searchText === 'Recognized')).toBe(true)
})
