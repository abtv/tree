import type { LinkRange, TreeNode } from '../domain/document'
import { findDateLikeTokens } from '../domain/date-recognition'
import { markedPieces, type CaretMark } from './agenda-row-caret'
import { characterBoundaries, characterStart, moveCharacterOffset } from '../domain/text-characters'

/** Measure a windowed-out Tree row with the same row styles and indentation as a mounted row. */
export function unmountedNodeGeometry(
  node: TreeNode,
  depth: number,
): ReturnType<typeof visualTextGeometry> | undefined {
  const list = document.querySelector<HTMLElement>('.node-list')
  if (list === null) return undefined
  const row = document.createElement('div')
  row.className = 'node-row'
  row.style.setProperty('--row-depth', String(depth))
  Object.assign(row.style, {
    position: 'absolute',
    left: '0',
    right: '0',
    top: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
  })
  row.setAttribute('aria-hidden', 'true')
  const input = document.createElement('div')
  input.className = 'node-input'
  input.innerHTML = richTextHtml(node)
  row.append(input)
  list.append(row)
  try {
    const geometry = visualTextGeometry(input)
    return {
      position: geometry.position,
      dispose: () => {
        geometry.dispose()
        row.remove()
      },
    }
  } catch (error) {
    row.remove()
    throw error
  }
}

/** Measure wrapped text without changing the live selection. Dispose after a vertical command. */
export function visualTextGeometry(element: HTMLElement): {
  position: (offset: number) => { top: number; left: number }
  dispose: () => void
} {
  let measured = element
  if (element instanceof HTMLTextAreaElement) {
    measured = document.createElement('div')
    const style = getComputedStyle(element)
    for (const property of [
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'font-variant',
      'font-stretch',
      'line-height',
      'letter-spacing',
      'padding',
      'border',
      'box-sizing',
      'word-break',
      'overflow-wrap',
      'tab-size',
      'text-indent',
    ])
      measured.style.setProperty(property, style.getPropertyValue(property))
    Object.assign(measured.style, {
      position: 'fixed',
      visibility: 'hidden',
      whiteSpace: 'pre-wrap',
      width: `${element.getBoundingClientRect().width}px`,
      left: '0',
      top: '0',
    })
    measured.textContent = element.value
    document.body.append(measured)
  }
  const text = nodeText(element)
  const textNodes: { node: Node; start: number; end: number }[] = []
  const walker = document.createTreeWalker(measured, NodeFilter.SHOW_TEXT)
  let child = walker.nextNode()
  let start = 0
  while (child !== null) {
    const end = start + (child.textContent?.length ?? 0)
    textNodes.push({ node: child, start, end })
    start = end
    child = walker.nextNode()
  }
  const range = document.createRange()
  return {
    position: (offset) => {
      const cursor = characterStart(text, Math.min(offset, Math.max(0, text.length - 1)))
      const part = textNodes.find((part) => cursor >= part.start && cursor < part.end)
      if (part === undefined) return { top: 0, left: 0 }
      range.setStart(part.node, cursor - part.start)
      const end = moveCharacterOffset(text, cursor, 1)
      const last = textNodes.find((part) => end > part.start && end <= part.end) ?? part
      range.setEnd(last.node, end - last.start)
      const rect = range.getBoundingClientRect()
      const origin = measured.getBoundingClientRect()
      return { top: rect.top - origin.top, left: rect.left - origin.left }
    },
    dispose: () => {
      range.detach()
      if (measured !== element) measured.remove()
    },
  }
}

/** Current text-line bounds, including textarea wrapping, without changing the live selection. */
export function caretLineRect(element: HTMLElement, cursor: number): DOMRect {
  const bounds = element.getBoundingClientRect()
  // Hidden or not-yet-laid-out inputs have no text line to reveal.
  if (bounds.width === 0 && bounds.height === 0) return bounds
  const style = getComputedStyle(element)
  const height = Number.parseFloat(style.lineHeight) || bounds.height
  const geometry = visualTextGeometry(element)
  try {
    const position = geometry.position(cursor)
    const top = bounds.top + (nodeText(element).length === 0 ? Number.parseFloat(style.paddingTop) || 0 : position.top)
    return new DOMRect(bounds.left, top - element.scrollTop, bounds.width, height)
  } finally {
    geometry.dispose()
  }
}

