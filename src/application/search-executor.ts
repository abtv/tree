import type { Document } from '../domain/document'
import type { DayNumber } from '../domain/calendar-date'
import { sameOccurrence, searchScope, type SearchOccurrence, type SearchScope } from '../domain/search-scope'
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

export type SearchOperation =
  | { readonly kind: 'count' }
  | { readonly kind: 'navigate'; readonly origin: SearchPosition; readonly direction: -1 | 1; readonly count: number }

export interface SearchRequest extends SearchContext {
  readonly id: number
  readonly query: string
  readonly operation: SearchOperation
}

export type SearchResult =
  | { readonly kind: 'count'; readonly total: number; readonly capped: boolean }
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
    const handle = globalThis.setTimeout(callback, 0)
    return () => globalThis.clearTimeout(handle)
  },
}

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })

/** Only the selected destination needs segmentation; never build all text boundaries. */
export function searchCaret(text: string, offset: number): number {
  return segmenter.segment(text).containing(offset)?.index ?? text.length
}

function* executeSearch(request: SearchRequest): Generator<undefined, SearchResult> {
  const pattern = yield* prepareSearch(request.query)
  const operation = request.operation
  if (operation.kind === 'count' && pattern.characters.length === 0) return { kind: 'count', total: 0, capped: false }
  let total = 0
  let before = 0
  let through = 0
  const boundary = operation.kind === 'navigate' ? operation.origin.beforeDay : undefined
  let foundOrigin = boundary !== undefined && request.scope.kind === 'agenda'
  for (const occurrence of searchScope(request.document, request.scope)) {
    yield undefined
    if (occurrence === undefined) continue
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
  if (operation.kind === 'count') return { kind: 'count', total, capped: false }
  if (!foundOrigin || total === 0) {
    return { kind: 'navigate', total, wrapped: false, missingOrigin: !foundOrigin }
  }
  const count = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(operation.count) || 1))
  // Reduce before adding so huge valid prefixes cannot lose integer precision.
  const target =
    operation.direction === 1
      ? (through + ((count - 1) % total)) % total
      : (((before - (count % total)) % total) + total) % total
  const wrapped = operation.direction === 1 ? count > total - through : count > before
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
          destination: {
            nodeId: occurrence.nodeId,
            // Stryker disable next-line ConditionalExpression: an omitted day and day: undefined have identical search and serialized semantics.
            ...(occurrence.day === undefined ? {} : { day: occurrence.day }),
            ...match,
            caret: searchCaret(occurrence.text, match.start),
          },
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
