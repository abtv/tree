import { expect, it } from 'vitest'
import { imageSearchTextEnrichment } from './image-search-text'
import type { TreeNode } from './document-types'

const image = (id: string, searchText?: string): TreeNode => ({
  id,
  text: '',
  attachment: { id, mimeType: 'image/png', ...(searchText === undefined ? {} : { searchText }) },
  children: [],
})

// @requirement PRODUCT.md §15.1
it('updates a nested image without changing its ancestors attachments or unrelated branches', () => {
  const target = image('target')
  const other = image('other', 'Other recognition')
  const parent = { ...image('parent', 'Parent recognition'), children: [target] }
  const document = { roots: [parent, other] }

  const result = imageSearchTextEnrichment('target', 'Recognized')(document)

  expect(result.roots[0]!.attachment).toBe(parent.attachment)
  expect(result.roots[0]!.children[0]!.attachment?.searchText).toBe('Recognized')
  expect(result.roots[1]).toBe(other)
  expect(target.attachment?.searchText).toBeUndefined()
})

it('preserves the document when the recognized value is already present', () => {
  const target = image('target', 'Recognized')
  const document = { roots: [{ id: 'parent', text: '', children: [target] }] }

  const result = imageSearchTextEnrichment('target', 'Recognized')(document)

  expect(result).toBe(document)
})

it('finds a moved image when the previous nested path no longer exists', () => {
  const target = image('target')
  const parent = { id: 'parent', text: '', children: [target] }
  const enrich = imageSearchTextEnrichment('target', 'Recognized')
  enrich({ roots: [parent] })
  const moved = { roots: [{ ...parent, children: [] }, target] }

  const result = enrich(moved)

  expect(result.roots[0]).toBe(moved.roots[0])
  expect(result.roots[1]!.attachment?.searchText).toBe('Recognized')
})
