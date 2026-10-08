import type { DayNumber } from './calendar-date'

export interface TimelineDay {
  readonly kind: 'day'
  readonly day: DayNumber
  readonly content: boolean
  readonly isToday: boolean
}

export interface TimelineGap {
  readonly kind: 'gap'
  readonly startDay: DayNumber
  readonly endDay: DayNumber
  readonly count: number
  readonly expanded: boolean
}

export type TimelineEntry = TimelineDay | TimelineGap

export interface TimelineInput {
  readonly contentDays: ReadonlySet<DayNumber>
  readonly today: DayNumber
  readonly revealed: ReadonlySet<DayNumber>
}

/** Finite timeline; expanded headers describe their children, not additional dates. */
export function buildTimeline({ contentDays, today, revealed }: TimelineInput): readonly TimelineEntry[] {
  const anchors = new Set(contentDays)
  for (let day = today - 3; day <= today + 3; day++) anchors.add(day)
  const ordered = [...anchors].sort((a, b) => a - b)
  const revealedDays = [...revealed].sort((a, b) => a - b)
  const entries: TimelineEntry[] = []
  const appendDay = (day: DayNumber): void => {
    entries.push({ kind: 'day', day, content: contentDays.has(day), isToday: day === today })
  }
  const appendRun = (startDay: DayNumber, endDay: DayNumber, expanded: boolean): void => {
    const count = endDay - startDay + 1
    if (count >= 3) entries.push({ kind: 'gap', startDay, endDay, count, expanded })
    else for (let day = startDay; day <= endDay; day++) appendDay(day)
  }
  let revealedIndex = 0
  for (let index = 0; index < ordered.length; index++) {
    const day = ordered[index]!
    if (index > 0) {
      const start = ordered[index - 1]! + 1
      const end = day - 1
      while (revealedIndex < revealedDays.length && revealedDays[revealedIndex]! < start) revealedIndex++
      const first = revealedIndex
      while (revealedIndex < revealedDays.length && revealedDays[revealedIndex]! <= end) revealedIndex++
      const expanded = revealedIndex > first
      appendRun(start, end, expanded)
      if (expanded && end - start + 1 >= 3) {
        let next = start
        for (let offset = first; offset < revealedIndex; offset++) {
          const shown = revealedDays[offset]!
          appendRun(next, shown - 1, false)
          appendDay(shown)
          next = shown + 1
        }
        appendRun(next, end, false)
      }
    }
    appendDay(day)
  }
  return entries
}

/** Call on a collapsed remainder to reveal the next chunk. */
export function revealNext(revealed: ReadonlySet<DayNumber>, gap: TimelineGap): ReadonlySet<DayNumber> {
  const next = new Set(revealed)
  for (let day = gap.startDay; day <= Math.min(gap.endDay, gap.startDay + 6); day++) next.add(day)
  return next
}

export function collapseGap(revealed: ReadonlySet<DayNumber>, gap: TimelineGap): ReadonlySet<DayNumber> {
  return new Set([...revealed].filter((day) => day < gap.startDay || day > gap.endDay))
}
