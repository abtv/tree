import type { Document, TreeNode } from '../domain/document'
import { mergeSearchMatches, prepareNodeSearch, searchNodeTerm, type NodeSearchTerm } from '../domain/node-search-query'
import {
  completionPath,
  label,
  nodePresentation,
  resultText,
  type NodeResult,
  type SearchImageExcerpt,
} from './node-result'
import { searchScheduler, type SearchScheduler } from './search-executor'
import { searchText, type SearchWork, type TextMatch } from '../domain/text-search'

interface ImageEvidence {
  readonly node: TreeNode
  readonly text: string
  readonly range: TextMatch
  excerpt?: Pick<SearchImageExcerpt, 'text' | 'matches'>
}

interface SearchFrame {
  readonly nodes: readonly TreeNode[]
  index: number
  readonly inherited: readonly number[]
  readonly inheritedImages?: readonly number[]
}

type ParentPresentation = Pick<NodeResult, 'path' | 'parentId' | 'pathTagMatches' | 'pathStruckMatches'>

function* firstMatch(work: SearchWork<TextMatch>): Generator<undefined, TextMatch | undefined> {
  for (const match of work) {
    if (match !== undefined) return match
    yield undefined
  }
}

function characterBoundary(text: string, offset: number): number {
  const low = text.charCodeAt(offset)
  const high = text.charCodeAt(offset - 1)
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? offset - 1 : offset
}

function* imageExcerpt(
  image: ImageEvidence,
  node: TreeNode,
  terms: readonly NodeSearchTerm[],
): Generator<undefined, SearchImageExcerpt> {
  const { text, range } = image
  if (image.excerpt === undefined) {
    const start = characterBoundary(text, Math.max(0, range.start - 24))
    const end = characterBoundary(text, Math.min(text.length, start + 96))
    const excerpt = text.slice(start, end)
    const leading = start > 0 ? '…' : ''
    let matches: TextMatch[] = [
      { start: range.start - start + leading.length, end: Math.min(range.end, end) - start + leading.length },
    ]
    for (const term of terms) {
      yield undefined
      if (term.prefix !== undefined) continue
      const found: TextMatch[] = []
      for (const match of searchText(excerpt, term.pattern)) {
        yield undefined
        if (match !== undefined) {
          found.push({ start: match.start + leading.length, end: match.end + leading.length })
        }
      }
      if (found.length > 0) matches = yield* mergeSearchMatches(matches, found)
    }
    image.excerpt = {
      text: `${leading}${excerpt}${end < text.length ? '…' : ''}`,
      matches,
    }
  }
  return {
    ...image.excerpt,
    ...(image.node !== node ? { ancestor: label(image.node) } : node.text === '' ? { replacesTitle: true } : {}),
  }
}

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

function* parentPresentation(
  ancestors: readonly TreeNode[],
  terms: readonly NodeSearchTerm[],
): Generator<undefined, ParentPresentation> {
  let markers: TextMatch[] = []
  for (const term of terms) {
    markers = yield* mergeSearchMatches(markers, yield* pathTagMatches(ancestors, term))
  }
  return {
    path: ancestors.length === 0 ? null : ancestors.map(label).join(' › '),
    ...completionPath(ancestors),
    ...(terms.length === 0 ? {} : { pathTagMatches: markers }),
  }
}

