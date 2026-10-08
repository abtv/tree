import { describe, expect, it } from 'vitest'
import { buildTimeline, collapseGap, revealNext, type TimelineGap } from './agenda-timeline'
import { dayNumberOf } from './calendar-date'

const today = dayNumberOf({ year: 2026, month: 10, day: 8 })
const oct = (day: number) => today + day - 8
const gap = (start: number, end: number, expanded = false): TimelineGap => ({
  kind: 'gap',
  startDay: oct(start),
  endDay: oct(end),
  count: end - start + 1,
  expanded,
})
const build = (dates: number[], revealed: ReadonlySet<number> = new Set()) =>
  buildTimeline({ today, contentDays: new Set(dates.map(oct)), revealed })

describe('compressed Agenda timeline', () => {
  it('shows Oct 5–11 even without content and marks only Today', () => {
    expect(build([])).toEqual(
      Array.from({ length: 7 }, (_, index) => ({
        kind: 'day',
        day: oct(index + 5),
        content: false,
        isToday: index === 3,
      })),
    )
  })

  it('compresses eleven empty days and keeps two empty days as headers', () => {
    const entries = build([26, 23, 8, 23])
    expect(entries.slice(7)).toEqual([
      gap(12, 22),
      { kind: 'day', day: oct(23), content: true, isToday: false },
      { kind: 'day', day: oct(24), content: false, isToday: false },
      { kind: 'day', day: oct(25), content: false, isToday: false },
      { kind: 'day', day: oct(26), content: true, isToday: false },
    ])
    expect(entries[3]).toEqual({ kind: 'day', day: today, content: true, isToday: true })
  })

  it('retains the original header, reveals seven days, and leaves a four-day gap', () => {
    const initial = new Set<number>([oct(1), oct(30)])
    const revealed = revealNext(initial, gap(12, 22))
    expect(initial).toEqual(new Set([oct(1), oct(30)]))
    expect(build([23], revealed).slice(7)).toEqual([
      gap(12, 22, true),
      ...Array.from({ length: 7 }, (_, index) => ({
        kind: 'day',
        day: oct(12 + index),
        content: false,
        isToday: false,
      })),
      gap(19, 22),
      { kind: 'day', day: oct(23), content: true, isToday: false },
    ])
    const all = revealNext(revealed, gap(19, 22))
    expect([...all].filter((day) => day >= oct(12) && day <= oct(22))).toHaveLength(11)
    expect(build([23], all).filter((entry) => entry.kind === 'gap')).toEqual([gap(12, 22, true)])
    expect(collapseGap(all, gap(12, 22, true))).toEqual(initial)
    expect(all.size).toBe(13)
  })

  it('handles a three-day gap, a one-day run, and short remainders', () => {
    expect(
      build([15, 17])
        .slice(7)
        .map((entry) => entry.kind),
    ).toEqual(['gap', 'day', 'day', 'day'])
    const revealed = revealNext(new Set(), gap(12, 20))
    expect(build([21], revealed).slice(-3)).toEqual([
      { kind: 'day', day: oct(19), content: false, isToday: false },
      { kind: 'day', day: oct(20), content: false, isToday: false },
      { kind: 'day', day: oct(21), content: true, isToday: false },
    ])
    expect(revealNext(new Set(), gap(12, 14))).toEqual(new Set([oct(12), oct(13), oct(14)]))
  })

  it('splits an expanded interval at new content without forgetting revealed dates', () => {
    const revealed = new Set([oct(13), oct(20), oct(40)])
    expect(build([23, 16], revealed).filter((entry) => entry.kind === 'gap')).toEqual([
      gap(12, 15, true),
      gap(17, 22, true),
      gap(17, 19),
    ])
    expect(collapseGap(revealed, gap(12, 15, true))).toEqual(new Set([oct(20), oct(40)]))
  })

  it('compresses distant dates without allocating a day for every date in the interval', () => {
    const entries = buildTimeline({ today: 0, contentDays: new Set([-1_000_000, 1_000_000]), revealed: new Set() })
    expect(entries).toHaveLength(11)
    expect(entries[1]).toEqual({ kind: 'gap', startDay: -999999, endDay: -4, count: 999996, expanded: false })
  })
})
