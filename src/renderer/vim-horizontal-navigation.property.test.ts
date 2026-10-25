import { describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import type { TreeNode } from '../domain/document'
import { propertyRuns } from '../test/property-runs'
import { horizontalNavigation } from './vim-horizontal-navigation'

const node = (id: string, text: string, image = false): TreeNode => ({
  id,
  text,
  children: [],
  ...(image ? { attachment: { id: `image-${id}`, mimeType: 'image/png' as const } } : {}),
})

function navigate(nodes: TreeNode[], index: number, cursor: number, direction: 'left' | 'right', count: number) {
  return horizontalNavigation({
    node: nodes[index]!,
    caret: { cursor, imageActive: nodes[index]!.attachment !== undefined && cursor === nodes[index]!.text.length },
    direction,
    count,
    adjacent: (current) => nodes[nodes.indexOf(current) + (direction === 'right' ? 1 : -1)],
  })
}

// @requirement PRODUCT.md §4.3
// @requirement PRODUCT.md §20.2.9
describe('counted horizontal navigation', () => {
  it('crosses at the final and first grapheme without spending a step on text end', () => {
    const nodes = [node('a', 'a👩🏽‍🚀'), node('b', '🇫🇷z')]

    expect(navigate(nodes, 0, 1, 'right', 1)).toEqual({ node: nodes[1], caret: { cursor: 0, imageActive: false } })
    expect(navigate(nodes, 1, 0, 'left', 1)).toEqual({ node: nodes[0], caret: { cursor: 1, imageActive: false } })
    expect(navigate(nodes, 0, 0, 'right', 3)).toEqual({ node: nodes[1], caret: { cursor: 4, imageActive: false } })
  })

  it('counts empty and image-only nodes as one position each', () => {
    const nodes = [node('a', 'ab'), node('empty', ''), node('image', '', true), node('b', 'cd')]

    expect(navigate(nodes, 0, 1, 'right', 2)).toEqual({ node: nodes[2], caret: { cursor: 0, imageActive: true } })
    expect(navigate(nodes, 3, 0, 'left', 3)).toEqual({ node: nodes[0], caret: { cursor: 1, imageActive: false } })
  })

  it('enters a previous image without reusing the source image return position', () => {
    const nodes = [node('a', 'abc', true), node('b', 'xyz', true)]

    const result = horizontalNavigation({
      node: nodes[1]!,
      caret: { cursor: 3, imageActive: true, imageTextReturnCursor: 0 },
      direction: 'left',
      count: 2,
      adjacent: () => nodes[0],
    })

    expect(result).toEqual({ node: nodes[0], caret: { cursor: 3, imageActive: true } })
    expect(navigate(nodes, 1, 0, 'left', 2)).toEqual({ node: nodes[0], caret: { cursor: 2, imageActive: false } })
  })

  it('preserves an image return position when clamped and restores it before consuming remaining h steps', () => {
    const current = node('a', 'abcd', true)
    const caret = { cursor: 4, imageActive: true, imageTextReturnCursor: 1 }

    expect(
      horizontalNavigation({ node: current, caret, direction: 'right', count: 99, adjacent: () => undefined }).caret,
    ).toEqual(caret)
    expect(
      horizontalNavigation({ node: current, caret, direction: 'left', count: 2, adjacent: () => undefined }).caret,
    ).toEqual({ cursor: 0, imageActive: false })
  })

  it('batches text steps and stops huge counts at the outer boundary', () => {
    const current = node('a', 'x'.repeat(100_000), true)
    const adjacent = vi.fn(() => undefined)

    const result = horizontalNavigation({
      node: current,
      caret: { cursor: 0, imageActive: false },
      direction: 'right',
      count: Number.MAX_SAFE_INTEGER,
      adjacent,
    })

    expect(result.caret).toEqual({
      cursor: current.text.length,
      imageActive: true,
      imageTextReturnCursor: current.text.length - 1,
    })
    expect(adjacent).toHaveBeenCalledTimes(1)
  })

  it('matches a flattened visible-character model in both directions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ length: fc.integer({ min: 0, max: 8 }), image: fc.boolean() }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.nat(100),
        fc.nat(100),
        fc.constantFrom<'left' | 'right'>('left', 'right'),
        (specs, initial, count, direction) => {
          const nodes = specs.map((spec, i) => node(String(i), 'x'.repeat(spec.length), spec.image))
          const positions = nodes.flatMap((current) =>
            Array.from(
              { length: Math.max(1, current.text.length + Number(current.attachment !== undefined)) },
              (_, cursor) => ({ node: current, cursor }),
            ),
          )
          const start = initial % positions.length
          const origin = positions[start]!
          const target =
            positions[Math.max(0, Math.min(positions.length - 1, start + (direction === 'right' ? count : -count)))]!

          const actual = navigate(nodes, nodes.indexOf(origin.node), origin.cursor, direction, count)

          expect(actual.node).toBe(target.node)
          expect(actual.caret.cursor).toBe(target.cursor)
          expect(actual.caret.imageActive).toBe(
            target.node.attachment !== undefined && target.cursor === target.node.text.length,
          )
        },
      ),
      { numRuns: propertyRuns(250) },
    )
  })
})
