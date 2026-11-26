import {
  pinnedAgendaOccurrence,
  focusedAgendaDay,
  dayKey,
  agendaWeekDays,
  agendaWeekStart,
  activeAgendaOccurrence,
  overdueKey,
  type AgendaState,
  type AgendaOccurrence,
} from './agenda-state'
import { buildNodeIndex, locateNode, type Document, type NodeId, type TreeNode } from '../domain/document'
import {
  agendaDaysOf,
  projectAgenda,
  type AgendaProjectionDay,
  type AgendaProjectionRow,
} from '../domain/agenda-projection'
import type { DayNumber } from '../domain/calendar-date'

/**
 * Whether an Agenda occurrence owns an editor (`docs/PRODUCT.md` §23.9): a direct match does when it is
 * the active occurrence or when its node occupies at most one day. A mark adds Today to the node's days
 * (`docs/PRODUCT.md` §2.7), so a marked node dated on another day occupies two days.
 */
export function isEditableOccurrence(
  row: { readonly role: AgendaProjectionRow['role']; readonly nodeId: NodeId; readonly day: DayNumber },
  node: TreeNode,
  active: AgendaOccurrence | undefined,
  today: DayNumber,
): boolean {
  return (
    row.role === 'match' &&
    ((active?.nodeId === row.nodeId && active.day === row.day) || new Set(agendaDaysOf(node, today)).size <= 1)
  )
}

/** The projected ancestor path, excluding the destination itself. */
export function agendaAncestorKeys(
  projection: readonly AgendaProjectionDay[],
  occurrence: AgendaOccurrence,
  state?: AgendaState,
): readonly string[] | undefined {
  const rows = projection.find((entry) => entry.day === occurrence.day)?.rows
  const index = rows?.findIndex((row) => row.nodeId === occurrence.nodeId && row.role === 'match') ?? -1
  if (rows === undefined || index < 0) return undefined
  return [
    state !== undefined &&
    state.presentation.kind === 'timeline' &&
    state.weekStart === agendaWeekStart(state.today) &&
    occurrence.day < state.weekStart
      ? overdueKey(state.weekStart)
      : dayKey(occurrence.day),
  ]
}

export type AgendaRow =
  | {
      readonly kind: 'path'
      readonly key: string
      readonly day: DayNumber
      readonly parentId: NodeId
      readonly groupKey?: string
    }
  | {
      readonly kind: 'separator'
      readonly key: string
      readonly day: DayNumber
    }
  | {
      readonly kind: 'day'
      readonly key: string
      readonly day: DayNumber
      readonly content: boolean
      readonly isToday: boolean
      readonly overdue?: boolean
    }
  | {
      readonly kind: 'node'
      readonly key: string
      readonly day: DayNumber
      readonly nodeId: NodeId
      readonly depth: number
      readonly role: 'match'
      readonly groupKey?: string
    }

/** Add the one temporarily invalid item and its ancestors without copying document nodes. */
export function agendaProjection(
  document: Document,
  state: AgendaState,
  previous?: { document: Document; projection: readonly AgendaProjectionDay[] },
): readonly AgendaProjectionDay[] {
  const projection = projectAgenda(document, state.scopeParentId, previous, state.today)
  const pin = pinnedAgendaOccurrence(state)
  if (pin === undefined) return projection
  const located = locateNode(document, pin.nodeId)
  if (located === undefined) return projection
  const start =
    state.scopeParentId === null ? 0 : located.ancestors.findIndex((node) => node.id === state.scopeParentId) + 1
  if (state.scopeParentId !== null && start === 0) return projection
  // Stryker disable next-line ArrayDeclaration: A non-row default element has undefined identity and never matches any real tree node.
  const original = projection.find((entry) => entry.day === pin.day)?.rows ?? []
  const included = new Map(original.map((row) => [row.nodeId, row.role]))
  // Stryker disable next-line MethodExpression: Traversal starts below the scope, so extra ancestors in this map are never emitted.
  for (const ancestor of located.ancestors.slice(start)) {
    if (!included.has(ancestor.id)) included.set(ancestor.id, 'context')
  }
  included.set(pin.nodeId, 'match')
  const rows: AgendaProjectionRow[] = []
  const visit = (node: TreeNode, depth: number): void => {
    const role = included.get(node.id)
    if (role === undefined) return
    rows.push({ nodeId: node.id, depth, role })
    for (const child of node.children) visit(child, depth + 1)
  }
  const roots = state.scopeParentId === null ? document.roots : locateNode(document, state.scopeParentId)!.node.children
  for (const root of roots) visit(root, 0)
  return [...projection.filter((entry) => entry.day !== pin.day), { day: pin.day, rows }].sort((a, b) => a.day - b.day)
}

