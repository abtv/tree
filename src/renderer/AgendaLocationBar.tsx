import type { AgendaState } from '../application/agenda-state'
import { agendaDateLabel } from './agenda-labels'

export function AgendaLocationBar({ agenda }: { agenda: AgendaState }): React.JSX.Element {
  return (
    <header className="location-bar agenda-location-bar" aria-label="Current location">
      <span className="location-current">Agenda</span>
      {agenda.focusedDay !== undefined && (
        <>
          <span className="location-separator">/</span>
          <span className="location-current">{agendaDateLabel(agenda.focusedDay, agenda.today)}</span>
        </>
      )}
    </header>
  )
}
