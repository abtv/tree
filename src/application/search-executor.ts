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

type Navigation = {
  readonly kind: 'navigate'
  readonly origin: SearchPosition
  readonly direction: -1 | 1
  readonly count: number
  readonly exact?: ExactMatches
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
}

export const searchScheduler: SearchScheduler = {
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
  for (const occurrence of searchScope(request.document, request.scope)) {
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
    }
  }
  if (operation.kind === 'count') return { kind: 'count', total, capped: false, ...(exact && { exact }) }
  if (!foundOrigin || total === 0) {
    return { kind: 'navigate', total, wrapped: false, missingOrigin: !foundOrigin }
  }
  const { index: target, wrapped } = targetOrdinal(operation, total, before, through)
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
          ordinal,
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
  return {
    execute(request, publish) {
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