/** Find a character on the adjacent visual line, or on the entry line of another node. */
export function visualLineCursor(
  text: string,
  position: (offset: number) => { top: number; left: number },
  cursor: number,
  direction: 'up' | 'down',
  preferredLeft: number,
  entering = false,
): number | undefined {
  if (text.length === 0) return undefined
  const last = characterStart(text, text.length - 1)
  const currentTop = position(cursor).top
  // Find the first character satisfying a monotonic condition, in UTF-16 offsets. Normalize the
  // final result to a grapheme boundary, so emoji are never split by a motion.
  const lowerBound = (predicate: (offset: number) => boolean): number => {
    let low = 0
    let high = text.length
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (predicate(middle)) high = middle
      else low = middle + 1
    }
    return low
  }
  let target: number
  if (entering) target = direction === 'down' ? 0 : last
  else if (direction === 'down') {
    target = lowerBound((offset) => position(offset).top > currentTop + 1)
    if (target === text.length) return undefined
  } else {
    const lineStart = lowerBound((offset) => position(offset).top >= currentTop - 1)
    if (lineStart === 0) return undefined
    target = characterStart(text, lineStart - 1)
  }
  const targetTop = position(target).top
  const lineStart = lowerBound((offset) => position(offset).top >= targetTop - 1)
  const lineEnd = lowerBound((offset) => position(offset).top > targetTop + 1)
  // Logical offsets remain ordered by line, but bidi runs can reverse their x coordinates.
  // Inspect only the destination line to choose the nearest whole character in either direction.
  let nearest = lineStart
  let distance = Infinity
  for (const offset of characterBoundaries(text)) {
    if (offset < lineStart) continue
    if (offset >= lineEnd) break
    const candidateDistance = Math.abs(position(offset).left - preferredLeft)
    if (candidateDistance < distance) {
      nearest = offset
      distance = candidateDistance
    }
  }
  return nearest
}

/** Measure a UTF-16 text offset without disturbing the live selection. */
export function expressionPosition(
  element: HTMLElement,
  offset: number,
): { left: number; top: number; rowTop: number } {
  const rect = element.getBoundingClientRect()
  const row = element.closest('.node-row, .agenda-row') ?? element
  const { top: rowTop, bottom: top } = row.getBoundingClientRect()
  if (element instanceof HTMLTextAreaElement) {
    const mirror = document.createElement('div')
    const style = getComputedStyle(element)
    for (const property of [
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'font-variant',
      'font-stretch',
      'line-height',
      'letter-spacing',
      'padding',
      'border',
      'box-sizing',
      'word-break',
      'overflow-wrap',
    ])
      mirror.style.setProperty(property, style.getPropertyValue(property))
    Object.assign(mirror.style, {
      position: 'fixed',
      visibility: 'hidden',
      whiteSpace: 'pre-wrap',
      width: `${rect.width}px`,
      left: `${rect.left}px`,
      top: `${rect.top}px`,
    })
    mirror.textContent = element.value.slice(0, offset)
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    mirror.append(marker, element.value.slice(offset))
    document.body.append(mirror)
    const left = marker.getBoundingClientRect().left - element.scrollLeft
    mirror.remove()
    return { left, top, rowTop }
  }
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let text = walker.nextNode()
  while (text !== null) {
    const length = text.textContent?.length ?? 0
    if (remaining <= length) {
      const range = document.createRange()
      range.setStart(text, remaining)
      range.collapse(true)
      return { left: range.getBoundingClientRect().left, top, rowTop }
    }
    remaining -= length
    text = walker.nextNode()
  }
  return { left: rect.left, top, rowTop }
}
import { normalCaretTarget } from './link-caret'

export function nodeTextLength(input: HTMLElement): number {
  return nodeText(input).length
}

export function nodeText(input: HTMLElement): string {
  return input instanceof HTMLTextAreaElement ? input.value : (input.textContent ?? '')
}

/**
 * The Normal caret is a collapsed position or a one-character block; anything wider is a deliberate
 * selection (Cmd+A or a pointer drag) that caret normalization must not overwrite.
 */
export function hasMultiCharacterSelection(input: HTMLElement): boolean {
  const selection = getSelectionRange(input)
  if (selection.start === selection.end) return false
  const text = nodeText(input)
  return (
    selection.start !== characterStart(text, selection.start) ||
    selection.end !== moveCharacterOffset(text, selection.start, 1)
  )
}

export function setEditableText(input: HTMLElement, text: string): void {
  if (input instanceof HTMLTextAreaElement) input.value = text
  else input.textContent = text
}

export interface TextDecoration {
  start: number
  end: number
  className: string
}

export const DATE_LIKE_CLASS = 'date-like-text'

