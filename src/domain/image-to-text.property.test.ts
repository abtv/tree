import { expect, it } from 'vitest'
import fc from 'fast-check'
import { appendTextChildren, type Document } from './document'

it('appends recognized text without changing existing branches or attachments', () => {
  fc.assert(
    fc.property(fc.array(fc.string({ maxLength: 100 }), { minLength: 1, maxLength: 30 }), (texts) => {
      const attachment = { id: 'image', mimeType: 'image/png' as const }
      const existing = { id: 'existing', text: 'Existing', children: [] }
      const other = { id: 'other', text: 'Untouched', children: [] }
      const document: Document = { roots: [{ id: 'source', text: '', attachment, children: [existing] }, other] }
      const before = JSON.stringify(document)
      let next = 0

      const result = appendTextChildren(document, 'source', texts, () => `new-${next++}`)

      expect(JSON.stringify(document)).toBe(before)
      expect(result.roots[1]).toBe(other)
      expect(result.roots[0]!.attachment).toBe(attachment)
      expect(result.roots[0]!.children[0]).toBe(existing)
      expect(result.roots[0]!.children.slice(1).map((child) => child.text)).toEqual(texts)
      expect(new Set(result.roots[0]!.children.map((child) => child.id)).size).toBe(texts.length + 1)
    }),
  )
})

it('keeps empty results inert and refuses children below the depth limit', () => {
  let node = { id: 'leaf', text: '', children: [] } as Document['roots'][number]
  for (let depth = 1; depth < 20; depth++) node = { id: `parent-${depth}`, text: '', children: [node] }
  const document = { roots: [node] }

  expect(appendTextChildren(document, 'leaf', [], () => 'unused')).toBe(document)
  expect(() => appendTextChildren(document, 'leaf', ['text'], () => 'new')).toThrow()
})
