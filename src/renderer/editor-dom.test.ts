// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
import {
  getCaret,
  getSelectionRange,
  isCollapsedSelection,
  readEditableContent,
  richTextHtml,
  selectAll,
  setCaret,
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
  it('renders escaped text and non-editable links', () => {
    expect(
      richTextHtml(
        node('A < B & C', [
          { start: 0, end: 1, url: 'https://example.test/?a=1&b=2' },
          { start: 6, end: 7, url: 'https://example.test' },
        ]),
      ),
    ).toBe(
      '<a contenteditable="false" href="https://example.test/?a=1&amp;b=2" rel="noreferrer" target="_blank">A</a> &lt; B <a contenteditable="false" href="https://example.test" rel="noreferrer" target="_blank">&amp;</a> C',
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

  it('places a caret before or after a non-editable link at the nearest boundary', () => {
    const element = document.createElement('div')
    element.innerHTML = 'a<a contenteditable="false" href="https://example.test">link</a>z'
    document.body.append(element)

    setCaret(element, 3)
    expect(getCaret(element)).toBe(1)
    setCaret(element, 4)
    expect(getCaret(element)).toBe(5)
  })
})
