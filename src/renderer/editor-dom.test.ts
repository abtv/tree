// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
import {
  collapseSelectionToAnchor,
  hasMultiCharacterSelection,
  nodeTextLength,
  setEditableText,
  getCaret,
  getSelectionRange,
  isCollapsedSelection,
  readEditableContent,
  richTextHtml,
  selectAll,
  setCaret,
  setNormalCaret,
  updateSelectedLinks,
} from './editor-dom'

function node(text: string, links?: TreeNode['links']): TreeNode {
  return { id: 'node', text, ...(links === undefined ? {} : { links }), children: [] }
}

function setDomSelection(startNode: Node, start: number, endNode = startNode, end = start): void {
  const selection = window.getSelection()
  if (selection === null) throw new Error('Selection is unavailable.')
  const range = document.createRange()
  range.setStart(startNode, start)
  range.setEnd(endNode, end)
  selection.removeAllRanges()
  selection.addRange(range)
}

describe('editor DOM adapters', () => {
  it('reads editable text lengths from textarea values and contenteditable text', () => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello'
    textarea.textContent = 'unused'
    expect(nodeTextLength(textarea)).toBe(5)

    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    expect(nodeTextLength(editable)).toBe(0)
    editable.textContent = 'hello'
    expect(nodeTextLength(editable)).toBe(5)
  })

  it.each([0, 1, 2])('recognizes textarea selection width %i', (width) => {
    const textarea = document.createElement('textarea')
    textarea.value = 'hello'
    textarea.setSelectionRange(1, 1 + width)
    expect(hasMultiCharacterSelection(textarea)).toBe(width > 1)
  })

  it.each([0, 1, 2])('recognizes contenteditable selection width %i', (width) => {
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.textContent = 'hello'
    document.body.append(editable)
    const range = document.createRange()
    range.setStart(editable.firstChild!, 1)
    range.setEnd(editable.firstChild!, 1 + width)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    try {
      expect(hasMultiCharacterSelection(editable)).toBe(width > 1)
    } finally {
      selection.removeAllRanges()
      editable.remove()
    }
  })

  it('writes editable text to textarea values and contenteditable text', () => {
    const textarea = document.createElement('textarea')
    textarea.textContent = 'default'
    setEditableText(textarea, 'updated')
    expect(textarea.value).toBe('updated')
    expect(textarea.textContent).toBe('default')

    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.innerHTML = '<b>original</b>'
    setEditableText(editable, 'updated')
    expect(editable.textContent).toBe('updated')
    expect(editable.children).toHaveLength(0)
  })

  it('renders escaped text and editable links', () => {
    expect(
      richTextHtml(
        node('A < B & C', [
          { start: 0, end: 1, url: 'https://example.test/?a=1&b=2' },
          { start: 6, end: 7, url: 'https://example.test' },
        ]),
      ),
    ).toBe(
      '<a href="https://example.test/?a=1&amp;b=2" rel="noreferrer" target="_blank">A</a> &lt; B <a href="https://example.test" rel="noreferrer" target="_blank">&amp;</a> C',
    )
  })

  it('renders an empty node as an empty editable text surface', () => {
    expect(richTextHtml(node(''))).toBe('')
  })

  it('reads text and link ranges from editable markup', () => {
    const element = document.createElement('div')
    element.innerHTML = 'before<a href="https://example.test">linked</a>after'

    expect(readEditableContent(element)).toEqual({
      text: 'beforelinkedafter',
      links: [{ start: 6, end: 12, url: 'https://example.test' }],
    })
  })

  it('reads textarea caret and selection positions', () => {
    const element = document.createElement('textarea')
    element.value = 'hello'
    element.setSelectionRange(1, 4)

    expect(getCaret(element)).toBe(1)
    expect(getSelectionRange(element)).toEqual({ start: 1, end: 4 })
  })

  it('reads a collapsed contenteditable selection and rejects selections outside the element', () => {
    const element = document.createElement('div')
    const text = document.createTextNode('hello')
    element.append(text)
    document.body.append(element)
    setDomSelection(text, 3)

    expect(getCaret(element)).toBe(3)
    expect(getSelectionRange(element)).toEqual({ start: 3, end: 3 })
    expect(isCollapsedSelection()).toBe(true)

    const outside = document.createTextNode('outside')
    document.body.append(outside)
    setDomSelection(outside, 2)
    expect(getCaret(element)).toBe(0)
    expect(getSelectionRange(element)).toEqual({ start: 0, end: 0 })
  })

  it('falls back to the caret when no DOM selection exists', () => {
    const element = document.createElement('div')
    element.textContent = 'hello'
    document.body.append(element)
    const getSelection = vi.spyOn(globalThis, 'getSelection').mockReturnValue(null)

    expect(getCaret(element)).toBe(0)
    expect(getSelectionRange(element)).toEqual({ start: 0, end: 0 })
    expect(isCollapsedSelection()).toBe(true)

    getSelection.mockRestore()
  })

  it('reads a contenteditable range in document order and restores the selection', () => {
    const element = document.createElement('div')
    const first = document.createTextNode('one')
    const second = document.createTextNode('two')
    element.append(first, second)
    document.body.append(element)
    setDomSelection(first, 1, second, 2)

    expect(getSelectionRange(element)).toEqual({ start: 1, end: 5 })
    expect(window.getSelection()?.anchorNode).toBe(first)
    expect(window.getSelection()?.focusNode).toBe(second)
  })

  it('calculates caret offsets through nested inline elements', () => {
    const element = document.createElement('div')
    element.innerHTML = '<span>one<strong>two</strong></span><span>three</span>'
    document.body.append(element)
    const nestedText = element.querySelector('strong')?.firstChild
    if (nestedText === undefined || nestedText === null) throw new Error('Nested text was not created.')
    setDomSelection(nestedText, 1)

    expect(getCaret(element)).toBe(4)
  })

  it('selects all content and reports a non-collapsed selection', () => {
    const element = document.createElement('div')
    element.textContent = 'select me'
    document.body.append(element)

    selectAll(element)

    expect(getSelectionRange(element)).toEqual({ start: 0, end: 9 })
    expect(isCollapsedSelection()).toBe(false)
  })

  it('places a caret in ordinary text and clamps past the end', () => {
    const element = document.createElement('div')
    element.textContent = 'hello'
    document.body.append(element)

    setCaret(element, 2)
    expect(getCaret(element)).toBe(2)
    setCaret(element, 99)
    expect(getCaret(element)).toBe(5)
  })

  it('places a collapsed caret in a textarea and clamps to its value', () => {
    const element = document.createElement('textarea')
    element.value = 'hello'
    element.setSelectionRange(0, 3)

    setCaret(element, 2)
    expect(getSelectionRange(element)).toEqual({ start: 2, end: 2 })
    setCaret(element, -4)
    expect(getSelectionRange(element)).toEqual({ start: 0, end: 0 })
    setCaret(element, 99)
    expect(getSelectionRange(element)).toEqual({ start: 5, end: 5 })
  })

  it('selects the current character for a Normal-mode block caret', () => {
    const element = document.createElement('textarea')
    element.value = 'hello'

    setNormalCaret(element, 2)

    expect(getSelectionRange(element)).toEqual({ start: 2, end: 3 })
    setNormalCaret(element, 99)
    expect(getSelectionRange(element)).toEqual({ start: 4, end: 5 })
  })

  it('keeps the DOM caret after text when the image is the active Normal-mode character', () => {
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = 'true'
    const element = document.createElement('textarea')
    element.value = 'hello'
    row.append(element, document.createElement('button'))

    setNormalCaret(element, 5)

    expect(getSelectionRange(element)).toEqual({ start: 5, end: 5 })
  })

  it('selects each linked character for a Normal-mode block caret', () => {
    const element = document.createElement('div')
    element.innerHTML = 'a<a href="https://example.test">link</a>z'
    document.body.append(element)
    setNormalCaret(element, 2)
    expect(getSelectionRange(element)).toEqual({ start: 2, end: 3 })
    setNormalCaret(element, 4)
    expect(getSelectionRange(element)).toEqual({ start: 4, end: 5 })
  })

  it('selects the Normal-mode block caret in plain text around links', () => {
    const element = document.createElement('div')
    element.innerHTML =
      'test <a contenteditable="false" href="https://example.test">link</a>\n<a contenteditable="false" href="https://example.test">link</a> after'
    document.body.append(element)

    setNormalCaret(element, 0)
    expect(getSelectionRange(element)).toEqual({ start: 0, end: 1 })

    setNormalCaret(element, 1)
    expect(getSelectionRange(element)).toEqual({ start: 1, end: 2 })

    setNormalCaret(element, 9)
    expect(getSelectionRange(element)).toEqual({ start: 9, end: 10 })
  })

  it('places a caret at each position inside an editable link', () => {
    const element = document.createElement('div')
    element.innerHTML = 'a<a href="https://example.test">link</a>z'
    document.body.append(element)

    setCaret(element, 3)
    expect(getCaret(element)).toBe(3)
    setCaret(element, 4)
    expect(getCaret(element)).toBe(4)
  })

  it('collapses a textarea selection to its anchor without moving a collapsed caret', () => {
    const element = document.createElement('textarea')
    element.value = 'hello'
    element.setSelectionRange(1, 4, 'forward')

    collapseSelectionToAnchor(element)
    expect(getSelectionRange(element)).toEqual({ start: 1, end: 1 })

    element.setSelectionRange(2, 5, 'backward')
    collapseSelectionToAnchor(element)
    expect(getSelectionRange(element)).toEqual({ start: 5, end: 5 })

    element.setSelectionRange(3, 3)
    collapseSelectionToAnchor(element)
    expect(getSelectionRange(element)).toEqual({ start: 3, end: 3 })
  })

  it('collapses a contenteditable selection to its anchor', () => {
    const element = document.createElement('div')
    const first = document.createTextNode('one')
    const second = document.createTextNode('two')
    element.append(first, second)
    document.body.append(element)
    setDomSelection(first, 1, second, 2)

    collapseSelectionToAnchor(element)

    expect(window.getSelection()?.anchorNode).toBe(first)
    expect(window.getSelection()?.anchorOffset).toBe(1)
    expect(isCollapsedSelection()).toBe(true)
  })

  it('leaves selections outside the element and missing selections untouched', () => {
    const element = document.createElement('div')
    element.textContent = 'hello'
    document.body.append(element)
    const outside = document.createTextNode('outside')
    document.body.append(outside)
    setDomSelection(outside, 1, outside, 4)

    collapseSelectionToAnchor(element)
    expect(window.getSelection()?.anchorNode).toBe(outside)
    expect(window.getSelection()?.isCollapsed).toBe(false)

    const getSelection = vi.spyOn(globalThis, 'getSelection').mockReturnValue(null)
    expect(() => collapseSelectionToAnchor(element)).not.toThrow()
    getSelection.mockRestore()
  })

  it('marks fully selected links and clears the mark when selection collapses', () => {
    const element = document.createElement('div')
    element.innerHTML = 'a<a href="https://example.test">link</a>z'
    document.body.append(element)
    const link = element.querySelector('a')
    if (link === null) throw new Error('The link was not created.')

    setDomSelection(element.firstChild!, 0, element.lastChild!, 1)
    updateSelectedLinks(element)
    expect(link.classList.contains('link-selected')).toBe(true)

    setDomSelection(element.firstChild!, 0)
    updateSelectedLinks(element)
    expect(link.classList.contains('link-selected')).toBe(false)
  })

  it('does not mark a link that the selection does not cover', () => {
    const element = document.createElement('div')
    element.innerHTML = 'a<a href="https://example.test">link</a>z'
    document.body.append(element)
    const link = element.querySelector('a')
    if (link === null) throw new Error('The link was not created.')

    setDomSelection(element.firstChild!, 0, element.firstChild!, 1)
    updateSelectedLinks(element)
    expect(link.classList.contains('link-selected')).toBe(false)

    setDomSelection(link.firstChild!, 1, link.firstChild!, 2)
    updateSelectedLinks(element)
    expect(link.classList.contains('link-selected')).toBe(false)
  })

  it('does not mark a link missing its final character from the selection', () => {
    const element = document.createElement('div')
    element.innerHTML = 'a<a href="https://example.test">link</a>z'
    document.body.append(element)
    const link = element.querySelector('a')
    if (link === null) throw new Error('The link was not created.')

    setDomSelection(element.firstChild!, 0, link.firstChild!, 3)
    updateSelectedLinks(element)
    expect(link.classList.contains('link-selected')).toBe(false)
  })

  it('marks a link only when the selection boundary passes the anchor element, not merely its text', () => {
    const element = document.createElement('div')
    element.innerHTML = 'see <a href="https://example.test">link</a>'
    document.body.append(element)
    const link = element.querySelector('a')
    const label = link?.firstChild
    if (link === null || label === undefined || label === null) throw new Error('The link was not created.')

    // A mouse selection can end inside the anchor at its final text offset while the rendered
    // selection appears to include the whole label; the boundary-point rule does not count that
    // as covering the anchor. See e2e/clipboard.spec.ts "selects linked characters with the mouse".
    setDomSelection(element.firstChild!, 0, label, label.textContent?.length ?? 0)
    updateSelectedLinks(element)
    expect(link.classList.contains('link-selected')).toBe(false)

    setDomSelection(element.firstChild!, 0, element, element.childNodes.length)
    updateSelectedLinks(element)
    expect(link.classList.contains('link-selected')).toBe(true)
  })

  // Every selection change runs this for every mounted input, and each Range stays attached to the
  // document until garbage collection, which makes every later DOM removal slower (PRODUCT.md §22.2).
  it('creates no Range for an input without links or without a ranged selection', () => {
    const plain = document.createElement('div')
    plain.textContent = 'plain text'
    const linked = document.createElement('div')
    linked.innerHTML = 'a<a href="https://example.test">link</a>z'
    document.body.append(plain, linked)
    const link = linked.querySelector('a')!
    setDomSelection(linked.firstChild!, 0, linked.lastChild!, 1)
    updateSelectedLinks(linked)
    expect(link.classList.contains('link-selected')).toBe(true)
    const createRange = vi.spyOn(document, 'createRange')
    const getRangeAt = vi.spyOn(Selection.prototype, 'getRangeAt')
    try {
      updateSelectedLinks(plain)
      expect(createRange).not.toHaveBeenCalled()
      expect(getRangeAt).not.toHaveBeenCalled()
      setDomSelection(linked.firstChild!, 0)
      createRange.mockClear()
      getRangeAt.mockClear()
      updateSelectedLinks(linked)
      expect(link.classList.contains('link-selected')).toBe(false)
      expect(createRange).not.toHaveBeenCalled()
      expect(getRangeAt).not.toHaveBeenCalled()
    } finally {
      createRange.mockRestore()
      getRangeAt.mockRestore()
    }
  })

  it('reads text nested inside inline elements and anchors without an href attribute', () => {
    const element = document.createElement('div')
    element.innerHTML = 'before<span>inner <em>deep</em></span><a>linked</a>'

    expect(readEditableContent(element)).toEqual({
      text: 'beforeinner deeplinked',
      links: [{ start: 16, end: 22, url: '' }],
    })
  })

  it('computes caret offsets through nested inline elements and first-level children', () => {
    const element = document.createElement('div')
    element.innerHTML = '<span>a</span><span>x<b>two</b></span>'
    document.body.append(element)
    const bold = element.querySelector('b')
    if (bold === null) throw new Error('The nested element was not created.')

    setDomSelection(bold, 0)
    expect(getCaret(element)).toBe(2)

    const firstSpan = element.querySelector('span')
    if (firstSpan === null) throw new Error('The first span was not created.')
    setDomSelection(firstSpan, 0)
    expect(getCaret(element)).toBe(0)
  })

  it('leaves the caret and selection untouched when no DOM selection is available', () => {
    const element = document.createElement('div')
    element.textContent = 'hello'
    document.body.append(element)
    const getSelection = vi.spyOn(globalThis, 'getSelection').mockReturnValue(null)

    expect(() => setCaret(element, 2)).not.toThrow()
    expect(() => selectAll(element)).not.toThrow()

    getSelection.mockRestore()
  })
})
