import type { DateTextRange } from './date-recognition'
import type { Document, TreeNode } from './document-types'
import { compareCompletionRank, CompletionRankWorkspace, rankCompletionName } from './completion-ranking'
import { findTags, nodeTags, tagFragment, type TagRange } from './tags'

export interface TagMatch extends TagRange {
  readonly suggestions: readonly string[]
}

/** One current-document index. Unchanged immutable subtrees need no rescanning. */
export class TagCatalog {
  private document: Document | undefined
  private readonly counts = new Map<string, number>()
  private readonly nodes = new Map<string, TreeNode>()
  private names: readonly string[] = []
  private readonly rankWorkspace = new CompletionRankWorkspace()
  private readonly characters = new Map<string, Set<string>>()
  private readonly sortedCharacters = new WeakMap<Set<string>, readonly string[]>()

  public has(name: string): boolean {
    return this.counts.has(name)
  }

  public searchSuggestions(query: string): readonly string[] {
    if (tagFragment(query, query.length)?.start !== 0) return []
    return this.suggest('', query, query.length)?.suggestions ?? []
  }

  public update(document: Document): void {
    if (this.document === document) return
    let membershipChanged = false
    const deltas = new Map<string, number>()
    const removed = new Set<string>()
    const added = new Map<string, TreeNode>()
    const change = (node: TreeNode, delta: -1 | 1): void => {
      if (delta === 1) added.set(node.id, node)
      else removed.add(node.id)
      for (const { name } of nodeTags(node)) deltas.set(name, (deltas.get(name) ?? 0) + delta)
    }
    const visit = (before: TreeNode | undefined, after: TreeNode | undefined): void => {
      if (before === after) return
      if (before !== undefined) change(before, -1)
      if (after !== undefined) change(after, 1)
      diff(before?.children ?? [], after?.children ?? [])
    }
    const diff = (before: readonly TreeNode[], after: readonly TreeNode[]): void => {
      if (before === after) return
      if (before.length === after.length && before.every((node, index) => node.id === after[index]!.id)) {
        for (let index = 0; index < before.length; index++) visit(before[index], after[index])
        return
      }
      const remaining = new Map(before.map((node) => [node.id, node]))
      for (const node of after) {
        visit(remaining.get(node.id), node)
        remaining.delete(node.id)
      }
      for (const node of remaining.values()) visit(node, undefined)
    }
    diff(this.document?.roots ?? [], document.roots)
    for (const id of removed) this.nodes.delete(id)
    for (const [id, node] of added) this.nodes.set(id, node)
    for (const [name, delta] of deltas) {
      if (delta === 0) continue
      const previous = this.counts.get(name) ?? 0
      const next = previous + delta
      if (next === 0) this.counts.delete(name)
      else this.counts.set(name, next)
      if (previous === 0 || next === 0) membershipChanged = true
      if (previous === 0 || next === 0) {
        for (const character of new Set(name)) {
          let bucket = this.characters.get(character)
          if (bucket === undefined) {
            bucket = new Set()
            this.characters.set(character, bucket)
          }
          if (next === 0) bucket.delete(name)
          else bucket.add(name)
          this.sortedCharacters.delete(bucket)
          if (bucket.size === 0) this.characters.delete(character)
        }
      }
    }
    this.document = document
    if (membershipChanged) this.names = [...this.counts.keys()].sort()
  }

  /** Preview the native edit before the store commits it; omit only its active tag occurrence. */
  public suggest(
    nodeId: string,
    text: string,
    caret: number,
    excluded: readonly DateTextRange[] = [],
  ): TagMatch | undefined {
    const fragment = tagFragment(text, caret)
    if (fragment === undefined || excluded.some((range) => range.start < fragment.end && range.end > fragment.start))
      return undefined
    const deltas = new Map<string, number>()
    const old = this.nodes.get(nodeId)
    for (const { name } of old === undefined ? [] : nodeTags(old)) deltas.set(name, (deltas.get(name) ?? 0) - 1)
    for (const tag of findTags(text, excluded)) {
      if (tag.start !== fragment.start) deltas.set(tag.name, (deltas.get(tag.name) ?? 0) + 1)
    }
    let names = this.names
    let smallest: Set<string> | undefined
    for (const character of new Set(fragment.name)) {
      const bucket = this.characters.get(character)
      if (bucket === undefined) {
        names = []
        smallest = undefined
        break
      }
      if (smallest === undefined || bucket.size < smallest.size) smallest = bucket
    }
    if (smallest !== undefined) {
      let sorted = this.sortedCharacters.get(smallest)
      if (sorted === undefined) {
        sorted = [...smallest].sort()
        this.sortedCharacters.set(smallest, sorted)
      }
      names = sorted
    }
    const extra = [...deltas].filter(([name, delta]) => delta > 0 && !this.counts.has(name)).map(([name]) => name)
    if (extra.length > 0) names = [...names, ...extra].sort()
    const groups: string[][] = [[], [], [], []]
    const fuzzy: { name: string; rank: readonly number[] }[] = []
    for (const name of names) {
      if ((this.counts.get(name) ?? 0) + (deltas.get(name) ?? 0) <= 0) continue
      const rank = rankCompletionName(name, fragment.name, '_-', this.rankWorkspace)
      if (rank === undefined) continue
      if (rank[0]! < 4) groups[rank[0]!]!.push(name)
      else fuzzy.push({ name, rank })
    }
    // Input names are already lexical; only subsequences need alignment-based sorting.
    fuzzy.sort((a, b) => compareCompletionRank(a.rank, b.rank))
    const suggestions = groups[0]!.concat(
      groups[1]!,
      groups[2]!,
      groups[3]!,
      fuzzy.map(({ name }) => name),
    )
    return suggestions.length === 0 ? undefined : { ...fragment, suggestions }
  }
}
