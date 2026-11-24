import fc from 'fast-check'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { calendarDateOf, dayNumberOf, formatCanonicalDate } from '../domain/calendar-date'
import {
  locateNode,
  serializeState,
  type Document,
  type NodeId,
  type PersistedView,
  type TreeNode,
} from '../domain/document'
import { EditorStore } from './editor-store'
import type { ReadySnapshot } from './editor-runtime-state'
import { agendaTimelineReturn, agendaWeekStart, dayKey, focusedAgendaDay, overdueKey } from './agenda-state'
import { savedExpansionViews, type ExpansionState } from './expansion-state'
import { allIds, createServices, firstLocation, freshIds, isDisplayed } from './test/editor-store-arbitraries'

// The properties below keep their own record of the folds that search opened: a fold that a jump opens
// joins it, and an explicit fold command on that fold removes it. They never read the owner's record, so
// a transition that forgets to consult the owner fails here.

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

interface Shape {
  readonly match: boolean
  readonly starred: boolean
  readonly children: readonly Shape[]
}

function shape(depth: number): fc.Arbitrary<Shape> {
  return fc.record<Shape>({
    match: fc.integer({ min: 0, max: 3 }).map((value) => value > 0),
    starred: fc.integer({ min: 0, max: 3 }).map((value) => value === 0),
    children: depth === 0 ? fc.constant([]) : fc.array(shape(depth - 1), { maxLength: 2 }),
  })
}

function treeDocument(shapes: readonly Shape[]): Document {
  let counter = 0
  const build = (source: Shape): TreeNode => {
    const id = `n${counter++}`
    return {
      id,
      text: source.match ? 'needle' : 'plain',
      ...(source.starred ? { starred: true as const } : {}),
      children: source.children.map(build),
    }
  }
  return { roots: shapes.map(build) }
}

const FOLDS = ['close', 'open', 'toggle', 'close-recursive', 'open-recursive', 'close-all', 'open-all'] as const

const treeStep = fc.record({
  kind: fc.constantFrom(
    'find' as const,
    'repeat' as const,
    'repeat' as const,
    'escape' as const,
    'click' as const,
    'select' as const,
    'enter' as const,
    'leave' as const,
    'root' as const,
    'star' as const,
    'agenda' as const,
    'chevron' as const,
    'fold' as const,
    'fold' as const,
    'edit' as const,
  ),
  a: fc.nat({ max: 1_000 }),
  b: fc.nat({ max: 1_000 }),
})

type TreeStep = { kind: string; a: number; b: number }

/**
 * On every other choice, narrows the candidates to those search opened, when there are any: the commands
 * that take a fold over from search would otherwise rarely meet one.
 */
function preferring<T>(candidates: readonly T[], opened: (candidate: T) => boolean, choice: number): readonly T[] {
  const preferred = choice % 2 === 0 ? candidates.filter(opened) : []
  return preferred.length > 0 ? preferred : candidates
}

function pathTo(document: Document, nodeId: NodeId): Set<NodeId> {
  return new Set(locateNode(document, nodeId)?.ancestors.map((node) => node.id) ?? [])
}

function subtreeIds(node: TreeNode): NodeId[] {
  return [node.id, ...node.children.flatMap(subtreeIds)]
}

function viewsOf(expansion: ExpansionState): Map<NodeId | null, ReadonlySet<NodeId>> {
  return new Map([...expansion.otherViews, [expansion.viewOwnerId, expansion.expandedIds]])
}

function scopeOf(state: ReadySnapshot): string {
  return `${state.location.currentParentId ?? ''}|${state.expansion.viewOwnerId ?? ''}`
}

/** The active view as Escape would leave it (§20.2.26): search folds stay only on the selected path. */
function escapeLeaves(state: ReadySnapshot, owned: ReadonlySet<NodeId>): Set<NodeId> {
  const keep = pathTo(state.document, state.location.selectedNodeId)
  return new Set([...state.expansion.expandedIds].filter((id) => !owned.has(id) || keep.has(id)))
}

