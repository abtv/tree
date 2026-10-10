// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { dayNumberOf } from '../domain/calendar-date'
import { agendaDecorations, treeDecorations } from './date-decorations'
import { DATE_LIKE_CLASS, richTextHtml, setSelectionRange, updateDateLikeUnderline } from './editor-dom'

const node = (text: string, links?: { start: number; end: number; url: string }[]) => ({
  id: 'n',
  text,
  children: [],
  ...(links === undefined ? {} : { links }),
})

// @requirement PRODUCT.md §20.10
describe('date-like decorations', () => {
  it('keeps ordinary Tree text undecorated and decorates resembling tokens', () => {
    expect(treeDecorations(node('plain text'))).toBeUndefined()
    expect(treeDecorations(node('call 2026-1-5 now'))).toEqual([{ start: 5, end: 13, className: DATE_LIKE_CLASS }])
  })
  it('skips hyperlink text', () => {
    const text = '2026-02-31 link'
    expect(treeDecorations(node(text, [{ start: 0, end: 10, url: 'https://example.com' }]))).toBeUndefined()
  })
  it('orders Agenda decorations by position across valid and resembling dates', () => {
    const day = dayNumberOf({ year: 2026, month: 10, day: 14 })
    expect(agendaDecorations(node('2026-02-31 a 2026-10-14 b 2026-11-20'), day)).toEqual([
      { start: 0, end: 10, className: DATE_LIKE_CLASS },
      { start: 13, end: 23, className: 'agenda-date-active' },
      { start: 26, end: 36, className: 'agenda-date-secondary' },
    ])
  })
})

// @requirement PRODUCT.md §20.11
describe('Tree date visualization', () => {
  it('uses Agenda active-date styling for every recognized date and orders all decorations', () => {
    expect(treeDecorations(node('2026-02-31 a 2026-10-14 b 2026-11-20'))).toEqual([
      { start: 0, end: 10, className: DATE_LIKE_CLASS },
      { start: 13, end: 23, className: 'agenda-date-active' },
      { start: 26, end: 36, className: 'agenda-date-active' },
    ])
  })
  it('excludes hyperlink dates and dates with touching digits', () => {
    expect(treeDecorations(node('2026-10-14', [{ start: 0, end: 10, url: 'https://example.com' }]))).toBeUndefined()
    expect(treeDecorations(node('12026-10-14 2026-10-140'))).toBeUndefined()
  })
})

// @requirement PRODUCT.md §20.10
describe('date-like underline caret rule', () => {
  function editor(text: string): HTMLElement {
    const input = document.createElement('div')
    input.contentEditable = 'true'
    input.tabIndex = 0
    const decorations = treeDecorations(node(text))
    input.innerHTML = richTextHtml(node(text), decorations ?? [])
    document.body.append(input)
    return input
  }
  const marked = (input: HTMLElement): boolean => input.querySelector(`.${DATE_LIKE_CLASS}`)!.hasAttribute('data-caret')

  it('shows every underline while the element is not focused', () => {
    const input = editor('x 2026-10-1 y')
    updateDateLikeUnderline(input)
    expect(marked(input)).toBe(false)
    input.remove()
  })
  it('hides the token the caret is in or adjacent to and shows it elsewhere', () => {
    const input = editor('ab 2026-10-1 cd')
    input.focus()
    for (const [caret, hidden] of [
      [0, false],
      [2, false],
      [3, true],
      [8, true],
      [12, true],
      [13, false],
      [15, false],
    ] as const) {
      setSelectionRange(input, caret, caret)
      updateDateLikeUnderline(input)
      expect(marked(input), `caret ${caret}`).toBe(hidden)
    }
    input.remove()
  })
  it('treats a one-character Normal block as the caret before that character', () => {
    const input = editor('ab 2026-10-1 cd')
    input.focus()
    for (const [block, hidden] of [
      [1, false],
      [2, false],
      [3, true],
      [11, true],
      [12, true],
      [13, false],
    ] as const) {
      setSelectionRange(input, block, block + 1)
      updateDateLikeUnderline(input)
      expect(marked(input), `block ${block}`).toBe(hidden)
    }
    input.remove()
  })
  it('hides the token when a selection overlaps or touches it', () => {
    const input = editor('ab 2026-10-1 cd')
    input.focus()
    setSelectionRange(input, 0, 3)
    updateDateLikeUnderline(input)
    expect(marked(input)).toBe(true)
    setSelectionRange(input, 0, 2)
    updateDateLikeUnderline(input)
    expect(marked(input)).toBe(false)
    input.remove()
  })
  it('shows the underline again when focus leaves', () => {
    const input = editor('2026-10-1')
    input.focus()
    setSelectionRange(input, 4, 4)
    updateDateLikeUnderline(input)
    expect(marked(input)).toBe(true)
    input.blur()
    updateDateLikeUnderline(input)
    expect(marked(input)).toBe(false)
    input.remove()
  })
})
