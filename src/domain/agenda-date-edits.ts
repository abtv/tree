import type { DayNumber } from './calendar-date'

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
