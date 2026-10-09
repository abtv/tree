import { calendarDateOf, formatCanonicalDate, type DayNumber } from './calendar-date'
import { findCanonicalDates } from './date-recognition'
import type { LinkedTextEdit } from './document-links'
import type { LinkRange } from './document-types'

export function newDatedNodeText(day: DayNumber): string {
  return `${formatCanonicalDate(calendarDateOf(day))} `
}

/** Disjoint edits in original-text coordinates, ready for replaceLinkedTextRanges. */
export function moveDayEdits(
  text: string,
  links: readonly LinkRange[],
  sourceDay: DayNumber,
  targetDay: DayNumber,
): LinkedTextEdit[] {
  if (sourceDay === targetDay) return []
  const dates = findCanonicalDates(text, links)
  const firstSource = dates.find((date) => date.day === sourceDay)
  if (firstSource === undefined) return []
  const edits: LinkedTextEdit[] = []
  for (const date of dates) {
    if (date.day !== sourceDay && date.day !== targetDay) continue
    if (date === firstSource) {
      edits.push({ start: date.start, end: date.end, inserted: formatCanonicalDate(calendarDateOf(targetDay)) })
      continue
    }
    let { start, end } = date
    // Prefer the preceding space; never consume text or overlap the preceding edit.
    if (text[start - 1] === ' ' && start - 1 >= (edits.at(-1)?.end ?? 0)) start--
    else if (text[end] === ' ') end++
    edits.push({ start, end, inserted: '' })
  }
  return edits
}

/**
 * The edit that gives the right part of a split the displayed day's date (m17): its leading whitespace
 * becomes the single space after the inserted date. `undefined` when the part already contains the day.
 */
export function splitDateEdit(
  rightText: string,
  links: readonly LinkRange[],
  day: DayNumber,
): LinkedTextEdit | undefined {
  if (findCanonicalDates(rightText, links).some((date) => date.day === day)) return undefined
  return { start: 0, end: rightText.length - rightText.trimStart().length, inserted: newDatedNodeText(day) }
}

export function nextActiveDay(remainingDays: Iterable<DayNumber>, previousActive: DayNumber): DayNumber | undefined {
  let nearest: DayNumber | undefined
  for (const day of remainingDays) {
    // Replacing the final strict tie comparison with <= is equivalent: choosing
    // the same numeric day again does not change the result.
    if (
      nearest === undefined ||
      Math.abs(day - previousActive) < Math.abs(nearest - previousActive) ||
      (Math.abs(day - previousActive) === Math.abs(nearest - previousActive) && day < nearest)
    ) {
      nearest = day
    }
  }
  return nearest
}
