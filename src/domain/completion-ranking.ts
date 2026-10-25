export function compareCompletionRank(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < left.length; index++) {
    const difference = left[index]! - right[index]!
    if (difference !== 0) return difference
  }
  return 0
}

/** Exact, prefix, word prefix, substring, then the best ordered subsequence alignment. */
export class CompletionRankWorkspace {
  public words = new Int32Array(0)
  public starts = new Int32Array(0)
  public nextWords = new Int32Array(0)
  public nextStarts = new Int32Array(0)

  public fit(length: number): void {
    if (this.words.length >= length) return
    this.words = new Int32Array(length)
    this.starts = new Int32Array(length)
    this.nextWords = new Int32Array(length)
    this.nextStarts = new Int32Array(length)
  }
}

export function rankCompletionName(
  name: string,
  query: string,
  separators = '_',
  workspace = new CompletionRankWorkspace(),
): readonly number[] | undefined {
  const isWordStart = (index: number): boolean => index === 0 || separators.includes(name[index - 1]!)
  if (name === query) return [0]
  if (name.startsWith(query)) return [1]
  let occurrence = name.indexOf(query)
  if (occurrence !== -1) {
    while (occurrence !== -1) {
      if (isWordStart(occurrence)) return [2]
      occurrence = name.indexOf(query, occurrence + 1)
    }
    return [3]
  }

  let cursor = -1
  let greedyStart = -1
  let greedyWords = 0
  let ambiguous = false
  let letterIndex = 0
  let finalWidth = 1
  for (const character of query) {
    cursor = name.indexOf(character, cursor + 1)
    if (cursor === -1) return undefined
    if (greedyStart === -1) greedyStart = cursor
    greedyWords += Number(isWordStart(cursor))
    let alternative = name.indexOf(character, cursor + character.length)
    if (letterIndex < query.length - character.length) ambiguous ||= alternative !== -1
    else if (!isWordStart(cursor)) {
      while (alternative !== -1) {
        if (isWordStart(alternative)) ambiguous = true
        alternative = name.indexOf(character, alternative + character.length)
      }
    }
    letterIndex += character.length
    finalWidth = character.length
  }
  // Unique predecessors and no better final word boundary leave only the greedy optimum.
  if (!ambiguous) return [4, -greedyWords, cursor + finalWidth - 1 - greedyStart, greedyStart, name.length]

  // Reuse numeric workspaces across catalog entries instead of allocating an alignment per letter.
  workspace.fit(name.length)
  let { words, starts, nextWords, nextStarts } = workspace
  words.fill(-1, 0, name.length)
  let first = true
  for (const character of query) {
    nextWords.fill(-1, 0, name.length)
    let bestWords = -1
    let bestStart = -1
    for (let index = 0; index < name.length; index++) {
      const predecessor = index === 0 ? -1 : words[index - 1]!
      const predecessorStart = index === 0 ? -1 : starts[index - 1]!
      if (predecessor > bestWords || (predecessor === bestWords && predecessorStart > bestStart)) {
        bestWords = predecessor
        bestStart = predecessorStart
      }
      // Match whole code points: a surrogate from another letter cannot improve an alignment.
      if (!name.startsWith(character, index)) continue
      const wordStart = Number(isWordStart(index))
      if (first) {
        nextWords[index] = wordStart
        nextStarts[index] = index
      } else if (bestWords >= 0) {
        nextWords[index] = bestWords + wordStart
        nextStarts[index] = bestStart
      }
    }
    ;[words, nextWords] = [nextWords, words]
    ;[starts, nextStarts] = [nextStarts, starts]
    first = false
  }
  let rank: readonly number[] | undefined
  for (let end = 0; end < name.length; end++) {
    if (words[end]! < 0) continue
    const start = starts[end]!
    const candidate = [4, -words[end]!, end + finalWidth - 1 - start, start, name.length]
    if (rank === undefined || compareCompletionRank(candidate, rank) < 0) rank = candidate
  }
  return rank
}