function foldsOf(view: PersistedView): Record<string, readonly NodeId[]> {
  const folds: Record<string, readonly NodeId[]> = { root: [...view.expandedIds].sort() }
  for (const [ownerId, ids] of Object.entries(view.starredExpandedIds ?? {}))
    folds[`starred:${ownerId}`] = [...ids].sort()
  return folds
}

/** Makes the store save now and returns the saved view. */
async function saveView(store: EditorStore, saves: readonly unknown[]): Promise<PersistedView> {
  const count = saves.length
  store.noteViewportChange()
  await store.flushPersistence()

  expect(saves.length).toBeGreaterThan(count)

  return (saves.at(-1) as { view: PersistedView }).view
}

/**
 * A change of location, presentation or view closes search folds as Escape would just before it: the
 * view being left keeps only the path to the selection being left, and no other view gains a closed fold.
 */
function expectScopeLeft(before: ReadySnapshot, after: ReadySnapshot, owned: ReadonlySet<NodeId>): void {
  const left = escapeLeaves(before, owned)
  const previous = viewsOf(before.expansion)

  expect(viewsOf(after.expansion).get(before.expansion.viewOwnerId)).toEqual(left)

  for (const [ownerId, ids] of viewsOf(after.expansion)) {
    if (ownerId === before.expansion.viewOwnerId) continue
    for (const id of owned) {
      if (!left.has(id) && ids.has(id)) expect(previous.get(ownerId)?.has(id)).toBe(true)
    }
  }
}

async function checkTreeSearchFolds(
  shapes: readonly Shape[],
  expanded: readonly number[],
  steps: readonly TreeStep[],
): Promise<void> {
  const document = treeDocument(shapes)
  const ids = allIds(document)
  const expandedIds = [...new Set(expanded.map((index) => ids[index % ids.length]!))]
  const services = createServices(
    { version: 5, document, location: firstLocation(document), view: { expandedIds } },
    () => ({ kind: 'text', text: '' }),
  )
  const store = new EditorStore(services, freshIds())
  await store.initialize()
  const state = () => store.getSnapshot() as ReadySnapshot
  const owned = new Set<NodeId>()

  for (const step of steps) {
    const before = state()
    const rows = store.getVisibleRows()
    const selected = locateNode(before.document, before.location.selectedNodeId)!.node

    switch (step.kind) {
      case 'find':
      case 'repeat': {
        if (step.kind === 'find') {
          store.search.begin(store.searchOrigin(before.focus.cursor))
          store.search.edit('needle')
          store.search.confirm(step.a % 2 === 0 ? 1 : -1)
        } else {
          store.search.navigate(store.searchOrigin(before.focus.cursor), step.a % 2 === 0 ? 1 : -1, 1 + (step.b % 3))
        }
        await vi.runAllTimersAsync()
        const after = state()
        const path = pathTo(after.document, after.location.selectedNodeId)

        expect(scopeOf(after)).toBe(scopeOf(before))
        expect(after.expansion.otherViews).toEqual(before.expansion.otherViews)

        for (const id of before.expansion.expandedIds) expect(after.expansion.expandedIds.has(id)).toBe(true)
        for (const id of after.expansion.expandedIds) {
          if (before.expansion.expandedIds.has(id)) continue

          // A jump reveals only the destination's ancestor path.
          expect(path.has(id)).toBe(true)

          owned.add(id)
        }
        break
      }
      case 'escape': {
        // The renderer sends Escape to search only while its feedback is visible.
        if (!store.search.session.getSnapshot().visible) break
        store.hideSearch()

        expect(state().expansion.expandedIds).toEqual(escapeLeaves(before, owned))
        expect(state().expansion.otherViews).toEqual(before.expansion.otherViews)
        expect(state().location).toEqual(before.location)

        owned.clear()
        break
      }
      case 'click': {
        store.hideSearchAtPointer()
        if (rows.length > 0) store.selectNode(rows[step.a % rows.length]!.node.id, 0)

        expect(store.search.session.getSnapshot().visible).toBe(false)
        expect(state().expansion).toEqual(before.expansion)
        break
      }
      case 'select': {
        const pool = preferring(rows, (row) => owned.has(row.node.id), step.b)
        if (pool.length > 0) store.selectNode(pool[step.a % pool.length]!.node.id, 0)

        expect(state().expansion).toEqual(before.expansion)
        break
      }
      case 'edit': {
        store.editText(selected.id, step.a % 2 === 0 ? 'needle edited' : 'plain edited')
        store.endTextSession()

        expect(state().expansion).toEqual(before.expansion)
        break
      }
      case 'chevron': {
        const parents = preferring(
          rows.filter((row) => row.node.children.length > 0),
          (row) => owned.has(row.node.id),
          step.b,
        )
        if (parents.length === 0) break
        const node = parents[step.a % parents.length]!.node
        store.toggleExpansion(node.id)
        owned.delete(node.id)
        break
      }
      case 'fold': {
        // Fold commands act on the selected node's own fold or on every fold of the location.
        const operation = FOLDS[step.a % FOLDS.length]!
        if (operation.endsWith('-all')) {
          store.applyFold(operation)
          owned.clear()
        } else if (selected.children.length > 0 && selected.id !== before.location.currentParentId) {
          store.applyFold(operation, selected.id)
          for (const id of operation.endsWith('-recursive') ? subtreeIds(selected) : [selected.id]) owned.delete(id)
        }
        break
      }
      case 'agenda': {
        store.openAgenda()

        expect(state().agenda).toBeDefined()
        expectScopeLeft(before, state(), owned)

        const left = state().expansion
        owned.clear()
        store.closeAgenda()

        expect(state().agenda).toBeUndefined()
        expect(state().expansion).toEqual(left)
        break
      }
      default: {
        if (step.kind === 'enter') store.enter()
        else if (step.kind === 'leave') store.leave()
        else if (step.kind === 'root') store.navigateToAncestor(null)
        else store.toggleStarNode()
        const after = state()

        if (scopeOf(after) === scopeOf(before)) {
          expect(after.expansion).toEqual(before.expansion)
        } else {
          expectScopeLeft(before, after, owned)

          owned.clear()
        }
      }
    }

    await vi.runAllTimersAsync()
    const after = state()
    const saved = await saveView(store, services.saves)
    const expected = serializeState(
      after.document,
      after.location,
      savedExpansionViews({ ...after.expansion, expandedIds: escapeLeaves(after, owned) }),
    ).view!

    expect(isDisplayed(store)).toBe(true)
    // Every save stores the folds Escape would leave, while the branches stay open on screen.
    expect(foldsOf(saved)).toEqual(foldsOf(expected))
    expect(state().expansion).toBe(after.expansion)
  }
}