interface DayRows {
  projected: readonly AgendaProjectionRow[]
  rows: readonly AgendaRow[]
}

/** Paths are read-only navigation rows; document order and dated occurrences stay intact. */
function withParentPaths(rows: readonly AgendaRow[], document?: Document): readonly AgendaRow[] {
  if (document === undefined) return rows
  const parents = buildNodeIndex(document)
  const grouped: AgendaRow[] = []
  let previousParent: NodeId | null | undefined
  for (const row of rows) {
    if (row.kind !== 'node') continue
    const parentId = parents.get(row.nodeId)
    if (parentId !== null && parentId !== undefined && parentId !== previousParent) {
      grouped.push({
        kind: 'path',
        key: `path:${row.day}:${row.nodeId}`,
        day: row.day,
        parentId,
        ...(row.groupKey === undefined ? {} : { groupKey: row.groupKey }),
      })
    }
    grouped.push(row)
    previousParent = parentId
  }
  return grouped
}

function includesOverdue(state: AgendaState): boolean {
  return state.presentation.kind === 'timeline' && state.weekStart === agendaWeekStart(state.today)
}

/** Index only occurrences that could replace a node's earliest overdue date when active. */
function indexLaterOverdueOccurrences(
  matches: readonly AgendaProjectionDay[],
  currentWeek: DayNumber,
): ReadonlyMap<DayNumber, ReadonlySet<NodeId>> {
  const later = new Map<DayNumber, Set<NodeId>>()
  const seen = new Set<NodeId>()
  for (const { day, rows } of matches) {
    if (day >= currentWeek) break
    for (const { nodeId } of rows) {
      if (seen.has(nodeId)) {
        let ids = later.get(day)
        if (ids === undefined) later.set(day, (ids = new Set()))
        ids.add(nodeId)
      } else seen.add(nodeId)
    }
  }
  return later
}

/** Keep one dated occurrence per overdue node; an active editor retains its date. */
function overdueProjection(
  projection: readonly AgendaProjectionDay[],
  state: AgendaState,
  document: Document,
): readonly AgendaProjectionDay[] {
  if (!includesOverdue(state)) return []
  const active = activeAgendaOccurrence(state)
  const activePresent =
    active !== undefined &&
    active.day < state.weekStart &&
    projection.some(
      (entry) =>
        entry.day === active.day && entry.rows.some((row) => row.role === 'match' && row.nodeId === active.nodeId),
    )
  const seen = new Set<NodeId>()
  const result: AgendaProjectionDay[] = []
  for (const entry of projection) {
    if (entry.day >= state.weekStart) break
    const rows = entry.rows.filter((row) => {
      if (row.role !== 'match' || seen.has(row.nodeId)) return false
      if (activePresent && row.nodeId === active.nodeId && entry.day !== active.day) return false
      if (locateNode(document, row.nodeId)?.node.struckThrough) return false
      seen.add(row.nodeId)
      return true
    })
    if (rows.length > 0) result.push({ day: entry.day, rows })
  }
  return result
}

