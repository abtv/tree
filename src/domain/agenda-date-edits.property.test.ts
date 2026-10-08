import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { moveDayEdits, nextActiveDay, splitDatePrefix } from './agenda-date-edits'
import { calendarDateOf, formatCanonicalDate } from './calendar-date'
import { findCanonicalDates } from './date-recognition'
import { replaceLinkedTextRanges } from './document-links'

const days = fc.integer({ min: 0, max: 30000 })
const canonical = (day: number) => formatCanonicalDate(calendarDateOf(day))

it('moves only source and duplicate target tokens and retains every other day and link', () => {
  fc.assert(
    fc.property(days, days, fc.array(days, { maxLength: 30 }), (source, target, others) => {
      const url = `https://example.com/${canonical(source)}`
      const tokens = [...others, source, target, source]
      const text = `${url} ${tokens.map((day) => `${canonical(day)} word`).join(' ')} ${url}`
      const links = [
        { start: 0, end: url.length, url },
        { start: text.length - url.length, end: text.length, url },
      ]
      const edits = moveDayEdits(text, links, source, target)
      for (let index = 0; index < edits.length; index++) {
        const edit = edits[index]!
        expect(edit.start).toBeGreaterThanOrEqual(index === 0 ? 0 : edits[index - 1]!.end)
        expect([canonical(source), canonical(target)]).toContain(text.slice(edit.start, edit.end).trim())
      }
      const result = replaceLinkedTextRanges(text, links, edits)
      const expected = new Set(tokens)
      if (source !== target) expected.delete(source)
      expected.add(target)
      expect(new Set(findCanonicalDates(result.text, result.links).map((match) => match.day))).toEqual(expected)
      expect(result.text.match(/word/g)).toHaveLength(tokens.length)
      const beforeOthers = findCanonicalDates(text, links).filter(
        (match) => match.day !== source && match.day !== target,
      )
      const afterOthers = findCanonicalDates(result.text, result.links).filter(
        (match) => match.day !== source && match.day !== target,
      )
      expect(afterOthers.map((match) => match.day)).toEqual(beforeOthers.map((match) => match.day))
      expect(result.links.map((link) => result.text.slice(link.start, link.end))).toEqual([url, url])
      if (source !== target)
        expect(findCanonicalDates(result.text, result.links).filter((match) => match.day === target)).toHaveLength(1)
      expect(links[1]!.start).toBe(text.length - url.length)
    }),
    { numRuns: propertyRuns(300) },
  )
})

it('selects the closest day and the earliest equal-distance candidate', () => {
  fc.assert(
    fc.property(fc.array(days), days, (remaining, previous) => {
      const expected = [...remaining].sort((a, b) => Math.abs(a - previous) - Math.abs(b - previous) || a - b)[0]
      expect(nextActiveDay(remaining, previous)).toBe(expected)
    }),
    { numRuns: propertyRuns(300) },
  )
})

it('inherits the displayed date once and preserves the right-side content', () => {
  fc.assert(
    fc.property(days, days, fc.constantFrom('', ' ', '\t  ', '\n'), (day, other, whitespace) => {
      const right = `${whitespace}${canonical(other)} content`
      const result = splitDatePrefix(right, day)
      expect(result).toBe(day === other ? right : `${canonical(day)} ${right.trimStart()}`)
      expect(splitDatePrefix(result, day)).toBe(result)
    }),
    { numRuns: propertyRuns(300) },
  )
})
