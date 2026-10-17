import { useLayoutEffect, useRef } from 'react'
import type { CompletionPopupState } from './completion-controller'
import { placeInViewport } from './completion-popup-placement'

export interface CompletionPopupPresentation {
  readonly popup: CompletionPopupState
  readonly left: number
  readonly top: number
  readonly rowTop: number
}

export function CompletionPopup({
  presentation,
  accept,
}: {
  presentation: CompletionPopupPresentation | undefined
  accept: (index: number) => void
}): React.JSX.Element | null {
  const container = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const element = container.current
    if (presentation === undefined || element === null) return
    const viewportHeight = document.documentElement.clientHeight
    const availableHeight = Math.max(presentation.rowTop, viewportHeight - presentation.top)
    element.style.maxHeight = `${Math.max(0, Math.min(200, availableHeight - 2))}px`
    const { width, height } = element.getBoundingClientRect()
    const placed = placeInViewport(
      presentation,
      { width, height },
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    )
    element.style.left = `${placed.left}px`
    element.style.top = `${placed.top}px`
    const selected = element.querySelector<HTMLElement>('[aria-selected="true"]')
    if (selected !== null) {
      const bottom = selected.offsetTop + selected.offsetHeight
      if (selected.offsetTop < element.scrollTop) element.scrollTop = selected.offsetTop
      else if (bottom > element.scrollTop + element.clientHeight) element.scrollTop = bottom - element.clientHeight
    }
  })
  if (presentation === undefined) return null
  const { popup, left, top } = presentation
  return (
    <div ref={container} className="date-popup" style={{ left, top }}>
      <div role="listbox" aria-label={popup.listLabel}>
        {popup.suggestions.map((suggestion, index) => (
          <div
            key={suggestion.id}
            role="option"
            aria-selected={index === popup.selected}
            className={index === popup.selected ? 'date-popup-selected' : undefined}
            onMouseDown={(event) => {
              if (event.button !== 0) return
              event.preventDefault()
              accept(index)
            }}
          >
            <span>{suggestion.label}</span>
            <span className="date-popup-description">{suggestion.description}</span>
          </div>
        ))}
      </div>
      <div className="date-popup-footer">↑ ↓ select · Enter/Tab accept · Esc dismiss</div>
    </div>
  )
}