export function buildAgendaRows(
  projection: readonly AgendaProjectionDay[],
  state: AgendaState,
  cache?: Map<DayNumber, DayRows>,
  document?: Document,
): readonly AgendaRow[] {
  const days = new Map(projection.map((day) => [day.day, day.rows]))
  const timelineDays =
    state.presentation.kind === 'timeline' ? agendaWeekDays(state.weekStart) : [state.presentation.day]
  const rows: AgendaRow[] = []
  if (document !== undefined && includesOverdue(state)) {
    const overdue: AgendaRow[] = []
    const key = overdueKey(state.weekStart)
    for (const entry of overdueProjection(projection, state, document)) {
      for (const row of entry.rows) {
        overdue.push({
          kind: 'node',
          key: `node:${entry.day}:${row.nodeId}`,
          day: entry.day,
          nodeId: row.nodeId,
          depth: 0,
          role: 'match',
          groupKey: key,
        })
      }
    }
    if (overdue.length > 0) {
      rows.push({ kind: 'day', key, day: state.weekStart - 1, content: true, isToday: false, overdue: true })
      if (!state.collapsed.has(key)) rows.push(...withParentPaths(overdue, document))
    }
  }
  for (const day of timelineDays) {
    const entry = { kind: 'day' as const, day, content: days.has(day), isToday: day === state.today }
    const key = dayKey(entry.day)
    if (rows.length > 0) rows.push({ kind: 'separator', key: `separator:${day}`, day })
    rows.push({ ...entry, key })
    if (state.collapsed.has(key)) continue
    const projected = days.get(entry.day) ?? []
    const cached = cache?.get(entry.day)
    if (cached?.projected === projected) {
      for (const row of cached.rows) rows.push(row)
      continue
    }
    const dayRows: AgendaRow[] = []
    for (let index = 0; index < projected.length; index++) {
      const node = projected[index]!
      if (node.role !== 'match') continue
      const nodeKey = `node:${entry.day}:${node.nodeId}`
      dayRows.push({
        kind: 'node',
        key: nodeKey,
        day: entry.day,
        nodeId: node.nodeId,
        depth: 0,
        role: 'match',
      })
    }
    const grouped = withParentPaths(dayRows, document)
    cache?.set(entry.day, { projected, rows: grouped })
    for (const row of grouped) rows.push(row)
  }
  if (cache !== undefined) {
    for (const day of cache.keys()) if (!days.has(day)) cache.delete(day)
  }
  return rows
}

function sameDay(left: AgendaProjectionDay, right: AgendaProjectionDay): boolean {
  if (left === right) return true
  return (
    left.day === right.day &&
    left.rows.length === right.rows.length &&
    left.rows.every((row, index) => {
      const other = right.rows[index]!
      return row.nodeId === other.nodeId && row.depth === other.depth && row.role === other.role
    })
  )
}

function sameFolds(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left === right || (left.size === right.size && [...left].every((key) => right.has(key)))
}

/** One bounded cache per store; rows contain identities, never retained document snapshots. */
export class AgendaRowsCache {
  private document: Document | undefined
  private scope: NodeId | null | undefined
  private projection: readonly AgendaProjectionDay[] = []
  private searchProjection: readonly AgendaProjectionDay[] = []
  private laterOverdue: ReadonlyMap<DayNumber, ReadonlySet<NodeId>> = new Map()
  private overdueOverride: AgendaOccurrence | undefined
  private weekProjection: readonly AgendaProjectionDay[] = []
  private state: AgendaState | undefined
  private rows: readonly AgendaRow[] = []
  private readonly dayRows = new Map<DayNumber, DayRows>()

  public getProjection(document: Document, state: AgendaState): readonly AgendaProjectionDay[] {
    this.get(document, state)
    return this.weekProjection
  }

