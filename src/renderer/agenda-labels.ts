import { calendarDateOf, weekdayOf, type DayNumber } from '../domain/calendar-date'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function agendaDateLabel(day: DayNumber, today: DayNumber, weekday = false): string {
  const date = calendarDateOf(day)
  const year = date.year === calendarDateOf(today).year ? '' : ` ${String(date.year).padStart(4, '0')}`
  return `${weekday ? `${weekdays[weekdayOf(day)]} ` : ''}${months[date.month - 1]} ${date.day}${year}`
}

export function agendaGapLabel(start: DayNumber, end: DayNumber, today: DayNumber): string {
  return `${end - start + 1} empty days · ${agendaDateLabel(start, today)} – ${agendaDateLabel(end, today)}`
}
