import type { TreeNode } from '../domain/document'
import type { TextMatch } from '../domain/text-search'
import { plainLocalSearchHtml, richTextHtml, syncRichTextHtml, type TextDecoration } from './editor-dom'

const currentClass = 'search-match-current'
const keyOf = ({ start, end }: TextMatch): string => `${start}:${end}`

function changesProjection(records: readonly MutationRecord[], input: HTMLElement, compact: boolean): boolean {
  return records.some(
    (record) =>
      record.attributeName !== 'class' ||
      (compact ? record.target !== input : (record.target as Element).hasAttribute('data-local-match')),
  )
}

function sameDecorations(first?: readonly TextDecoration[], second?: readonly TextDecoration[]): boolean {
  return (
    first === second ||
    (first?.length === second?.length &&
      first?.every((range, index) => {
        const other = second![index]!
        return range.start === other.start && range.end === other.end && range.className === other.className
      }) === true)
  )
}

interface ActiveProjection {
  input: HTMLElement
  text: string
  links: TreeNode['links']
  decorations: readonly TextDecoration[] | undefined
  matches: readonly TextDecoration[]
  observer: MutationObserver
  valid: boolean
  key: string | undefined
  fragments: Iterable<Element>
  compact: boolean
}

/** Keep the live selection and links intact when only the active search hit changes. */
export class RichTextProjection {
  private active: ActiveProjection | undefined

  public reset(): void {
    this.active?.observer.disconnect()
    this.active = undefined
  }

  public apply(
    input: HTMLElement,
    node: TreeNode,
    base: readonly TextDecoration[] | undefined,
    matches: readonly TextDecoration[],
    current: TextMatch | undefined,
  ): void {
    const key = current === undefined ? undefined : keyOf(current)
    const previous = this.active
    if (
      previous?.input === input &&
      previous.text === node.text &&
      previous.links === node.links &&
      previous.matches === matches &&
      sameDecorations(previous.decorations, base) &&
      previous.valid &&
      !changesProjection(previous.observer.takeRecords(), input, previous.compact)
    ) {
      if (previous.key !== key) {
        for (const fragment of previous.fragments) fragment.classList.remove(currentClass)
        previous.key = key
        previous.fragments = this.highlight(input, key, current, previous.compact ? matches : undefined)
        // Ignore the classes this projection just changed, but not native DOM edits.
        previous.observer.takeRecords()
      }
      if (key === undefined && !previous.compact) this.reset()
      return
    }

    this.reset()
    const compact = matches.length >= 512 && (base?.length ?? 0) === 0 && (node.links?.length ?? 0) === 0
    const html = compact
      ? plainLocalSearchHtml(node.text, matches)
      : richTextHtml(
          node,
          matches.length === 0
            ? base
            : [...(base ?? []), ...matches.map((match) => ({ ...match, localMatch: keyOf(match) }))],
        )
    syncRichTextHtml(input, html + (node.text.endsWith('\n') ? '<br data-trailing-line>' : ''))
    if ((key === undefined && !compact) || matches.length === 0) return

    const fragments = this.highlight(input, key, current, compact ? matches : undefined)
    const observer = new MutationObserver((records) => {
      if (changesProjection(records, input, compact)) active.valid = false
    })
    // Retain only the projected fields, not an obsolete immutable subtree from a parent heading.
    const active = {
      input,
      text: node.text,
      links: node.links,
      decorations: base,
      matches,
      observer,
      valid: true,
      key,
      fragments,
      compact,
    }
    this.active = active
    // Native input and Replace may mutate content independently of the React render.
    // Date-like caret hints do not affect this projection's text or match ranges.
    observer.observe(input, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'href', 'data-local-match'],
    })
  }

  private highlight(
    input: HTMLElement,
    key: string | undefined,
    current: TextMatch | undefined,
    orderedMatches: readonly TextDecoration[] | undefined,
  ): Iterable<Element> {
    if (key === undefined || current === undefined) return []
    if (orderedMatches !== undefined) {
      let low = 0
      let high = orderedMatches.length
      while (low < high) {
        const middle = (low + high) >>> 1
        if (orderedMatches[middle]!.start < current.start) low = middle + 1
        else high = middle
      }
      const match = orderedMatches[low]
      if (match?.start !== current.start || match.end !== current.end) return []
      // Compact markup has exactly one element child per match, in the same order.
      const fragment = input.children.item(low)
      if (fragment === null) return []
      fragment.classList.add(currentClass)
      return [fragment]
    }
    const fragments = input.querySelectorAll(`[data-local-match="${key}"]`)
    for (const fragment of fragments) fragment.classList.add(currentClass)
    return fragments
  }
}
