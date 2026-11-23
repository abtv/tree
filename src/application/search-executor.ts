import type { Document } from '../domain/document'
import type { DayNumber } from '../domain/calendar-date'
import {
  sameOccurrence,
  searchScope,
  type SearchOccurrence,
  type SearchScope,
  type SearchText,
} from '../domain/search-scope'
import { prepareSearch, searchText, type TextMatch } from '../domain/text-search'

export interface SearchContext {
  readonly document: Document
  readonly revision: number
  readonly scopeKey: string
  readonly scope: SearchScope
}

export type SearchPosition =
  | (SearchOccurrence & { readonly offset: number; readonly beforeDay?: never })
  | { readonly beforeDay: DayNumber; readonly offset: number; readonly nodeId?: never; readonly day?: never }

export interface SearchDestination extends SearchOccurrence, TextMatch {
  readonly caret: number
}

interface RankedMatch extends TextMatch {
  occurrence: SearchText
  row: number
}

interface ExactMatches {
  matches: RankedMatch[]
  reference?: { occurrence: SearchOccurrence; row: number }
}

type LocatedMatch = TextMatch & { occurrence: SearchText }

export interface SearchNeighborhood {
  block?: { first: number; total: number; matches: LocatedMatch[] }
  previous?: NonNullable<SearchNeighborhood['block']>
  // null means the current query exceeded the retention limit on its first scan.
  complete?: LocatedMatch[] | null
}

const blockSize = 64
const retainedMatchLimit = 8192

type Navigation = {
  readonly kind: 'navigate'
  readonly origin: SearchPosition
  readonly direction: -1 | 1
  readonly count: number
  readonly exact?: ExactMatches
  readonly neighborhood?: SearchNeighborhood
}

export type SearchOperation = { readonly kind: 'count'; readonly collect?: { origin?: SearchPosition } } | Navigation

export interface SearchRequest extends SearchContext {
  readonly id: number
  readonly query: string
  readonly operation: SearchOperation
}

export type SearchResult =
  | { readonly kind: 'count'; readonly total: number; readonly capped: boolean; readonly exact?: ExactMatches }
  | {
      readonly kind: 'navigate'
      readonly destination?: SearchDestination
      readonly ordinal?: number
      readonly total: number
      readonly wrapped: boolean
      readonly missingOrigin: boolean
    }

export interface SearchExecutor {
  execute(request: SearchRequest, publish: (result: SearchResult) => void): () => void
}

export interface SearchScheduler {
  schedule(callback: () => void): () => void
  scheduleCached?(callback: () => void): () => void
}

export const searchScheduler: SearchScheduler = {
  scheduleCached(callback) {
    let canceled = false
    queueMicrotask(() => {
      if (!canceled) callback()
    })
    return () => {
      canceled = true
    }
  },
  schedule(callback) {
    if (typeof globalThis.scheduler?.postTask === 'function') {
      const controller = new AbortController()
      void globalThis.scheduler
        .postTask(callback, { priority: 'user-visible', signal: controller.signal })
        .catch((error: unknown) => {
          if (!controller.signal.aborted || error !== controller.signal.reason) {
            queueMicrotask(() => {
              throw error
            })
          }
        })
      return () => controller.abort()
    }

    const handle = globalThis.setTimeout(callback, 0)
    return () => globalThis.clearTimeout(handle)
  },
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

/** Only the selected destination needs segmentation; never build all text boundaries. */
export function searchCaret(text: string, offset: number): number {
  return segmenter.segment(text).containing(offset)?.index ?? text.length
}

function targetOrdinal(operation: Navigation, total: number, before: number, through: number) {
  const count = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(operation.count) || 1))
  // Reduce before adding so huge valid prefixes cannot lose integer precision.
  const index =
    operation.direction === 1
      ? (through + ((count - 1) % total)) % total
      : (((before - (count % total)) % total) + total) % total
  const wrapped = operation.direction === 1 ? count > total - through : count > before
  return { index, wrapped }
}

function destination(occurrence: SearchText, match: TextMatch): SearchDestination {
  return {
    nodeId: occurrence.nodeId,
    ...(occurrence.day === undefined ? {} : { day: occurrence.day }),
    start: match.start,
    end: match.end,
    caret: searchCaret(occurrence.text, match.start),
  }
}

function* originRow(
  request: SearchRequest,
  exact: ExactMatches,
  origin: SearchOccurrence,
): Generator<undefined, number> {
  if (exact.reference && sameOccurrence(exact.reference.occurrence, origin)) return exact.reference.row
  const hit = exact.matches.find((match) => sameOccurrence(match.occurrence, origin))
  if (hit) return hit.row

  // A manual move can start a repeat on a previously unrecorded row.
  // Walk occurrence identities up to that row without matching any text again.
  let row = 0
  for (const occurrence of searchScope(request.document, request.scope)) {
    yield undefined
    if (occurrence === undefined) continue
    if (sameOccurrence(occurrence, origin)) return row
    row++
  }
  return -1
}

