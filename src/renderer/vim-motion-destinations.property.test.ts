// @vitest-environment jsdom
import fc from 'fast-check'
import { expect, it, vi } from 'vitest'
import { createEditorStoreDouble } from './test/editor-store-double'
import { moveViewportSelection } from './vim-viewport-motion'
import { focusCaretTransition } from './vim-caret-transition'
import { propertyRuns } from '../test/property-runs'

vi.mock('./scroll-viewport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./scroll-viewport')>()),
  viewportBounds: () => ({ top: 0, bottom: 100 }),
  viewportScrollEdges: () => ({ atStart: true, atEnd: true }),
}))

it('never redirects a text destination to its attachment or carries an old image return position', () => {
  fc.assert(
    fc.property(
      fc.string({ maxLength: 40 }),
      fc.boolean(),
      fc.nat(80),
      fc.constantFrom('top', 'middle', 'bottom', 'half-up', 'half-down'),
      (text, image, sourceCursor, motion) => {
        const row = document.createElement('div')
        row.className = 'node-row'
        row.dataset.nodeId = 'destination'
        row.getBoundingClientRect = () => new DOMRect(0, 0, 10, 20)
        document.body.append(row)
        try {
          const store = createEditorStoreDouble({
            snapshot: {
              status: 'ready',
              document: {
                roots: [
                  {
                    id: 'destination',
                    text,
                    children: [],
                    ...(image ? { attachment: { id: 'image', mimeType: 'image/png' as const } } : {}),
                  },
                ],
              },
              location: { currentParentId: null, selectedNodeId: 'destination' },
            },
          })
          moveViewportSelection({ store, syncImageCaretToFocus: () => {} }, 'destination', motion, sourceCursor)
          expect(store.selectNode).toHaveBeenCalledOnce()
          const cursor = vi.mocked(store.selectNode).mock.calls[0]![1]!
          const caret = focusCaretTransition(
            { cursor: sourceCursor, imageActive: true, imageTextReturnCursor: 3 },
            cursor,
            text.length,
            image,
            true,
          )
          expect(caret.imageActive).toBe(image && text.length === 0)
          expect(caret.imageTextReturnCursor).toBeUndefined()
          expect(caret.cursor).toBeGreaterThanOrEqual(0)
          if (text.length > 0) expect(caret.cursor).toBeLessThan(text.length)
        } finally {
          row.remove()
        }
      },
    ),
    { seed: 20261010, numRuns: propertyRuns(60) },
  )
})
