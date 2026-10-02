import type { ReactNode } from 'react'

/** A pressed-state button in the status bar with an application-drawn tooltip naming its action. */
export function StatusToggle({
  active,
  label,
  className,
  keepEditorFocus = false,
  onToggle,
  children,
}: {
  active: boolean
  label: string
  className: string
  /** Leaves keyboard focus and the caret in the editor when the toggle is clicked. */
  keepEditorFocus?: boolean
  onToggle: () => void
  children: ReactNode
}): React.JSX.Element {
  // Electron does not show native `title` tooltips here, so the label is rendered as a CSS tooltip.
  return (
    <span className="status-tooltip-anchor">
      <button
        aria-pressed={active}
        aria-label={label}
        className={active ? `${className} ${className}-active` : className}
        onClick={onToggle}
        onMouseDown={keepEditorFocus ? (event) => event.preventDefault() : undefined}
        type="button"
      >
        {children}
      </button>
      <span aria-hidden="true" className="status-tooltip">
        {label}
      </span>
    </span>
  )
}
