import fc from 'fast-check'
import { expect, it } from 'vitest'
import type { Document, TreeNode } from '../domain/document'
import { createVimCommandState } from './vim-command-state'
import { rememberNodeRange, resolveVisualMemory } from './vim-visual-memory'

const node = (id: string, children: TreeNode[] = []): TreeNode => ({ id, text: id, children })
const documentOf = (roots: TreeNode[]): Document => ({ roots }) as Document

type Edit =
  | { kind: 'delete'; index: number }
  | { kind: 'insert'; index: number }
  | { kind: 'replace'; index: number }
  | { kind: 'swap'; index: number }

const editArbitrary: fc.Arbitrary<Edit> = fc.record({
  kind: fc.constantFrom('delete' as const, 'insert' as const, 'replace' as const, 'swap' as const),
  index: fc.integer({ min: 0, max: 11 }),
})

function applyEdits(ids: readonly string[], edits: readonly Edit[]): string[] {
  const next = [...ids]
  let fresh = 0
  for (const edit of edits) {
    const index = Math.min(edit.index, next.length)
    if (edit.kind === 'insert') next.splice(index, 0, `new${fresh++}`)
    else if (next.length === 0) continue
    else if (edit.kind === 'delete') next.splice(Math.min(index, next.length - 1), 1)
    else if (edit.kind === 'replace') next.splice(Math.min(index, next.length - 1), 1, `new${fresh++}`)
    else {
      const left = Math.min(index, next.length - 1)
      const right = (left + 1) % next.length
      ;[next[left], next[right]] = [next[right]!, next[left]!]
    }
  }
  return next
}

// Invariant: a restorable whole-node selection is exactly the remembered nodes, contiguous and in
// order, so no edit can make `gv` select a node the user never selected.
it('only restores a whole-node memory whose nodes are still exactly one contiguous sibling range', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 10 }),
      fc.integer({ min: 0, max: 9 }),
      fc.integer({ min: 0, max: 9 }),
      fc.array(editArbitrary, { maxLength: 6 }),
      (count, rawAnchor, rawFocus, edits) => {
        const originalIds = Array.from({ length: count }, (_, index) => `n${index}`)
        const anchorId = originalIds[Math.min(rawAnchor, count - 1)]!
        const focusId = originalIds[Math.min(rawFocus, count - 1)]!
        const state = createVimCommandState()
        rememberNodeRange(state, documentOf(originalIds.map((id) => node(id))), anchorId, focusId)
        const memory = state.lastVisual
        const rememberedIds = memory?.kind === 'nodes' ? memory.ids : []
        const editedIds = applyEdits(originalIds, edits)
        const edited = documentOf(editedIds.map((id) => node(id)))
        const restored = resolveVisualMemory(
          memory,
          edited,
          { currentParentId: null, selectedNodeId: editedIds[0] ?? anchorId },
          () => true,
        )
        const from = editedIds.indexOf(anchorId)
        const to = editedIds.indexOf(focusId)
        const expected = from < 0 || to < 0 ? undefined : editedIds.slice(Math.min(from, to), Math.max(from, to) + 1)
        const unchanged = expected !== undefined && expected.join() === rememberedIds.join()
        expect(restored !== undefined).toBe(unchanged)
        if (restored !== undefined) {
          expect(restored).toEqual({ kind: 'nodes', anchorId, focusId })
          const afterEdits = createVimCommandState()
          rememberNodeRange(afterEdits, edited, anchorId, focusId)
          expect(afterEdits.lastVisual).toEqual(memory)
        }
      },
    ),
  )
})

it('only restores a character memory whose offsets still exist in the text', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 20 }),
      fc.integer({ min: 0, max: 24 }),
      (anchor, focus, length) => {
        const text = 'x'.repeat(length)
        const restored = resolveVisualMemory(
          { kind: 'text', nodeId: 'n', anchor, focus, hadText: length > 0 },
          documentOf([{ id: 'n', text, children: [] }]),
          { currentParentId: null, selectedNodeId: 'n' },
          () => true,
        )
        const last = Math.max(0, length - 1)
        expect(restored !== undefined).toBe(anchor <= last && focus <= last)
      },
    ),
  )
})