export function* searchNodes(document: Document, query: string): Generator<undefined, readonly NodeResult[]> {
  const terms = yield* prepareNodeSearch(query)
  if (terms.length === 0) return []
  const tagTerms = terms.filter((term) => term.prefix !== undefined)
  const counts = terms.map(() => 0)
  const imageMatches = new Map<number, ImageEvidence[]>()
  let covered = 0
  const markedStarredResults: NodeResult[] = []
  const markedResults: NodeResult[] = []
  const starredResults: NodeResult[] = []
  const results: NodeResult[] = []
  const ancestors: TreeNode[] = []
  const stack: SearchFrame[] = [{ nodes: document.roots, index: 0, inherited: [] }]
  let parent: { frame: SearchFrame; presentation: ParentPresentation } | undefined
  function* removeImageMatches(indices: readonly number[]): Generator<undefined> {
    for (const index of indices) {
      yield undefined
      const matches = imageMatches.get(index)!
      matches.pop()
      if (matches.length === 0) imageMatches.delete(index)
    }
  }
  while (stack.length > 0) {
    const frame = stack[stack.length - 1]!
    const node = frame.nodes[frame.index++]
    if (node === undefined) {
      stack.pop()
      ancestors.pop()
      if (frame.inheritedImages !== undefined) yield* removeImageMatches(frame.inheritedImages)
      for (const index of frame.inherited) {
        if (--counts[index]! === 0) covered--
        yield undefined
      }
      continue
    }
    yield undefined
    const own: number[] = []
    let ownImages: number[] | undefined
    let ownImage: ImageEvidence | undefined
    const recognizedText = node.attachment?.searchText
    for (let index = 0; index < terms.length; index++) {
      yield undefined
      const term = terms[index]!
      const visibleMatches =
        term.prefix === undefined ? searchText(node.text, term.pattern) : searchNodeTerm(node, term)
      let visible = false
      for (const match of visibleMatches) {
        yield undefined
        if (match === undefined) continue
        visible = true
        break
      }
      if (!visible) {
        if (term.prefix !== undefined || !recognizedText) continue
        const range = yield* firstMatch(searchText(recognizedText, term.pattern))
        if (range === undefined) continue
        const evidence = { node, text: recognizedText, range }
        const inherited = imageMatches.get(index)
        if (inherited === undefined) imageMatches.set(index, [evidence])
        else inherited.push(evidence)
        ownImages ??= []
        ownImages.push(index)
        ownImage ??= evidence
      }
      own.push(index)
      if (counts[index]!++ === 0) covered++
    }
    if (own.length > 0 && covered === terms.length) {
      let image = ownImage
      if (image === undefined) {
        for (const [index, evidence] of imageMatches) {
          yield undefined
          if (counts[index] !== evidence.length) continue
          image = evidence.at(-1)
          break
        }
      }
      let tagMatches: TextMatch[] = []
      for (const term of tagTerms) {
        const matches: TextMatch[] = []
        for (const match of searchNodeTerm(node, term)) {
          yield undefined
          if (match !== undefined) matches.push(match)
        }
        tagMatches = yield* mergeSearchMatches(tagMatches, matches)
      }
      // Consecutive hits under the same parent share the path and its highlight ranges.
      // Keep one projection, without retaining paths for unrelated branches or other queries.
      if (parent?.frame !== frame) parent = { frame, presentation: yield* parentPresentation(ancestors, tagTerms) }
      const matches = node.marked
        ? node.starred
          ? markedStarredResults
          : markedResults
        : node.starred
          ? starredResults
          : results
      const excerpt = image === undefined ? undefined : yield* imageExcerpt(image, node, terms)
      matches.push({
        id: node.id,
        text: resultText(node),
        ...parent.presentation,
        ...nodePresentation(node),
        ...(excerpt === undefined ? {} : { imageExcerpt: excerpt }),
        ...(tagTerms.length === 0 ? {} : { tagMatches }),
      })
    }
    if (node.children.length > 0) {
      ancestors.push(node)
      stack.push({
        nodes: node.children,
        index: 0,
        inherited: own,
        ...(ownImages === undefined ? {} : { inheritedImages: ownImages }),
      })
    } else {
      if (ownImages !== undefined) yield* removeImageMatches(ownImages)
      for (const index of own) {
        if (--counts[index]! === 0) covered--
        yield undefined
      }
    }
  }
  return markedStarredResults.length === 0 && markedResults.length === 0 && starredResults.length === 0
    ? results
    : markedStarredResults.concat(markedResults, starredResults, results)
}

/** Release obsolete snapshots immediately and yield between bounded batches of search work. */
export function runNodeSearch(
  document: Document,
  query: string,
  publish: (results: readonly NodeResult[]) => void,
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
