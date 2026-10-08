import { describe, expect, it } from 'vitest'
import { moveDayEdits, newDatedNodeText, nextActiveDay, splitDatePrefix } from './agenda-date-edits'
import { dayNumberOf } from './calendar-date'
import { replaceLinkedTextRanges } from './document-links'

const day = (value: number) => dayNumberOf({ year: 2026, month: 10, day: value })
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
    expect(splitDatePrefix(' release', day(14))).toBe('2026-10-14 release')
    expect(splitDatePrefix('\t  release', day(14))).toBe('2026-10-14 release')
    expect(splitDatePrefix('', day(14))).toBe('2026-10-14 ')
    expect(splitDatePrefix(' 2026-10-14 release', day(14))).toBe(' 2026-10-14 release')
    expect(splitDatePrefix('2026-10-20 QA', day(14))).toBe('2026-10-14 2026-10-20 QA')
    expect(splitDatePrefix('12026-10-14', day(14))).toBe('2026-10-14 12026-10-14')
  })

  it('selects the nearest remaining day, earlier on ties, with no ordering assumption', () => {
    expect(nextActiveDay([], day(14))).toBeUndefined()
    expect(nextActiveDay([day(20), day(15), day(13)], day(14))).toBe(day(13))
    expect(nextActiveDay([day(13), day(15)], day(14))).toBe(day(13))
    expect(nextActiveDay(new Set([day(20), day(14), day(10)]), day(14))).toBe(day(14))
    expect(nextActiveDay([day(20)], day(14))).toBe(day(20))
  })
})
