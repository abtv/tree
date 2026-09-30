import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { EditorStore } from './editor-store'
import { isValidLocation, type Document, type Location, type TreeNode } from '../domain/document'
import {
  applyCommand,
  command,
  createServices,
  firstLocation,
  forest,
  freshIds,
  isDisplayed,
  materialize,
  type ClipboardRef,
} from './test/editor-store-arbitraries'

function sameNode(a: TreeNode, b: TreeNode): boolean {
  if (a === b) return true
  if (a.id !== b.id || a.text !== b.text) return false
  if ((a.attachment?.id ?? null) !== (b.attachment?.id ?? null)) return false
  const aLinks = a.links ?? []
  const bLinks = b.links ?? []
  if (aLinks.length !== bLinks.length) return false
  for (let i = 0; i < aLinks.length; i++) {
    const x = aLinks[i]!
    const y = bLinks[i]!
    if (x.start !== y.start || x.end !== y.end || x.url !== y.url) return false
  }
  if (a.children.length !== b.children.length) return false
  for (let i = 0; i < a.children.length; i++) {
    if (!sameNode(a.children[i]!, b.children[i]!)) return false
  }
  return true
}

/** Content equality, as opposed to the reference equality a no-op command may still break by
 * rebuilding an identical tree (for example pasting empty clipboard text). */
function sameDocument(a: Document, b: Document): boolean {
  if (a === b) return true
  if (a.roots.length !== b.roots.length) return false
  for (let i = 0; i < a.roots.length; i++) {
    if (!sameNode(a.roots[i]!, b.roots[i]!)) return false
  }
  return true
}

/**
 * Asserts the location the task requires after an undo or redo call that actually restored a
 * history entry. `store.undo()`/`store.redo()` leave the snapshot reference untouched when there is
 * nothing to undo or redo, so `hadEffect` distinguishes that no-op from a real one: with nothing to
 * restore, the store makes no claim about the current, possibly synthetic, selection (for example one
 * `selectDescendant` placed below the currently displayed level without expanding its ancestor).
 */
function expectRestoredLocation(store: EditorStore, hadEffect: boolean, document: Document, location: Location): void {
  if (!hadEffect) return
  expect(isValidLocation(document, location)).toBe(true)
  expect(isDisplayed(store)).toBe(true)
}

// This property drives undo and redo itself, so the generated sequence excludes the 'undo' and
// 'redo' command kinds: mixing them in would make it impossible to tell whether a given history
// entry came from a generated command or from the property's own probing.
const nonHistoryCommand = command.filter((action) => action.kind !== 'undo' && action.kind !== 'redo')

describe('EditorStore undo and redo semantics', () => {
  it('undoes each command to the document it changed, and redo replays it back', async () => {
    await fc.assert(
      fc.asyncProperty(
        forest,
        fc.array(nonHistoryCommand, { minLength: 1, maxLength: 30 }),
        async (rawForest, commands) => {
          const document = materialize(rawForest)
          const clipboard: ClipboardRef = { current: { kind: 'text', text: '' } }
          const store = new EditorStore(
            createServices({ version: 1, document, location: firstLocation(document) }, () => clipboard.current),
            freshIds(),
          )
          await store.initialize()

          const initial = store.getSnapshot()
          if (initial.status !== 'ready') return
          // What one undo() should currently restore. A command that changes the document advances
          // it to that command's own "before"; a command that does not leaves it exactly as is, so
          // the next undo() still reverses the previous document change instead of this one.
          let expectedUndo: Document = initial.document

          for (const action of commands) {
            const stateBefore = store.getSnapshot()
            if (stateBefore.status !== 'ready') break
            const before = stateBefore.document

            const ran = await applyCommand(store, action, clipboard)
            if (!ran) break
            store.endTextSession()

            const stateAfter = store.getSnapshot()
            if (stateAfter.status !== 'ready') break
            const after = stateAfter.document
            const changed = !sameDocument(before, after)
            const target = changed ? before : expectedUndo

            // Probing with one undo then one redo is idempotent on the accumulated history: it
            // restores the document and the stack depth exactly as they were, so it can run after
            // every command without disturbing the sequence still to come.
            const beforeUndo = store.getSnapshot()
            store.undo()
            const undone = store.getSnapshot()
            expect(undone.status).toBe('ready')
            if (undone.status !== 'ready') return
            expect(undone.document).toEqual(target)
            expectRestoredLocation(store, undone !== beforeUndo, undone.document, undone.location)

            const beforeRedo = store.getSnapshot()
            store.redo()
            const redone = store.getSnapshot()
            expect(redone.status).toBe('ready')
            if (redone.status !== 'ready') return
            expect(redone.document).toEqual(after)
            expectRestoredLocation(store, redone !== beforeRedo, redone.document, redone.location)

            expectedUndo = target
          }

          const finalState = store.getSnapshot()
          if (finalState.status !== 'ready') return
          const finalDocument = finalState.document

          // k undos followed by k redos restore the document reached before the undos, for any k up
          // to the whole sequence; undo and redo are no-ops once the stack is exhausted at either end.
          const rounds = commands.length
          for (let i = 0; i < rounds; i++) {
            const beforeUndo = store.getSnapshot()
            store.undo()
            const state = store.getSnapshot()
            expect(state.status).toBe('ready')
            if (state.status !== 'ready') return
            expectRestoredLocation(store, state !== beforeUndo, state.document, state.location)
          }
          for (let i = 0; i < rounds; i++) {
            const beforeRedo = store.getSnapshot()
            store.redo()
            const state = store.getSnapshot()
            expect(state.status).toBe('ready')
            if (state.status !== 'ready') return
            expectRestoredLocation(store, state !== beforeRedo, state.document, state.location)
          }

          const restored = store.getSnapshot()
          expect(restored.status).toBe('ready')
          if (restored.status !== 'ready') return
          expect(restored.document).toEqual(finalDocument)
        },
      ),
      { numRuns: propertyRuns(300) },
    )
  })
})
