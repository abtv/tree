import type { AgendaState } from '../application/agenda-state'
import { agendaDateLabel } from './agenda-labels'

export function AgendaLocationBar({ agenda }: { agenda: AgendaState }): React.JSX.Element {
  return (
    <header className="location-bar agenda-location-bar" aria-label="Current location">
      <span className="location-icon" role="img" aria-label="Agenda" title="Agenda">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4m8-4v4M4 10h16m-12 4h2m4 0h2m-8 3h2" />
        </svg>
      </span>
      {agenda.focusedDay !== undefined && (
        <>
          <span className="location-separator">›</span>
          <span className="location-current">{agendaDateLabel(agenda.focusedDay, agenda.today)}</span>
        </>
      )}
    </header>
  )
}
