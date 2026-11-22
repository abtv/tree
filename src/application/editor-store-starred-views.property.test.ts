import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { EditorStore } from './editor-store'
import { HISTORY_LIMIT } from './editor-history'
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
import { locateNode, serializeState, type Document, type NodeId, type TreeNode } from '../domain/document'

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
 * Commands that drop no view: undo and redo release only snapshots whose view owners the restored
 * document contains, and the others record no change.
 */
const keepsEveryView = new Set<CommandAction['kind']>([
  'undo',
  'redo',
  'enter',
  'leave',
  'navigate',
  'up',
  'down',
  'selectDescendant',
  'toggleExpansion',
  'foldAll',
])

/**
 * The active view always governs the displayed location, and a command changes only the active view:
 * a fold command any way, a move or shift only by opening folds. Every other view keeps its choices,
 * except that a recorded change drops the views of absent nodes; their owners are added to `dropped`.
 */
function assertViews(store: EditorStore, before: ReadyState, action: CommandAction, dropped: Set<NodeId>): void {
  const after = store.getSnapshot() as ReadyState

  expect(isDisplayed(store)).toBe(true)
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
    if (ownerId !== null && !next.has(ownerId)) {
      expect(keepsEveryView.has(action.kind)).toBe(false)
      expect(locateNode(after.document, ownerId)).toBeUndefined()
      dropped.add(ownerId)
      continue
    }
    expect(next.get(ownerId)).toEqual(ids)
  }
}

/** No undo or redo state may contain a node whose view was dropped. */
function assertUnrestorable(store: EditorStore, dropped: ReadonlySet<NodeId>): void {
  for (const step of [() => store.undo(), () => store.redo()]) {
    for (let index = 0; index < HISTORY_LIMIT; index += 1) {
      step()
      const { document } = store.getSnapshot() as ReadyState
      for (const ownerId of dropped) expect(locateNode(document, ownerId)).toBeUndefined()
    }
  }
}

/**
 * Opens `document`, applies `commands` with the view checks after each one, then checks that a save
 * restores the document, every saved view and the visible rows. When a view was dropped, finally walks
 * undo and redo history to check that no state restores its node. Returns the store and the owners of
 * dropped views.
 */
async function checkViews(
  document: Document,
  commands: readonly CommandAction[],
): Promise<{ store: EditorStore; dropped: ReadonlySet<NodeId> }> {
  const clipboard: ClipboardRef = { current: { kind: 'text', text: '' } }
  const services = createServices
  const store = new EditorStore(
    services(
      { version: 5, document, location: firstLocation(document), view: { expandedIds: [] } },
      () => clipboard.current,
    ),
    freshIds(),
  )

  await store.initialize()

  expect(store.getSnapshot().status).toBe('ready')

  const dropped = new Set<NodeId>()
  for (const action of commands) {
    const before = store.getSnapshot() as ReadyState
    await applyCommand(store, action, clipboard)

    assertViews(store, before, action, dropped)
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

  if (dropped.size > 0) assertUnrestorable(store, dropped)
  return { store, dropped }
}

// @requirement PRODUCT.md §2.4
describe('EditorStore expansion views of starred nodes', () => {
  it('shows the governing view, keeps other views, and restores every view after a save', async () => {
    await fc.assert(
      fc.asyncProperty(
        deepForest,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 7 }),
        fc.array(starCommand, { minLength: 1, maxLength: 30 }),
        async (rawForest, flags, commands) => {
          await checkViews(withStars(materialize(rawForest), flags), commands)
        },
      ),
      { numRuns: propertyRuns(300) },
    )
  })

  it('gives an entered starred root its own view and restores it after a save', async () => {
    const step: TreeNode = { id: 'step', text: 'step', children: [] }
    const phase: TreeNode = { id: 'phase', text: 'phase', children: [step] }
    const document: Document = {
      roots: [
        { id: 'project', text: 'project', starred: true, children: [phase] },
        { id: 'home', text: 'home', children: [] },
      ],
    }
    const fold = (a: number): CommandAction => ({ kind: 'toggleExpansion', a, b: 0, text: '' })

    // Opens the project in the root view, enters it and opens the phase in the project's view.
    const { store } = await checkViews(document, [fold(0), { kind: 'enter', a: 0, b: 0, text: '' }, fold(0)])
    const state = store.getSnapshot() as ReadyState

    expect(state.expansion.viewOwnerId).toBe('project')
    expect(store.getVisibleRows().map((row) => row.node.id)).toEqual(['phase', 'step'])
    expect(savedExpansionViews(state.expansion)).toEqual({
      expandedIds: new Set(['project']),
      starredExpandedIds: new Map([['project', new Set(['phase'])]]),
    })
  })

  it('drops the view of a node that only a discarded redo branch held', async () => {
    const document: Document = { roots: [{ id: 'home', text: 'home', children: [] }] }
    const action = (kind: CommandAction['kind'], a = 0, text = ''): CommandAction => ({ kind, a, b: 0, text })

    // Creates `x0` after `home`, stars and enters it, leaves, undoes the star and the creation, then edits.
    const { dropped } = await checkViews(document, [
      action('split', 4),
      action('star'),
      action('enter'),
      action('leave'),
      action('undo'),
      action('undo'),
      action('edit', 0, 'Home'),
    ])

    expect([...dropped]).toEqual(['x0'])
  })
})
