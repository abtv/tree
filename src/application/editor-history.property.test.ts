import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { collectAttachmentIds, type Document, type Location } from '../domain/document'
import { EditorHistory, HISTORY_LIMIT } from './editor-history'

const location: Location = { currentParentId: null, selectedNodeId: 'root' }
const root = (text: string): Document => ({ roots: [{ id: 'root', text, children: [] }] })

describe('EditorHistory invariants under the history cap', () => {
  it('undoes exactly the retained entries and redoes them back', () => {
    fc.assert(
      fc.property(fc.array(fc.string(), { minLength: 1, maxLength: HISTORY_LIMIT + 60 }), (texts) => {
        const history = new EditorHistory()
        const retained = texts.slice(-HISTORY_LIMIT)
        retained.forEach((text) => history.begin(root(text)))

        let current = root('live')
        const undone: Document[] = []
        for (;;) {
          const result = history.undo(current, location)
          if (result === undefined) break
          undone.push(result.document)
          current = result.document
        }

        expect(undone).toHaveLength(retained.length)
        expect(undone.map((document) => document.roots[0]!.text)).toEqual([...retained].reverse())

        for (let index = 0; index < undone.length; index += 1) {
          const redone = history.redo(current, location)
          expect(redone).toBeDefined()
          if (redone === undefined) return
          current = redone.document
        }
        expect(history.redo(current, location)).toBeUndefined()
      }),
    )
  })

  it('keeps tracked attachment ids equal to the retained snapshots', () => {
    const documentWith = (attachmentId: string): Document => ({
      roots: [
        {
          id: 'root',
          text: 'live',
          ...(attachmentId === '' ? {} : { attachment: { id: attachmentId, mimeType: 'image/png' as const } }),
          children: [],
        },
      ],
    })

    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.constantFrom('begin' as const, 'undo' as const, 'redo' as const),
            attachment: fc.constantFrom('', 'a', 'b', 'c'),
          }),
          { minLength: 1, maxLength: 120 },
        ),
        (steps) => {
          const history = new EditorHistory()
          let current = documentWith('')
          for (const step of steps) {
            if (step.action === 'begin') {
              history.begin(current)
              current = documentWith(step.attachment)
            } else if (step.action === 'undo') {
              const result = history.undo(current, location)
              if (result !== undefined) current = result.document
            } else {
              const result = history.redo(current, location)
              if (result !== undefined) current = result.document
            }

            const expected = new Set<string>()
            for (const document of history.documents()) {
              collectAttachmentIds(document).forEach((id) => expected.add(id))
            }
            expect(new Set(history.attachmentIds())).toEqual(expected)
          }
        },
      ),
    )
  })
})