/** Decoration ranges for text that resembles a date without being one (docs/PRODUCT.md §20.10). */
export function dateLikeDecorations(node: TreeNode): TextDecoration[] {
  return findDateLikeTokens(node.text, node.links).map(({ start, end }) => ({ start, end, className: DATE_LIKE_CLASS }))
}

/**
 * Hides the date-like underline on every token the focused element's selection is in or directly
 * adjacent to, so intermediate typing states such as `2026-10-1` are never flagged. An element that
 * is not focused shows every underline. Toggles an attribute only, so no re-render is needed.
 */
export function updateDateLikeUnderline(element: HTMLElement): void {
  const spans = element.querySelectorAll<HTMLElement>(`.${DATE_LIKE_CLASS}`)
  if (spans.length === 0) return
  const range = element.ownerDocument.activeElement === element ? getSelectionRange(element) : undefined
  // The Vim Normal block caret is a one-character selection that stands for the caret before that
  // character, so it is treated as that collapsed caret.
  const selection =
    range !== undefined && range.end - range.start === 1 ? { start: range.start, end: range.start } : range
  const measure = document.createRange()
  for (const span of spans) {
    measure.selectNodeContents(element)
    measure.setEndBefore(span)
    const start = measure.toString().length
    const end = start + (span.textContent?.length ?? 0)
    span.toggleAttribute('data-caret', selection !== undefined && selection.start <= end && selection.end >= start)
  }
}

export function richTextHtml(
  node: TreeNode,
  decorations: readonly TextDecoration[] = [],
  marks: readonly CaretMark[] = [],
): string {
  const links = node.links ?? []
  const parts: string[] = []
  let position = 0
  // Marks nest inside links and decorations, so Tree's markup is unchanged when there are none.
  const markedHtml = (start: number, end: number, includeEnd: boolean): string =>
    markedPieces(node.text, start, end, marks, includeEnd)
      .map((piece) =>
        piece.className === undefined
          ? escapeHtml(piece.text)
          : `<span class="${piece.className}">${escapeHtml(piece.text)}</span>`,
      )
      .join('')
  const ranges = [
    ...links.map((link) => ({
      ...link,
      html: (label: string) => `<a href="${escapeHtml(link.url)}" rel="noreferrer" target="_blank">${label}</a>`,
    })),
    ...decorations
      .filter((range) => !links.some((link) => range.start < link.end && range.end > link.start))
      .map((range) => ({
        ...range,
        html: (label: string) => `<span class="${escapeHtml(range.className)}">${label}</span>`,
      })),
  ].sort((left, right) => left.start - right.start)
  for (const range of ranges) {
    if (range.start > position) parts.push(markedHtml(position, range.start, false))
    parts.push(range.html(markedHtml(range.start, range.end, false)))
    position = range.end
  }
  if (
    position < node.text.length ||
    parts.length === 0 ||
    marks.some((mark) => mark.start === node.text.length && mark.end === node.text.length)
  )
    parts.push(markedHtml(position, node.text.length, true))
  return parts.join('')
}

export function readEditableContent(element: HTMLElement): { text: string; links: LinkRange[] } {
  const links: LinkRange[] = []
  let text = ''
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? ''
      return
    }
    if (node instanceof HTMLAnchorElement) {
      const start = text.length
      const value = node.textContent ?? ''
      text += value
      links.push({ start, end: start + value.length, url: node.getAttribute('href') ?? node.href })
      return
    }
    node.childNodes.forEach(walk)
  }
  element.childNodes.forEach(walk)
  return { text, links }
}

export function getCaret(element: HTMLElement): number {
  if (element instanceof HTMLTextAreaElement) return element.selectionStart ?? 0
  const selection = globalThis.getSelection()
  if (selection === null || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)
  return textOffsetAtBoundary(element, range.startContainer, range.startOffset)
}

/** Read a boundary's UTF-16 text offset without changing the live selection. */
function textOffsetAtBoundary(element: HTMLElement, container: Node, boundaryOffset: number): number {
  if (!element.contains(container)) return 0
  if (container.nodeType === Node.ELEMENT_NODE) {
    const children = container.childNodes
    let offset = 0
    for (let index = 0; index < boundaryOffset; index += 1) offset += children[index]?.textContent?.length ?? 0
    const prefix = container === element ? 0 : getCaretPrefix(element, container)
    return prefix + offset
  }
  const before = element.ownerDocument.createRange()
  before.selectNodeContents(element)
  before.setEnd(container, boundaryOffset)
  return before.toString().length
}