function* navigateExact(
  request: SearchRequest,
  operation: Navigation,
  exact: ExactMatches,
): Generator<undefined, SearchResult> {
  const { origin } = operation
  const row = origin.nodeId === undefined ? undefined : yield* originRow(request, exact, origin)
  const total = exact.matches.length
  const missingOrigin = row === -1 || (row === undefined && request.scope.kind !== 'agenda')
  if (missingOrigin || !total) return { kind: 'navigate', total, wrapped: false, missingOrigin }

  let before = 0
  let through = 0
  for (const match of exact.matches) {
    const earlier = row === undefined ? match.occurrence.day! < origin.beforeDay! : match.row < row
    if (earlier || (match.row === row && match.start < origin.offset)) before++
    if (earlier || (match.row === row && match.start <= origin.offset)) through++
  }
  const { index, wrapped } = targetOrdinal(operation, total, before, through)
  const match = exact.matches[index]!
  return {
    kind: 'navigate',
    destination: destination(match.occurrence, match),
    total,
    ordinal: index + 1,
    wrapped,
    missingOrigin: false,
  }
}

function selectBlock(
  neighborhood: SearchNeighborhood,
  matches: LocatedMatch[],
  first: number,
  index: number,
  total: number,
  wrapped: boolean,
): SearchResult {
  if (neighborhood.block) neighborhood.previous = neighborhood.block
  neighborhood.block = { first, matches, total }
  const hit = matches[index - first]!
  return {
    kind: 'navigate',
    destination: destination(hit.occurrence, hit),
    ordinal: index + 1,
    total,
    wrapped,
    missingOrigin: false,
  }
}

function selectComplete(neighborhood: SearchNeighborhood, matches: LocatedMatch[], index: number, wrapped: boolean) {
  const first = Math.max(0, index - blockSize / 2)
  return selectBlock(neighborhood, matches.slice(first, first + blockSize), first, index, matches.length, wrapped)
}

function cachedNavigation(operation: SearchOperation): (() => SearchResult) | undefined {
  if (operation.kind === 'navigate' && operation.neighborhood && operation.origin.nodeId !== undefined) {
    const neighborhood = operation.neighborhood
    const blocks = [neighborhood.block, neighborhood.previous]
    for (const block of blocks) {
      if (!block) continue
      const origin = operation.origin
      const local = block.matches.findIndex((m) => sameOccurrence(m.occurrence, origin) && m.start === origin.offset)
      if (local >= 0) {
        const before = block.first + local
        const { index, wrapped } = targetOrdinal(operation, block.total, before, before + 1)
        const hit = blocks.map((part) => part?.matches[index - part.first]).find(Boolean)
        if (hit)
          return () => ({
            kind: 'navigate',
            destination: destination(hit.occurrence, hit),
            ordinal: index + 1,
            total: block.total,
            wrapped,
            missingOrigin: false,
          })
        const complete = neighborhood.complete
        if (complete) return () => selectComplete(neighborhood, complete, index, wrapped)
      }
    }
  }
  return undefined
}

