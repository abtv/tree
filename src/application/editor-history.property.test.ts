import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { attachmentSummary, collectAttachmentIds, type Document, type Location } from '../domain/document'
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

  // @requirement PRODUCT.md §2.4
  it('keeps the view of an absent node exactly while a retained snapshot holds the node', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            action: fc.constantFrom(
              'add' as const,
              'remove' as const,
              'edit' as const,
              'undo' as const,
              'redo' as const,
            ),
            pick: fc.nat(),
            // Long runs of edits fill history, so later changes evict the oldest snapshots.
            repeat: fc.constantFrom(1, 1, 1, HISTORY_LIMIT),
          }),
          { minLength: 1, maxLength: 120 },
        ),
        (steps) => {
          // A document's root text lists its view owners. A change adds a node with a fresh id or removes
          // one, so a removed id returns only through undo or redo, as in the editor.
          const ownersOf = (document: Document): string[] => document.roots[0]!.text.split(',').filter(Boolean)
          const history = new EditorHistory(attachmentSummary, (recorded, replacement) =>
            ownersOf(recorded).filter((owner) => !ownersOf(replacement).includes(owner)),
          )
          const views = new Set<string>()
          let created = 0
          let current = root('')
          const change = (next: Document): void => {
            history.begin(current, next)
            current = next
          }
          for (const step of steps) {
            const owners = ownersOf(current)
            if (step.action === 'add') {
              const owner = `n${created++}`
              views.add(owner)
              change(root([...owners, owner].join(',')))
            } else if (step.action === 'remove' && owners.length > 0) {
              const removed = owners[step.pick % owners.length]
              change(root(owners.filter((owner) => owner !== removed).join(',')))
            } else if (step.action === 'edit') {
              for (let index = 0; index < step.repeat; index += 1) change(root(owners.join(',')))
            } else if (step.action === 'undo') {
              current = history.undo(current, location)?.document ?? current
            } else if (step.action === 'redo') {
              current = history.redo(current, location)?.document ?? current
            }
            for (const owner of history.takeReleasedViewOwners()) {
              if (!ownersOf(current).includes(owner)) views.delete(owner)
            }

            const held = new Set([...history.documents()].flatMap(ownersOf))
            for (let index = 0; index < created; index += 1) {
              const owner = `n${index}`
              if (!ownersOf(current).includes(owner)) expect(views.has(owner)).toBe(held.has(owner))
            }
          }
        },
      ),
    )
  })
})