export function getSelectionRange(element: HTMLElement): { start: number; end: number } {
  if (element instanceof HTMLTextAreaElement) {
    return { start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0 }
  }
  const selection = globalThis.getSelection()
  if (selection === null || selection.rangeCount === 0) {
    const cursor = getCaret(element)
    return { start: cursor, end: cursor }
  }
  const range = selection.getRangeAt(0)
  const start = textOffsetAtBoundary(element, range.startContainer, range.startOffset)
  if (range.collapsed) return { start, end: start }
  const end = textOffsetAtBoundary(element, range.endContainer, range.endOffset)
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

export function selectAll(element: HTMLElement): void {
  if (element instanceof HTMLTextAreaElement) {
    element.select()
    return
  }
  const selection = globalThis.getSelection()
  if (selection === null) return
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function collapseSelectionToAnchor(element: HTMLElement): void {
  if (element instanceof HTMLTextAreaElement) {
    const { selectionStart, selectionEnd, selectionDirection } = element
    if (selectionStart === selectionEnd) return
    const anchor = selectionDirection === 'backward' ? selectionEnd : selectionStart
    element.setSelectionRange(anchor, anchor)
    return
  }
  const selection = globalThis.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return
  if (selection.anchorNode === null) return
  selection.collapse(selection.anchorNode, selection.anchorOffset)
}

export function updateSelectedLinks(element: HTMLElement): void {
  const links = element.querySelectorAll('a')
  // Every selection change runs this for every mounted input, and each Range stays attached to the
  // document until garbage collection, slowing every later DOM removal; create one only when needed.
  if (links.length === 0) return
  const selection = globalThis.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    for (const link of links) link.classList.remove('link-selected')
    return
  }
  const range = selection.getRangeAt(0)
  const linkRange = document.createRange()
  for (const link of links) {
    linkRange.selectNodeContents(link)
    link.classList.toggle(
      'link-selected',
      range.compareBoundaryPoints(Range.START_TO_START, linkRange) <= 0 &&
        range.compareBoundaryPoints(Range.END_TO_END, linkRange) >= 0,
    )
  }
}

export function setCaret(element: HTMLElement, position: number): void {
  if (element instanceof HTMLTextAreaElement) {
    const clamped = Math.min(Math.max(position, 0), element.value.length)
    element.setSelectionRange(clamped, clamped)
    return
  }
  const selection = globalThis.getSelection()
  if (selection === null) return
  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = position
  let current: Node | null = walker.nextNode()
  while (current !== null) {
    const length = current.textContent?.length ?? 0
    if (remaining < length) {
      range.setStart(current, remaining)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
    current = walker.nextNode()
  }
  range.selectNodeContents(element)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function setNormalCaret(element: HTMLElement, position: number): void {
  const target = normalCaretTarget(nodeText(element), position, hasAttachmentCharacter(element))
  if (target.kind === 'collapsed') {
    setCaret(element, target.position)
    return
  }
  setSelectionRange(element, target.start, target.end)
}

/** Whether the element's row owns a terminal image character after its text. */
export function hasAttachmentCharacter(element: HTMLElement): boolean {
  return element.closest<HTMLElement>('.node-row, .agenda-row, .current-parent')?.dataset.hasAttachment === 'true'
}

export function setSelectionRange(element: HTMLElement, anchor: number, focus: number): void {
  if (element instanceof HTMLTextAreaElement) {
    element.setSelectionRange(Math.min(anchor, focus), Math.max(anchor, focus), anchor > focus ? 'backward' : 'forward')
    return
  }
  setCaret(element, anchor)
  const selection = globalThis.getSelection()
  if (selection === null || selection.anchorNode === null) return
  const anchorNode = selection.anchorNode
  const anchorOffset = selection.anchorOffset
  setCaret(element, focus)
  if (selection.focusNode !== null) {
    selection.setBaseAndExtent(anchorNode, anchorOffset, selection.focusNode, selection.focusOffset)
  }
}

export function isCollapsedSelection(): boolean {
  const selection = globalThis.getSelection()
  return selection === null || selection.isCollapsed
}

function getCaretPrefix(element: HTMLElement, container: Node): number {
  let offset = 0
  let current: Node | null = container
  while (current !== null && current.parentNode !== null && current.parentNode !== element) {
    let sibling = current.previousSibling
    while (sibling !== null) {
      offset += sibling.textContent?.length ?? 0
      sibling = sibling.previousSibling
    }
    current = current.parentNode
  }
  if (current !== null && current.parentNode === element) {
    let sibling = current.previousSibling
    while (sibling !== null) {
      offset += sibling.textContent?.length ?? 0
      sibling = sibling.previousSibling
    }
  }
  return element === container ? 0 : offset
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
