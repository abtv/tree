import type { Document, TreeNode } from '../domain/document'
import { prepareNodeSearch, searchNodeTerm, type NodeSearchTerm } from '../domain/node-search-query'
import { label, resultText, type RecentNode } from './recent-nodes'
import { searchScheduler, type SearchScheduler } from './search-executor'
import type { TextMatch } from '../domain/text-search'

function* pathTagMatches(
  ancestors: readonly TreeNode[],
  term: NodeSearchTerm,
): Generator<undefined, readonly TextMatch[]> {
  const matches: TextMatch[] = []
  let offset = 0
  for (const ancestor of ancestors) {
    const text = ancestor.text.slice(0, 160)
    for (const match of searchNodeTerm(ancestor, term)) {
      yield undefined
      if (match === undefined || match.end > text.length) continue
      const start = text.slice(0, match.start).replace(/\s+/g, ' ').trimStart().length
      matches.push({ start: offset + start, end: offset + start + match.end - match.start })
    }
    offset += label(ancestor).length + 3
  }
  return matches
}

export function* searchNodes(document: Document, query: string): Generator<undefined, readonly RecentNode[]> {
  const terms = yield* prepareNodeSearch(query)
  if (terms.length === 0) return []
  const singleTag = terms.length === 1 && terms[0]!.prefix !== undefined ? terms[0] : undefined
  const counts = terms.map(() => 0)
  let covered = 0
  const results: RecentNode[] = []
  const ancestors: TreeNode[] = []
  const stack = [{ nodes: document.roots, index: 0, inherited: [] as number[] }]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!
    const node = frame.nodes[frame.index++]
    if (node === undefined) {
      stack.pop()
      ancestors.pop()
      for (const index of frame.inherited) {
        if (--counts[index]! === 0) covered--
        yield undefined
      }
      continue
    }
    yield undefined
    const own: number[] = []
    for (let index = 0; index < terms.length; index++) {
      yield undefined
      for (const match of searchNodeTerm(node, terms[index]!)) {
        yield undefined
        if (match !== undefined) {
          own.push(index)
          if (counts[index]!++ === 0) covered++
          break
        }
      }
    }
    if (own.length > 0 && covered === terms.length) {
      const tagMatches: TextMatch[] = []
      if (singleTag !== undefined) {
        for (const match of searchNodeTerm(node, singleTag)) {
          yield undefined
          if (match !== undefined) tagMatches.push(match)
        }
      }
      results.push({
        id: node.id,
        text: resultText(node),
        path: ancestors.length ? ancestors.map(label).join(' › ') : null,
        ...(singleTag === undefined
          ? {}
          : {
              tagMatches,
              pathTagMatches: yield* pathTagMatches(ancestors, singleTag),
            }),
      })
    }
    if (node.children.length > 0) {
      ancestors.push(node)
      stack.push({ nodes: node.children, index: 0, inherited: own })
    } else {
      for (const index of own) {
        if (--counts[index]! === 0) covered--
        yield undefined
      }
    }
  }
  return results
}

/** Release obsolete snapshots immediately and yield between bounded batches of search work. */
export function runNodeSearch(
  document: Document,
  query: string,
  publish: (results: readonly RecentNode[]) => void,
  scheduler: SearchScheduler = searchScheduler,
): () => void {
  let work: ReturnType<typeof searchNodes> | undefined = searchNodes(document, query)
  let cancel: (() => void) | undefined
  const run = (): void => {
    for (let step = 0; step < 8192 && work !== undefined; step++) {
      const result = work.next()
      if (result.done) {
        work = undefined
        publish(result.value)
        return
      }
    }
    if (work !== undefined) cancel = scheduler.schedule(run)
  }
  cancel = scheduler.schedule(run)
  return () => {
    cancel?.()
    work = undefined
  }
}
