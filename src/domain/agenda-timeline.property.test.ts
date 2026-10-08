import fc from 'fast-check'
import { expect, it } from 'vitest'
import { propertyRuns } from '../test/property-runs'
import { buildTimeline, collapseGap, revealNext, type TimelineEntry } from './agenda-timeline'

// Expanded headers describe a region already represented by their following children.
function covered(entries: readonly TimelineEntry[]): number[] {
  return entries.flatMap((entry) =>
    entry.kind === 'day'
      ? [entry.day]
      : entry.expanded
        ? []
        : Array.from({ length: entry.count }, (_, index) => entry.startDay + index),
  )
}

const dates = fc.uniqueArray(fc.integer({ min: -50, max: 50 }), { maxLength: 30 })

it('represents each date exactly once and always displays the Today neighborhood', () => {
  fc.assert(
    fc.property(dates, dates, fc.integer({ min: -20, max: 20 }), (content, revealed, today) => {
      const entries = buildTimeline({ contentDays: new Set(content), revealed: new Set(revealed), today })
      const start = Math.min(today - 3, ...content)
      const end = Math.max(today + 3, ...content)
      expect(covered(entries)).toEqual(Array.from({ length: end - start + 1 }, (_, index) => start + index))
      for (let day = today - 3; day <= today + 3; day++) {
        expect(entries).toContainEqual({ kind: 'day', day, content: content.includes(day), isToday: day === today })
      }
      for (const entry of entries) {
        if (entry.kind === 'gap') {
          expect(entry.count).toBeGreaterThanOrEqual(3)
          expect(entry.count).toBe(entry.endDay - entry.startDay + 1)
          expect(content.some((day) => day >= entry.startDay && day <= entry.endDay)).toBe(false)
        } else {
          expect(entry.content).toBe(content.includes(entry.day))
          expect(entry.isToday).toBe(entry.day === today)
        }
      }
    }),
    { numRuns: propertyRuns(300) },
  )
})

it('reveals at most seven consecutive days and collapse restores the initial timeline', () => {
  fc.assert(
    fc.property(dates, (content) => {
      const input = { contentDays: new Set(content), today: 0, revealed: new Set<number>() }
      const original = buildTimeline(input)
      for (const entry of original) {
        if (entry.kind !== 'gap') continue
        const revealed = revealNext(input.revealed, entry)
        expect([...revealed]).toEqual(
          Array.from({ length: Math.min(7, entry.count) }, (_, index) => entry.startDay + index),
        )
        expect(buildTimeline({ ...input, revealed: collapseGap(revealed, entry) })).toEqual(original)
        expect(input.revealed.size).toBe(0)
      }
    }),
    { numRuns: propertyRuns(300) },
  )
})

it('new content splits only its containing interval and preserves revealed dates', () => {
  fc.assert(
    fc.property(dates, dates, fc.integer({ min: -50, max: 50 }), (content, revealedDays, added) => {
      const input = { contentDays: new Set(content), today: 0, revealed: new Set(revealedDays) }
      const original = buildTimeline(input)
      const containing = original.find(
        (entry) => entry.kind === 'gap' && added >= entry.startDay && added <= entry.endDay,
      )
      const next = buildTimeline({ ...input, contentDays: new Set([...content, added]) })
      expect(next).toContainEqual({ kind: 'day', day: added, content: true, isToday: added === 0 })
      for (const entry of original) {
        if (entry.kind !== 'gap' || containing?.kind !== 'gap') continue
        if (entry.endDay < containing.startDay || entry.startDay > containing.endDay) expect(next).toContainEqual(entry)
      }
      for (const entry of original) {
        if (entry.kind === 'day' && input.revealed.has(entry.day))
          expect(next.some((row) => row.kind === 'day' && row.day === entry.day)).toBe(true)
      }
      expect(input.revealed).toEqual(new Set(revealedDays))
    }),
    { numRuns: propertyRuns(300) },
  )
})