function* executeSearch(request: SearchRequest): Generator<undefined, SearchResult> {
  const operation = request.operation
  if (operation.kind === 'navigate' && operation.exact) return yield* navigateExact(request, operation, operation.exact)
  const pattern = yield* prepareSearch(request.query)
  if (operation.kind === 'count' && pattern.characters.length === 0) return { kind: 'count', total: 0, capped: false }
  const collect = operation.kind === 'count' ? operation.collect : undefined
  const exact: ExactMatches | undefined = collect && { matches: [] }
  const reference = collect?.origin
  let row = -1
  let total = 0
  let before = 0
  let through = 0
  const boundary = operation.kind === 'navigate' ? operation.origin.beforeDay : undefined
  let foundOrigin = boundary !== undefined && request.scope.kind === 'agenda'
  const nearby: LocatedMatch[] = []
  let collected = 0
  const neighborhood = operation.kind === 'navigate' ? operation.neighborhood : undefined
  const knownTotal = neighborhood?.complete?.length ?? neighborhood?.block?.total
  let complete: LocatedMatch[] | undefined =
    neighborhood && neighborhood.complete === undefined && request.scope.kind === 'tree' && knownTotal === undefined
      ? []
      : undefined
  scan: for (const occurrence of searchScope(request.document, request.scope)) {
    yield undefined
    if (occurrence === undefined) continue
    row++
    if (exact && reference?.nodeId !== undefined && sameOccurrence(occurrence, reference)) {
      exact.reference = { occurrence: reference, row }
    }
    const atOrigin =
      operation.kind === 'navigate' &&
      // Stryker disable next-line ConditionalExpression: real occurrences always have an ID, so sameOccurrence also rejects synthetic origins.
      operation.origin.nodeId !== undefined &&
      sameOccurrence(occurrence, operation.origin)
    if (atOrigin) foundOrigin = true
    for (const match of searchText(occurrence.text, pattern)) {
      yield undefined
      if (match === undefined) continue
      total++
      if (complete) {
        if (total <= retainedMatchLimit) complete.push({ occurrence, ...match })
        else {
          complete = undefined
          neighborhood!.complete = null
        }
      }
      if (operation.kind === 'count') {
        if (total === 101) return { kind: 'count', total: 100, capped: true }
        exact?.matches.push({ occurrence, row, ...match })
      } else if (boundary !== undefined) {
        // Stryker disable next-line ConditionalExpression: the undefined-day check is defensive; undefined < boundary is already false.
        if (occurrence.day !== undefined && occurrence.day < boundary) {
          before++
          through++
        }
      } else if (!foundOrigin) {
        before++
        through++
      } else if (atOrigin) {
        if (match.start < operation.origin.offset) before++
        if (match.start <= operation.origin.offset) through++
      }
      if (operation.kind === 'navigate' && operation.neighborhood && total <= through + blockSize / 2) {
        nearby[collected++ % blockSize] = { occurrence, ...match }
        // An earlier navigation counted this immutable scope. Once past the
        // origin and its neighbors, the remaining matches cannot change rank.
        if (knownTotal !== undefined && boundary === undefined && foundOrigin && total === through + blockSize / 2) {
          total = knownTotal
          break scan
        }
      }
    }
  }
  if (operation.kind === 'count') return { kind: 'count', total, capped: false, ...(exact && { exact }) }
  if (neighborhood && complete) neighborhood.complete = complete
  if (!foundOrigin || total === 0) {
    return { kind: 'navigate', total, wrapped: false, missingOrigin: !foundOrigin }
  }
  const { index: target, wrapped } = targetOrdinal(operation, total, before, through)
  if (neighborhood?.complete) return selectComplete(neighborhood, neighborhood.complete, target, wrapped)
  const first = collected - nearby.length
  if (operation.neighborhood && target >= first && target < collected) {
    const matches = Array.from({ length: nearby.length }, (_, i) => nearby[(first + i) % blockSize]!)
    return selectBlock(operation.neighborhood, matches, first, target, total, wrapped)
  }
  let ordinal = 0
  for (const occurrence of searchScope(request.document, request.scope)) {
    yield undefined
    if (occurrence === undefined) continue
    for (const match of searchText(occurrence.text, pattern)) {
      yield undefined
      if (match === undefined) continue
      if (ordinal++ === target) {
        return {
          kind: 'navigate',
          destination: destination(occurrence, match),
          ordinal: target + 1,
          total,
          wrapped,
          missingOrigin: false,
        }
      }
    }
  }
  // Stryker disable next-line StringLiteral,CallExpression: defensive diagnostic after two immutable traversals; valid requests cannot reach it.
  throw new Error('An immutable search scope changed during execution.')
}

/** Each scheduled slice has bounded JS work, including scope enumeration and query preparation. */
export function createSearchExecutor(
  scheduler: SearchScheduler = searchScheduler,
  workPerSlice = 8192,
): SearchExecutor {
  if (!Number.isSafeInteger(workPerSlice) || workPerSlice < 1) throw new Error('Invalid search slice budget.')
  let publishing = false
  return {
    execute(request, publish) {
      const cached = cachedNavigation(request.operation)
      if (cached) {
        // A held key can queue jumps behind a scan. Yield between queued results
        // so input and paint can interrupt the backlog.
        const deliver = () => {
          publishing = true
          try {
            publish(cached())
          } finally {
            publishing = false
          }
        }
        return !publishing && scheduler.scheduleCached ? scheduler.scheduleCached(deliver) : scheduler.schedule(deliver)
      }
      let work: ReturnType<typeof executeSearch> | undefined = executeSearch(request)
      let cancelScheduled: (() => void) | undefined
      const run = (): void => {
        // Stryker disable next-line EqualityOperator: one additional checkpoint remains bounded and does not change results; real latency has separate guards.
        for (let step = 0; step < workPerSlice && work !== undefined; step++) {
          const result = work.next()
          if (result.done) {
            work = undefined
            cancelScheduled = undefined
            publish(result.value)
            return
          }
        }
        if (work !== undefined) cancelScheduled = scheduler.schedule(run)
      }
      cancelScheduled = scheduler.schedule(run)
      return () => {
        cancelScheduled?.()
        cancelScheduled = undefined
        work = undefined // Release the generator and its captured document immediately.
      }
    },
  }
}
