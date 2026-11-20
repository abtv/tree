import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { EditorStore } from './editor-store'
import {
  applyCommand,
  command,
  createServices,
  deepForest,
  firstLocation,
  freshIds,
  isDisplayed,
  materialize,
  type ClipboardRef,
  type CommandAction,
} from './test/editor-store-arbitraries'
import { governingViewOwner, savedExpansionViews, type ExpansionState } from './expansion-state'
import { serializeState, type Document, type NodeId, type TreeNode } from '../domain/document'

type ReadyState = Extract<ReturnType<EditorStore['getSnapshot']>, { status: 'ready' }>

const starCommand: fc.Arbitrary<CommandAction> = fc.oneof(
  command,
  fc.record({
    kind: fc.constantFrom('star' as const, 'enter' as const, 'leave' as const),
    a: fc.nat({ max: 1_000 }),
    b: fc.nat({ max: 1_000 }),
    text: fc.string(),
  }),
)

/** Stars every node whose preorder position has a set flag. */
function withStars(document: Document, flags: readonly boolean[]): Document {
  let position = 0
  const star = (node: TreeNode): TreeNode => {
    const starred = flags[position++ % flags.length] === true
    const children = node.children.map(star)
    return { ...node, ...(starred ? { starred: true as const } : {}), children }
  }
  return { roots: document.roots.map(star) }
}

function views(expansion: ExpansionState): Map<NodeId | null, string[]> {
  const result = new Map<NodeId | null, string[]>()
  for (const [ownerId, ids] of expansion.otherViews) result.set(ownerId, [...ids].sort())
  result.set(expansion.viewOwnerId, [...expansion.expandedIds].sort())
  return result
}

function persistedView(state: ReadyState): unknown {
  return serializeState(state.document, state.location, savedExpansionViews(state.expansion)).view
}

/**
 * The active view always governs the displayed location, and a command changes only the active view:
 * a fold command any way, a move or shift only by opening folds. Every other view keeps its choices.
 */
function assertViews(store: EditorStore, before: ReadyState, action: CommandAction): void {
  const after = store.getSnapshot() as ReadyState

  // With finished tasks hidden, a location without a visible row keeps a hidden save anchor selected.
  if (!after.hideFinishedTasks) expect(isDisplayed(store)).toBe(true)
  expect(after.expansion.viewOwnerId).toBe(governingViewOwner(after.document, after.location.currentParentId))

  const previous = views(before.expansion)
  const next = views(after.expansion)
  for (const [ownerId, ids] of previous) {
    const folds = action.kind === 'toggleExpansion' || action.kind === 'foldAll'
    const opens = action.kind === 'shift' || action.kind === 'moveToParent'
    if (folds && ownerId === before.expansion.viewOwnerId) continue
    if (opens && ownerId === after.expansion.viewOwnerId) {
      for (const id of ids) expect(next.get(ownerId)).toContain(id)
      continue
    }
    expect(next.get(ownerId)).toEqual(ids)
  }
}

// @requirement PRODUCT.md §2.4
describe('EditorStore expansion views of starred nodes', () => {
  it('shows the governing view, keeps other views, and restores every view after a save', async () => {
    let exercisedStarredView = false

    await fc.assert(
      fc.asyncProperty(
        deepForest,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 7 }),
        fc.array(starCommand, { minLength: 1, maxLength: 30 }),
        fc.boolean(),
        async (rawForest, flags, commands, hideFinishedTasks) => {
          const document = withStars(materialize(rawForest), flags)
          const clipboard: ClipboardRef = { current: { kind: 'text', text: '' } }
          const services = (initial: unknown, clipboard: () => ClipboardRef['current']) => ({
            ...createServices(initial, clipboard),
            loadHideFinishedTasks: async () => hideFinishedTasks,
          })
          const store = new EditorStore(
            services(
              { version: 5, document, location: firstLocation(document), view: { expandedIds: [] } },
              () => clipboard.current,
            ),
            freshIds(),
          )

          await store.initialize()

          expect(store.getSnapshot().status).toBe('ready')

          for (const action of commands) {
            const before = store.getSnapshot() as ReadyState
            await applyCommand(store, action, clipboard)

            assertViews(store, before, action)
            if ((store.getSnapshot() as ReadyState).expansion.viewOwnerId !== null) exercisedStarredView = true
          }

          const state = store.getSnapshot() as ReadyState
          const persisted = JSON.parse(
            JSON.stringify(serializeState(state.document, state.location, savedExpansionViews(state.expansion))),
          )
          const restoredStore = new EditorStore(
            services(persisted, () => ({ kind: 'text', text: '' })),
            freshIds(),
          )

          await restoredStore.initialize()
          const restored = restoredStore.getSnapshot() as ReadyState

          expect(restored.document).toEqual(state.document)
          expect(persistedView(restored)).toEqual(persistedView(state))
          expect(restoredStore.getVisibleRows().map((row) => row.node.id)).toEqual(
            store.getVisibleRows().map((row) => row.node.id),
          )
        },
      ),
      {
        numRuns: propertyRuns(300),
        // A starred root entered from the root level. fast-check runs examples on every run, so the
        // assertion below holds for any seed and any reduced run count.
        examples: [
          [
            [
              {
                text: 'starred',
                hasAttachment: false,
                struckThrough: false,
                children: [{ text: 'child', hasAttachment: false, struckThrough: false, children: [] }],
              },
            ],
            [true],
            [{ kind: 'enter', a: 0, b: 0, text: '' }],
            false,
          ],
        ],
      },
    )

    // The run must reach a location governed by a starred view, not only the root view.
    expect(exercisedStarredView).toBe(true)
  })
})
