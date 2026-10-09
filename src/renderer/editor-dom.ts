import type { LinkRange, TreeNode } from '../domain/document'
import { normalCaretTarget } from './link-caret'

export function nodeTextLength(input: HTMLElement): number {
  return input instanceof HTMLTextAreaElement ? input.value.length : (input.textContent?.length ?? 0)
}

/**
 * The Normal caret is a collapsed position or a one-character block; anything wider is a deliberate
 * selection (Cmd+A or a pointer drag) that caret normalization must not overwrite.
 */
export function hasMultiCharacterSelection(input: HTMLElement): boolean {
  const selection = getSelectionRange(input)
  return selection.end - selection.start > 1
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

export function richTextHtml(node: TreeNode, decorations: readonly TextDecoration[] = []): string {
  const links = node.links ?? []
  const parts: string[] = []
  let position = 0
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
    if (range.start > position) parts.push(escapeHtml(node.text.slice(position, range.start)))
    parts.push(range.html(escapeHtml(node.text.slice(range.start, range.end))))
    position = range.end
  }
  if (position < node.text.length || parts.length === 0) parts.push(escapeHtml(node.text.slice(position)))
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
  if (!element.contains(range.startContainer)) return 0
  if (range.startContainer.nodeType === Node.ELEMENT_NODE) {
    const children = range.startContainer.childNodes
    let offset = 0
    for (let index = 0; index < range.startOffset; index += 1) offset += children[index]?.textContent?.length ?? 0
    const prefix = range.startContainer === element ? 0 : getCaretPrefix(element, range.startContainer)
    return prefix + offset
  }
  const before = range.cloneRange()
  before.selectNodeContents(element)
  before.setEnd(range.startContainer, range.startOffset)
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
  const start = getCaret(element)
  if (range.collapsed) return { start, end: start }
  const endRange = range.cloneRange()
  endRange.collapse(false)
  selection.removeAllRanges()
  selection.addRange(endRange)
  const end = getCaret(element)
  selection.removeAllRanges()
  selection.addRange(range)
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
  const selection = globalThis.getSelection()
  const active = selection !== null && selection.rangeCount > 0 && !selection.isCollapsed
  const range = active && selection !== null ? selection.getRangeAt(0) : null
  const linkRange = document.createRange()
  for (const link of element.querySelectorAll('a')) {
    linkRange.selectNodeContents(link)
    link.classList.toggle(
      'link-selected',
      range !== null &&
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
  const length = element instanceof HTMLTextAreaElement ? element.value.length : (element.textContent?.length ?? 0)
  const target = normalCaretTarget(length, position, hasAttachmentCharacter(element))
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
