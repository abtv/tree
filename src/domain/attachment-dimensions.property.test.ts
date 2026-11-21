import { expect, it } from 'vitest'
import fc from 'fast-check'
import { MAX_ATTACHMENT_DIMENSION, MAX_ATTACHMENT_PIXELS } from './attachment-dimensions'
import { parsePersistedState, serializeState, validatePersistedState, type Document, type TreeNode } from './document'

const side = fc.integer({ min: 1, max: MAX_ATTACHMENT_DIMENSION })
const size = fc
  .tuple(side, side)
  .filter(([width, height]) => width * height <= MAX_ATTACHMENT_PIXELS)
  .map(([width, height]) => ({ width, height }))
const imageNode = fc.record({
  sized: fc.option(size, { nil: undefined }),
  recognized: fc.option(fc.string({ maxLength: 20 }), { nil: undefined }),
  attached: fc.boolean(),
})

interface ImageSpec {
  readonly sized: { width: number; height: number } | undefined
  readonly recognized: string | undefined
  readonly attached: boolean
}

function documentOf(specs: readonly ImageSpec[]): Document {
  const roots: TreeNode[] = specs.map((spec, index) => ({
    id: `n${index}`,
    text: `Row ${index}`,
    ...(spec.attached
      ? {
          attachment: {
            id: `image-${index % 3}`,
            mimeType: 'image/png' as const,
            ...(spec.recognized === undefined ? {} : { searchText: spec.recognized }),
            ...spec.sized,
          },
        }
      : {}),
    children: [],
  }))
  return { roots }
}

// @requirement PRODUCT.md §17
it('round-trips attachments with and without a stored size', () => {
  fc.assert(
    fc.property(fc.array(imageNode, { minLength: 1, maxLength: 12 }), (specs) => {
      const document = documentOf(specs)
      const state = serializeState(document, { currentParentId: null, selectedNodeId: 'n0' })

      const restored = parsePersistedState(JSON.parse(JSON.stringify(state)))

      expect(restored.document).toEqual(document)
    }),
  )
})

it('drops an invalid stored size and keeps every other attachment field and node', () => {
  const invalid = fc.oneof(
    fc.record({ width: side }),
    fc.record({ height: side }),
    fc.record({ width: fc.integer({ max: 0 }), height: side }),
    fc.record({ width: side, height: fc.integer({ min: MAX_ATTACHMENT_DIMENSION + 1 }) }),
    fc.record({ width: fc.double({ noInteger: true }), height: side }),
    fc.record({ width: fc.string(), height: side }),
  )
  fc.assert(
    fc.property(fc.array(imageNode, { minLength: 1, maxLength: 8 }), fc.nat(), invalid, (specs, seed, broken) => {
      const document = documentOf(specs.map((spec) => ({ ...spec, attached: true })))
      const index = seed % document.roots.length
      const state = JSON.parse(
        JSON.stringify(serializeState(document, { currentParentId: null, selectedNodeId: 'n0' })),
      ) as { document: { roots: Array<{ attachment: Record<string, unknown> }> } }
      const attachment = state.document.roots[index]!.attachment
      delete attachment.width
      delete attachment.height
      Object.assign(attachment, broken)

      expect(() => validatePersistedState(state)).not.toThrow()
      const restored = parsePersistedState(state).document

      const expected = { ...document.roots[index]!.attachment! }
      delete (expected as { width?: number }).width
      delete (expected as { height?: number }).height
      expect(restored.roots[index]!.attachment).toEqual(expected)
      expect(restored.roots.filter((_, other) => other !== index)).toEqual(
        document.roots.filter((_, other) => other !== index),
      )
    }),
  )
})
