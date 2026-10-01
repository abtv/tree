import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { isHttpUrl, replaceLinkedTextRanges, type LinkedTextEdit } from './document-links'
import type { LinkRange } from './document-types'
import { propertyRuns } from '../test/property-runs'

/** Apply disjoint edits independently of the implementation under test. */
function referenceText(text: string, edits: readonly LinkedTextEdit[]): string {
  let output = ''
  let consumed = 0
  for (const edit of [...edits].sort((a, b) => a.start - b.start)) {
    output += text.slice(consumed, edit.start) + edit.inserted
    consumed = edit.end
  }
  return output + text.slice(consumed)
}

/** A text, a link inside it, and non-overlapping edits over it. */
const scenario = fc
  .tuple(fc.string({ maxLength: 20 }), fc.webUrl(), fc.string({ maxLength: 20 }))
  .filter(([, url]) => isHttpUrl(url))
  .chain(([before, url, after]) => {
    const text = `${before} ${url} ${after}`
    const link: LinkRange = { start: before.length + 1, end: before.length + 1 + url.length, url }
    return fc
      .array(fc.tuple(fc.nat(text.length), fc.nat(3), fc.string({ maxLength: 3 })), { maxLength: 3 })
      .map((raw) => {
        const edits: LinkedTextEdit[] = []
        let next = 0
        for (const [offset, span, inserted] of [...raw].sort((a, b) => a[0] - b[0])) {
          const start = Math.max(next, Math.min(offset, text.length))
          const end = Math.min(text.length, start + span)
          edits.push({ start, end, inserted })
          next = end
        }
        return { text, link, edits }
      })
  })

describe('replaceLinkedTextRanges invariants', () => {
  it('preserves every link between disjoint edits to the surrounding ordinary text', () => {
    fc.assert(
      fc.property(
        fc.webUrl().filter(isHttpUrl),
        fc.webUrl().filter(isHttpUrl),
        fc.string({ maxLength: 12 }),
        fc.string({ maxLength: 12 }),
        (first, second, prefix, suffix) => {
          const text = `old ${first} ${second} end`
          const firstStart = 4
          const secondStart = firstStart + first.length + 1
          const result = replaceLinkedTextRanges(
            text,
            [
              { start: firstStart, end: firstStart + first.length, url: first },
              { start: secondStart, end: secondStart + second.length, url: second },
            ],
            [
              { start: text.length - 3, end: text.length, inserted: suffix },
              { start: 0, end: 3, inserted: prefix },
            ],
          )
          expect(result.text).toBe(`${prefix} ${first} ${second} ${suffix}`)
          // Surrounding text is separated by spaces, so these two original ranges
          // stay links regardless of whether either replacement also forms a URL.
          expect(result.links).toEqual(
            expect.arrayContaining([
              { start: prefix.length + 1, end: prefix.length + 1 + first.length, url: first },
              {
                start: prefix.length + first.length + 2,
                end: prefix.length + first.length + 2 + second.length,
                url: second,
              },
            ]),
          )
        },
      ),
      { numRuns: propertyRuns(100) },
    )
  })

  it('produces the referenced text and only well-formed, ordered links', () => {
    fc.assert(
      fc.property(scenario, ({ text, link, edits }) => {
        const result = replaceLinkedTextRanges(text, [link], edits)
        expect(result.text).toBe(referenceText(text, edits))
        let previousEnd = 0
        for (const current of result.links) {
          expect(current.start).toBeGreaterThanOrEqual(previousEnd)
          expect(current.end).toBeGreaterThan(current.start)
          expect(current.end).toBeLessThanOrEqual(result.text.length)
          expect(result.text.slice(current.start, current.end)).toBe(current.url)
          previousEnd = current.end
        }
      }),
      { numRuns: propertyRuns(300) },
    )
  })

  it('keeps a wrapped link covering the same text', () => {
    fc.assert(
      fc.property(
        fc.webUrl().filter(isHttpUrl),
        fc.string({ maxLength: 6 }),
        fc.string({ maxLength: 6 }),
        (url, before, after) => {
          const text = `${before} ${url} ${after}`
          const start = before.length + 1
          const end = start + url.length
          const result = replaceLinkedTextRanges(
            text,
            [{ start, end, url }],
            [
              { start, end: start, inserted: '[' },
              { start: end, end, inserted: ']' },
            ],
          )
          expect(result.text).toBe(`${before} [${url}] ${after}`)
          expect(result.links).toEqual([{ start: start + 1, end: end + 1, url }])
        },
      ),
      { numRuns: propertyRuns(200) },
    )
  })
})
