import { useEffect, useRef } from 'react'
import type { ApplicationCommand, CommandContext } from '../application/command-registry'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'

export function CommandPanel({
  matches,
  selected,
  context,
  run,
  shortcuts = APPLE_SHORTCUTS,
}: {
  matches: readonly ApplicationCommand[]
  selected: number
  context: CommandContext
  run(command: ApplicationCommand): void
  shortcuts?: ShortcutProfile
}): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    panel.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, matches])
  return (
    <div className="command-panel" role="listbox" aria-label="Application commands" id="command-panel" ref={panel}>
      {matches.map((command, index) => (
        <div
          key={command.name}
          id={`command-${command.name}`}
          role="option"
          aria-selected={index === selected}
          className={`command-row${index === selected ? ' command-row-selected' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => run(command)}
        >
          <span className="command-name">{command.name}</span>
          <span className="command-description">{command.description}</span>
          <span className="command-state">{command.active(context) ? '✓' : ''}</span>
          <span className="command-shortcut">
            {command.shortcut === undefined ? '' : shortcuts.format(command.shortcut)}
          </span>
        </div>
      ))}
    </div>
  )
}