const today = dayNumberOf({ year: 2026, month: 10, day: 22 })
const dateText = (day: number): string => formatCanonicalDate(calendarDateOf(day))

const AGENDA_FOLDS = ['toggle-fold', ...FOLDS] as const

const agendaStep = fc.record({
  kind: fc.constantFrom(
    'find' as const,
    'find' as const,
    'repeat' as const,
    'repeat' as const,
    'repeat' as const,
    'escape' as const,
    'select' as const,
    'select' as const,
    'fold' as const,
    'fold' as const,
    'week' as const,
    'focus' as const,
    'focus' as const,
    'return' as const,
    'reopen' as const,
    'redate' as const,
  ),
  a: fc.nat({ max: 1_000 }),
  b: fc.nat({ max: 1_000 }),
})

function agendaScopeOf(state: ReadySnapshot): string {
  return `${state.agenda!.weekStart}|${focusedAgendaDay(state.agenda) ?? 'timeline'}`
}

/** The day or Overdue group that shows the selected occurrence. */
function agendaPath(store: EditorStore): Set<string> {
  const selectedKey = (store.getSnapshot() as ReadySnapshot).agenda!.selectedKey
  const row = store.getAgendaRows().find((candidate) => candidate.key === selectedKey)
  return new Set(row?.kind === 'node' ? [row.groupKey ?? dayKey(row.day)] : [])
}

function union(base: ReadonlySet<string>, added: Iterable<string>): Set<string> {
  return new Set([...base, ...added])
}

