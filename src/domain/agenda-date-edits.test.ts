import { describe, expect, it } from 'vitest'
import { moveDayEdits, newDatedNodeText, nextActiveDay, splitDateEdit } from './agenda-date-edits'
import { dayNumberOf } from './calendar-date'
import { replaceLinkedTextRanges } from './document-links'

const day = (value: number) => dayNumberOf({ year: 2026, month: 10, day: value })
const split = (text: string) => {
  const edit = splitDateEdit(text, [], day(14))
  return edit === undefined ? text : replaceLinkedTextRanges(text, [], [edit]).text
}
const move = (text: string) => replaceLinkedTextRanges(text, [], moveDayEdits(text, [], day(14), day(15))).text

describe('Agenda date text transforms', () => {
  it.each([
    ['2026-10-14 Prepare release', '2026-10-15 Prepare release'],
    ['2026-10-14 Prepare 2026-10-20', '2026-10-15 Prepare 2026-10-20'],
    ['2026-10-14 Prepare 2026-10-15', '2026-10-15 Prepare'],
    ['2026-10-14 Release', '2026-10-15 Release'],
    ['2026-10-15 Prepare 2026-10-14', 'Prepare 2026-10-15'],
    ['2026-10-14 2026-10-14 2026-10-15', '2026-10-15'],
    ['2026-10-14,2026-10-14!', '2026-10-15,!'],
    ['2026-10-20 QA', '2026-10-20 QA'],
    ['2026-10-15 Prepare', '2026-10-15 Prepare'],
    [' 2026-10-15 2026-10-14', ' 2026-10-15'],
    ['2026-10-15 2026-10-15 2026-10-14', '2026-10-15'],
    ['2026-10-14 2026-10-15 2026-10-15', '2026-10-15'],
    ['2026-02-31 12026-10-14', '2026-02-31 12026-10-14'],
  ])('moves only source and duplicate target tokens in %s', (text, expected) => {
    expect(move(text)).toBe(expected)
  })

  it('leaves a move to the same day unchanged', () => {
    expect(moveDayEdits('2026-10-14 2026-10-14', [], day(14), day(14))).toEqual([])
  })

  it('preserves links before, between, and after edits, including dates in URLs', () => {
    const url = 'https://example.com/2026-10-14'
    const text = `${url} 2026-10-14 ${url} 2026-10-15 ${url}`
    const links = [...text.matchAll(/https:\/\/\S+/g)].map((match) => ({
      start: match.index,
      end: match.index + url.length,
      url,
    }))
    const result = replaceLinkedTextRanges(text, links, moveDayEdits(text, links, day(14), day(15)))
    expect(result.text).toBe(`${url} 2026-10-15 ${url} ${url}`)
    expect(result.links).toHaveLength(3)
    for (const link of result.links) expect(result.text.slice(link.start, link.end)).toBe(url)
    expect(moveDayEdits(url, [links[0]!], day(14), day(15))).toEqual([])
  })

  it('creates dated text with the caret space and inherits only the displayed date', () => {
    expect(newDatedNodeText(day(14))).toBe('2026-10-14 ')
    expect(split(' release')).toBe('2026-10-14 release')
    expect(split('\t  release')).toBe('2026-10-14 release')
    expect(split('')).toBe('2026-10-14 ')
    expect(split(' 2026-10-14 release')).toBe(' 2026-10-14 release')
    expect(split('2026-10-20 QA')).toBe('2026-10-14 2026-10-20 QA')
    expect(split('12026-10-14')).toBe('2026-10-14 12026-10-14')
  })

  it('treats a date inside a hyperlink as absent and keeps link offsets behind the inserted date', () => {
    const url = 'https://example.com/2026-10-14'
    const links = [{ start: 1, end: 1 + url.length, url }]
    const edit = splitDateEdit(` ${url}`, links, day(14))
    expect(edit).toEqual({ start: 0, end: 1, inserted: '2026-10-14 ' })
    const result = replaceLinkedTextRanges(` ${url}`, links, [edit!])
    expect(result.text).toBe(`2026-10-14 ${url}`)
    expect(result.links).toEqual([{ start: 11, end: 11 + url.length, url }])
  })

  it('selects the nearest remaining day, earlier on ties, with no ordering assumption', () => {
    expect(nextActiveDay([], day(14))).toBeUndefined()
    expect(nextActiveDay([day(20), day(15), day(13)], day(14))).toBe(day(13))
    expect(nextActiveDay([day(13), day(15)], day(14))).toBe(day(13))
    expect(nextActiveDay(new Set([day(20), day(14), day(10)]), day(14))).toBe(day(14))
    expect(nextActiveDay([day(20)], day(14))).toBe(day(20))
  })
})
