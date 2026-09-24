import type { LinkRange, TreeNode } from '../domain/document'

export function richTextHtml(node: TreeNode): string {
  const links = node.links ?? []
  const parts: string[] = []
  let position = 0
  for (const link of links) {
    if (link.start > position) parts.push(escapeHtml(node.text.slice(position, link.start)))
    const label = escapeHtml(node.text.slice(link.start, link.end))
    parts.push(
      `<a contenteditable="false" href="${escapeHtml(link.url)}" rel="noreferrer" target="_blank">${label}</a>`,
    )
    position = link.end
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
  clearNormalCaret(element)
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
  for (const link of element.querySelectorAll('a')) {
    link.classList.toggle('link-selected', range !== null && range.intersectsNode(link))
  }
}

export function setCaret(element: HTMLElement, position: number): void {
  if (element instanceof HTMLTextAreaElement) {
    const clamped = Math.min(Math.max(position, 0), element.value.length)
    element.setSelectionRange(clamped, clamped)
    return
  }
  clearNormalCaret(element)
  const selection = globalThis.getSelection()
  if (selection === null) return
  const range = document.createRange()
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = position
  let current: Node | null = walker.nextNode()
  while (current !== null) {
    const length = current.textContent?.length ?? 0
    const link = current.parentElement?.closest('a[contenteditable="false"]')
    if (link !== null && link !== undefined && remaining <= length) {
      const parent = link.parentNode ?? element
      const linkIndex = Array.from(parent.childNodes).indexOf(link)
      const beforeLink = remaining <= length / 2
      range.setStart(parent, beforeLink ? linkIndex : linkIndex + 1)
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
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
  if (length === 0) {
    setCaret(element, 0)
    return
  }
  const cursor = Math.min(Math.max(position, 0), length - 1)
  if (!(element instanceof HTMLTextAreaElement)) {
    const linkCaret = normalLinkCaret(element, cursor)
    if (linkCaret !== undefined) {
      setCaret(element, cursor)
      linkCaret.link.classList.add(linkCaret.before ? 'normal-caret-before' : 'normal-caret-after')
      positionNormalLinkCaret(linkCaret.link, linkCaret.before)
      return
    }
  }
  setSelectionRange(element, cursor, cursor + 1)
}

export function clearNormalCaret(element: HTMLElement): void {
  for (const link of element.querySelectorAll<HTMLAnchorElement>('a.normal-caret-before, a.normal-caret-after')) {
    link.classList.remove('normal-caret-before', 'normal-caret-after')
    link.style.removeProperty('--normal-caret-left')
    link.style.removeProperty('--normal-caret-top')
    link.style.removeProperty('--normal-caret-height')
  }
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

function normalLinkCaret(
  element: HTMLElement,
  position: number,
): { link: HTMLAnchorElement; before: boolean } | undefined {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = position
  let current: Node | null = walker.nextNode()
  while (current !== null) {
    const length = current.textContent?.length ?? 0
    const link = current.parentElement?.closest('a[contenteditable="false"]')
    if (link instanceof HTMLAnchorElement && remaining < length) return { link, before: remaining <= length / 2 }
    remaining -= length
    current = walker.nextNode()
  }
  return undefined
}

function positionNormalLinkCaret(link: HTMLAnchorElement, before: boolean): void {
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT)
  let first: Text | undefined
  let last: Text | undefined
  let current = walker.nextNode()
  while (current !== null) {
    if (current instanceof Text && (current.textContent?.length ?? 0) > 0) {
      first ??= current
      last = current
    }
    current = walker.nextNode()
  }
  const text = before ? first : last
  if (text === undefined) return

  const range = document.createRange()
  const length = text.textContent?.length ?? 0
  range.setStart(text, before ? 0 : length - 1)
  range.setEnd(text, before ? 1 : length)
  if (typeof range.getBoundingClientRect !== 'function') return
  const character = range.getBoundingClientRect()
  const bounds = link.getBoundingClientRect()
  link.style.setProperty('--normal-caret-left', `${(before ? character.left - 2 : character.right) - bounds.left}px`)
  link.style.setProperty('--normal-caret-top', `${character.top - bounds.top}px`)
  link.style.setProperty('--normal-caret-height', `${character.height}px`)
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
