import type { Document, TreeNode } from '../domain/document'
import { nodeTags } from '../domain/tags'
import { prepareSearch, searchText } from '../domain/text-search'
import { label, resultText, type RecentNode } from './recent-nodes'
import { searchScheduler, type SearchScheduler } from './search-executor'
import type { TextMatch } from '../domain/text-search'

function pathTagMatches(ancestors: readonly TreeNode[], tag: string): readonly TextMatch[] {
  const matches: TextMatch[] = []
  let offset = 0
  for (const ancestor of ancestors) {
    const text = ancestor.text.slice(0, 160)
    for (const match of nodeTags(ancestor)) {
      if (match.name !== tag || match.end > text.length) continue
      const start = text.slice(0, match.start).replace(/\s+/g, ' ').trimStart().length
      matches.push({ start: offset + start, end: offset + start + tag.length + 1 })
    }
    offset += label(ancestor).length + 3
  }
  return matches
}

export function* searchNodes(document: Document, query: string): Generator<undefined, readonly RecentNode[]> {
  const tag = query.startsWith('#') ? query.slice(1) : undefined
  const pattern = tag === undefined ? yield* prepareSearch(query) : undefined
  const results: RecentNode[] = []
  const ancestors: TreeNode[] = []
  const stack = [{ nodes: document.roots, index: 0 }]
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!
    const node = frame.nodes[frame.index++]
    if (node === undefined) {
      stack.pop()
      ancestors.pop()
      continue
    }
    yield undefined
    let matches = false
    if (tag !== undefined) matches = nodeTags(node).some(({ name }) => name === tag)
    else if (pattern !== undefined) {
      for (const match of searchText(node.text, pattern)) {
        yield undefined
        if (match !== undefined) {
          matches = true
          break
        }
      }
    }
    if (matches)
      results.push({
        id: node.id,
        text: resultText(node),
        path: ancestors.length ? ancestors.map(label).join(' › ') : null,
        ...(tag === undefined
          ? {}
          : {
              tagMatches: nodeTags(node).filter((match) => match.name === tag),
              pathTagMatches: pathTagMatches(ancestors, tag),
            }),
      })
    if (node.children.length > 0) {
      ancestors.push(node)
      stack.push({ nodes: node.children, index: 0 })
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
