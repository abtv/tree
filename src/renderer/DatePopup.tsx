import { useLayoutEffect, useRef } from 'react'
import { calendarDateOf, formatCanonicalDate, weekdayOf } from '../domain/calendar-date'
import type { DateAssistPopup } from './date-assist'
import { placeInViewport } from './date-popup-placement'

export interface DatePopupPresentation {
  readonly popup: DateAssistPopup
  readonly left: number
  readonly top: number
  readonly rowTop: number
}

export function DatePopup({
  presentation,
  accept,
}: {
  presentation: DatePopupPresentation | undefined
  accept: (index: number) => void
}): React.JSX.Element | null {
  const container = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = container.current
    if (presentation === undefined || element === null) return
    const { width, height } = element.getBoundingClientRect()
    const placed = placeInViewport(
      presentation,
      { width, height },
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    )
    element.style.left = `${placed.left}px`
    element.style.top = `${placed.top}px`
  })
  if (presentation === undefined) return null
  const { popup, left, top } = presentation
  return (
    <div ref={container} className="date-popup" style={{ left, top }}>
      <div role="listbox" aria-label="Date suggestions">
        {popup.suggestions.map((suggestion, index) => (
          <div
            key={suggestion.day}
            role="option"
            aria-selected={index === popup.selected}
            className={index === popup.selected ? 'date-popup-selected' : undefined}
            onMouseDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              accept(index)
            }}
          >
            <span>{formatCanonicalDate(calendarDateOf(suggestion.day))}</span>
            <span className="date-popup-description">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][weekdayOf(suggestion.day)]} · {suggestion.expression}
            </span>
          </div>
        ))}
      </div>
      <div className="date-popup-footer">Tab accept · ⌃N ⌃P</div>
    </div>
  )
}
