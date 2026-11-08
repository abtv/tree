import type { TextMatch } from './text-search'

/** Folding both ways makes contextual lowercase forms, including final sigma, agree. */
export function foldTagName(name: string): string {
  return name.toLowerCase().toUpperCase()
}

/** Map a continuous folded match back to whole characters in the displayed name. */
export function tagNameMatch(name: string, fragment: string): TextMatch | undefined {
  const needle = foldTagName(fragment)
  if (!needle) return undefined
  const start = foldTagName(name).indexOf(needle)
  if (start < 0) return undefined
  let foldedOffset = 0
  let originalOffset = 0
  let originalStart = 0
  for (const character of name) {
    const end = foldedOffset + foldTagName(character).length
    if (foldedOffset <= start) originalStart = originalOffset
    originalOffset += character.length
    if (end >= start + needle.length) return { start: originalStart, end: originalOffset }
    foldedOffset = end
  }
  return undefined
}
