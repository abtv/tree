import { StatusToggle } from './StatusToggle'

export function AlwaysOnTopToggle({
  alwaysOnTop,
  onToggle,
}: {
  alwaysOnTop: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <StatusToggle
      active={alwaysOnTop}
      className="always-on-top-toggle"
      label={alwaysOnTop ? 'Unpin window from top' : 'Pin window on top'}
      onToggle={onToggle}
    >
      <PinIcon />
    </StatusToggle>
  )
}

function PinIcon(): React.JSX.Element {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m14 3 7 7-2.2 2.2-2.1-2.1-3.6 3.6v4.2L11 20l-2.7-2.7H4.1l-1.2-1.2 5.1-5.1-2.1-2.1L8.1 6.7 14 3Z" />
      <path d="m11.8 12.2-5.5 5.5" />
    </svg>
  )
}