  public get(document: Document, state: AgendaState): readonly AgendaRow[] {
    const documentChanged = document !== this.document
    // Marked nodes are listed under Today, so a projection belongs to the Today it was built for.
    const todayChanged = state.today !== this.state?.today
    let changed = false
    if (
      document !== this.document ||
      todayChanged ||
      state.scopeParentId !== this.scope ||
      // The document/scope guards run first; an equal cached document always has cached state.
      pinnedAgendaOccurrence(state) !== pinnedAgendaOccurrence(this.state)
    ) {
      const previous = new Map(this.projection.map((day) => [day.day, day]))
      const reusable =
        this.document !== undefined &&
        !todayChanged &&
        state.scopeParentId === this.scope &&
        pinnedAgendaOccurrence(state) === undefined &&
        pinnedAgendaOccurrence(this.state) === undefined
          ? { document: this.document, projection: this.projection }
          : undefined
      const projection = agendaProjection(document, state, reusable).map((day) => {
        const old = previous.get(day.day)
        return old !== undefined && sameDay(old, day) ? old : day
      })
      changed =
        projection.length !== this.projection.length || projection.some((day, index) => day !== this.projection[index])
      this.projection = projection
      if (changed) {
        const searchable = new Map(this.searchProjection.map((day) => [day.day, day]))
        this.searchProjection = projection.map((day) =>
          previous.get(day.day) === day
            ? searchable.get(day.day)!
            : { ...day, rows: day.rows.filter((row) => row.role === 'match') },
        )
      }
      this.document = document
      this.scope = state.scopeParentId
    }
    const overdueChanged = documentChanged && this.projection.some((day) => day.day < state.weekStart)
    if (changed || todayChanged)
      this.laterOverdue = indexLaterOverdueOccurrences(this.searchProjection, agendaWeekStart(state.today))
    const active = activeAgendaOccurrence(state)
    const overdueOverride =
      active !== undefined && includesOverdue(state) && this.laterOverdue.get(active.day)?.has(active.nodeId)
        ? active
        : undefined
    const overdueOverrideChanged =
      overdueOverride?.day !== this.overdueOverride?.day || overdueOverride?.nodeId !== this.overdueOverride?.nodeId
    const presentationChanged = focusedAgendaDay(this.state) !== focusedAgendaDay(state)
    if (
      changed ||
      overdueChanged ||
      overdueOverrideChanged ||
      presentationChanged ||
      this.state?.weekStart !== state.weekStart ||
      this.state?.today !== state.today
    ) {
      const projection = [
        ...overdueProjection(this.searchProjection, state, document),
        ...this.searchProjection.filter((day) => day.day >= state.weekStart && day.day < state.weekStart + 7),
      ]
      if (
        projection.length !== this.weekProjection.length ||
        projection.some((day, index) => !sameDay(day, this.weekProjection[index]!))
      )
        this.weekProjection = projection
    }
    if (
      changed ||
      overdueChanged ||
      overdueOverrideChanged ||
      this.state?.weekStart !== state.weekStart ||
      this.state?.today !== state.today ||
      focusedAgendaDay(this.state) !== focusedAgendaDay(state) ||
      !sameFolds(this.state.collapsed, state.collapsed)
    ) {
      const rows = buildAgendaRows(this.projection, state, this.dayRows, document)
      const same =
        rows.length === this.rows.length &&
        rows.every((row, index) => {
          const old = this.rows[index]!
          if (row.kind !== old.kind || row.key !== old.key) return false
          if (row.kind === 'day' && old.kind === 'day')
            return row.content === old.content && row.isToday === old.isToday && row.overdue === old.overdue
          if (row.kind === 'node' && old.kind === 'node') return row.groupKey === old.groupKey
          if (row.kind === 'path' && old.kind === 'path')
            return row.parentId === old.parentId && row.groupKey === old.groupKey
          return true
        })
      if (changed || !same) this.rows = rows
    }
    this.overdueOverride = overdueOverride
    this.state = state
    return this.rows
  }

  public clear(): void {
    // Empty-array literal mutants are overwritten on the next get; clearing the document and state
    // is the lifecycle guarantee. These resets also release projection/row storage immediately.
    this.document = undefined
    this.scope = undefined
    this.projection = []
    this.searchProjection = []
    this.laterOverdue = new Map()
    this.overdueOverride = undefined
    this.weekProjection = []
    this.state = undefined
    this.rows = []
    this.dayRows.clear()
  }

  /** Tree can reuse one warm projection, but must never retain a replaced document through it. */
  public releaseIfStale(document: Document): void {
    if (this.document !== undefined && this.document !== document) this.clear()
  }
}