function rememberedKeys(view: PersistedView): Set<string> {
  return new Set([
    ...(view.agendaFolds?.days.map(dayKey) ?? []),
    ...(view.agendaFolds?.overdueWeeks.map(overdueKey) ?? []),
  ])
}

interface DatedEntry {
  readonly offset: number
  readonly folded: boolean
}

async function checkAgendaSearchFolds(
  entries: readonly DatedEntry[],
  overdueFolded: boolean,
  steps: readonly TreeStep[],
): Promise<void> {
  const document: Document = {
    roots: entries.map(({ offset }, index) => ({
      id: `n${index}`,
      text: `needle ${dateText(today + offset)}`,
      children: [],
    })),
  }
  // Remembered folds give search closed days to reveal from the first jump.
  const agendaFolds = {
    days: [...new Set(entries.filter((entry) => entry.folded).map((entry) => today + entry.offset))],
    overdueWeeks: overdueFolded ? [agendaWeekStart(today)] : [],
  }
  const view = { expandedIds: [], agendaFolds }
  const services = {
    ...createServices({ version: 5, document, location: firstLocation(document), view }, () => ({
      kind: 'text' as const,
      text: '',
    })),
    today: () => today,
  }
  const store = new EditorStore(services, freshIds())
  await store.initialize()
  const state = () => store.getSnapshot() as ReadySnapshot
  const tree = state().expansion
  const owned = new Set<string>()
  const remembered = new Set([...agendaFolds.days.map(dayKey), ...agendaFolds.overdueWeeks.map(overdueKey)])
  store.openAgenda()

  expect(state().agenda!.collapsed).toEqual(remembered)

  for (const step of steps) {
    const before = state()
    const agenda = before.agenda!
    const rows = store.getAgendaRows()
    const keep = agendaPath(store)
    const closed = [...owned].filter((key) => !keep.has(key))
    const days = rows.filter((row) => row.kind === 'day')
    let reveals = false

    switch (step.kind) {
      case 'find':
        store.search.begin(store.searchOrigin(0))
        store.search.edit('needle')
        store.search.confirm(step.a % 2 === 0 ? 1 : -1)
        break
      case 'repeat':
        store.search.navigate(store.searchOrigin(0), step.a % 2 === 0 ? 1 : -1, 1 + (step.b % 3))
        break
      case 'escape':
        // The renderer sends Escape to search only while its feedback is visible.
        if (!store.search.session.getSnapshot().visible) break
        store.hideSearch()

        expect(state().agenda!.collapsed).toEqual(union(agenda.collapsed, closed))
        expect(state().agenda!.presentation).toEqual(agenda.presentation)

        owned.clear()
        break
      case 'select':
        store.applyAgenda({ kind: 'select', key: rows[step.a % rows.length]!.key })

        expect(state().agenda!.collapsed).toEqual(agenda.collapsed)
        break
      case 'fold': {
        const populated = days.filter((row) => row.content)
        if (populated.length === 0) break
        const pool = preferring(populated, (row) => owned.has(row.key), step.a + step.b)
        const key = pool[step.a % pool.length]!.key
        const operation = AGENDA_FOLDS[step.b % AGENDA_FOLDS.length]!
        store.applyAgenda(operation === 'toggle-fold' ? { kind: 'toggle-fold', key } : { kind: 'fold', key, operation })
        const all = operation.endsWith('-all')
        // A fold of every day takes over every search fold, including one whose group is now empty.
        if (all) owned.clear()
        for (const target of all ? populated.map((row) => row.key) : [key]) {
          owned.delete(target)
          // Only an explicit timeline fold records its resulting choice (§23.5).
          if (agenda.presentation.kind !== 'timeline') continue
          if (state().agenda!.collapsed.has(target)) remembered.add(target)
          else remembered.delete(target)
        }
        break
      }
      case 'week':
        store.applyAgenda({ kind: 'shift-week', direction: step.a % 2 === 0 ? 1 : -1 })
        break
      case 'focus':
        store.applyAgenda({ kind: 'focus-day', key: days[step.a % days.length]!.key, scrollTop: 0 })
        break
      case 'return':
        store.applyAgenda({ kind: 'return-timeline', key: agenda.selectedKey })
        break
      case 'reopen':
        store.closeAgenda()
        store.openAgenda()

        // Closing Agenda discards search folds; reopening starts from the remembered choices alone.
        expect(state().agenda!.collapsed).toEqual(remembered)

        owned.clear()
        break
      default: {
        // A date edit can carry the selected occurrence, and the displayed week with it, a week ahead.
        const row = rows.find((candidate) => candidate.key === agenda.selectedKey)
        if (row?.kind !== 'node') break
        store.editText(row.nodeId, `needle ${dateText(row.day + 7)}`)
        store.endTextSession()
        // The edit reveals the day the occurrence arrives at (§23.7), which is not a search fold.
        reveals = true
      }
    }

    await vi.runAllTimersAsync()
    const after = state().agenda!

    expect(after).toBeDefined()

    if (step.kind === 'find' || step.kind === 'repeat') {
      const path = agendaPath(store)

      expect(agendaScopeOf(state())).toBe(agendaScopeOf(before))
      expect(after.presentation).toEqual(agenda.presentation)

      for (const key of after.collapsed) expect(agenda.collapsed.has(key)).toBe(true)
      for (const key of agenda.collapsed) {
        if (after.collapsed.has(key)) continue

        // A jump reveals only the selected occurrence's day or group.
        expect(path.has(key)).toBe(true)

        owned.add(key)
      }
    } else if (step.kind !== 'reopen' && agendaScopeOf(state()) !== agendaScopeOf(before)) {
      const timeline = agendaTimelineReturn(agenda)
      if (timeline !== undefined && after.presentation.kind === 'timeline') {
        // Returning from a focused day restores the timeline's own folds, untouched by search (§23.15).
        expect(after.collapsed).toEqual(timeline.collapsed)
      } else {
        // A week or focused-day change closes what search opened, as Escape does, and opens nothing.
        for (const key of closed) expect(after.collapsed.has(key)).toBe(true)
        for (const key of after.collapsed) expect(agenda.collapsed.has(key) || owned.has(key)).toBe(true)
        if (!reveals) for (const key of agenda.collapsed) expect(after.collapsed.has(key)).toBe(true)

        // The timeline a newly focused day returns to closes them too, keeping its own selection's path.
        if (timeline === undefined && after.presentation.kind === 'focused-day')
          expect(after.presentation.timelineReturn.collapsed).toEqual(union(agenda.collapsed, closed))
        // A focused day that moves to another week leaves the timeline it returns to alone.
        if (timeline !== undefined) expect(agendaTimelineReturn(after)).toBe(timeline)
      }

      owned.clear()
    }

    const saved = await saveView(store, services.saves)

    // Agenda fold memory changes only on explicit timeline folds, and Agenda never changes Tree folds.
    expect(rememberedKeys(saved)).toEqual(remembered)
    expect(saved.expandedIds).toEqual([])
    expect(state().expansion.expandedIds).toEqual(tree.expandedIds)
    expect(store.getAgendaRows().some((row) => row.key === state().agenda!.selectedKey)).toBe(true)
  }
}

// @requirement PRODUCT.md §20.2.26
// @requirement PRODUCT.md §20.2.31
describe('search-opened folds across generated command sequences', () => {
  it('saves what Escape would leave and closes Tree search folds whenever their location or view ends', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(shape(3), { minLength: 1, maxLength: 3 }),
        fc.array(fc.nat({ max: 1_000 }), { maxLength: 6 }),
        fc.array(treeStep, { minLength: 1, maxLength: 30 }),
        checkTreeSearchFolds,
      ),
      { numRuns: propertyRuns(150) },
    )
  })

  // @requirement PRODUCT.md §23.5
  // @requirement PRODUCT.md §23.15
  it('closes Agenda search folds with their week or focused day and never records them as choices', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ offset: fc.integer({ min: -9, max: 9 }), folded: fc.boolean() }), {
          minLength: 1,
          maxLength: 8,
        }),
        fc.boolean(),
        fc.array(agendaStep, { minLength: 1, maxLength: 30 }),
        checkAgendaSearchFolds,
      ),
      { numRuns: propertyRuns(150) },
    )
  })
})
