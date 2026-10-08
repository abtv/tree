import type { CSSProperties, ReactNode } from 'react'
import type { AgendaRow as Row } from '../application/agenda-rows'
import type { TreeNode } from '../domain/document'
import { findCanonicalDates } from '../domain/date-recognition'
import { agendaDateLabel, agendaGapLabel } from './agenda-labels'

function datedText(node: TreeNode, day: number): ReactNode[] {
  const parts: ReactNode[] = []
  let start = 0
  for (const date of findCanonicalDates(node.text, node.links)) {
    parts.push(node.text.slice(start, date.start))
    parts.push(
      <span key={date.start} className={date.day === day ? 'agenda-date-active' : 'agenda-date-secondary'}>
        {node.text.slice(date.start, date.end)}
      </span>,
    )
    start = date.end
  }
  parts.push(node.text.slice(start))
  return parts
}

export function AgendaRow({
  row,
  node,
  today,
  selected,
  rowRef,
  onSelect,
}: {
  row: Row
  node?: TreeNode | undefined
  today: number
  selected: boolean
  rowRef: (key: string, element: HTMLDivElement | null) => void
  onSelect: (key: string) => void
}): React.JSX.Element {
  const depth = row.kind === 'node' ? row.depth + 1 : 0
  return (
    <div
      className={`agenda-row agenda-row-${row.kind}${row.kind === 'node' ? ` agenda-role-${row.role}` : ''}${row.kind === 'day' && row.isToday ? ' agenda-today' : ''}`}
      data-agenda-key={row.key}
      data-depth={depth}
      data-node-id={row.kind === 'node' ? row.nodeId : undefined}
      aria-selected={selected}
      role="row"
      tabIndex={selected ? 0 : -1}
      ref={(element) => rowRef(row.key, element)}
      onClick={() => onSelect(row.key)}
      onFocus={() => {
        if (!selected) onSelect(row.key)
      }}
      style={{ '--row-depth': depth } as CSSProperties}
    >
      {selected ? <span aria-hidden="true" className="node-focus-marker" /> : null}
      {row.kind === 'gap' ||
      (row.kind === 'day' && row.content) ||
      (row.kind === 'node' && row.hasProjectedChildren) ? (
        <span aria-hidden="true" className="node-disclosure-triangle" aria-expanded={row.kind !== 'gap'} />
      ) : null}
      {row.kind === 'node' ? (
        <>
          <span
            aria-hidden="true"
            className={`node-enter-control${node!.children.length > 0 ? ' node-enter-control-has-children' : ''}`}
          />
          <span className={`agenda-text${node!.struckThrough ? ' agenda-text-struck' : ''}`}>
            {datedText(node!, row.day)}
          </span>
        </>
      ) : (
        <>
          <span className={`agenda-label${row.kind === 'day' && !row.content ? ' agenda-label-empty' : ''}`}>
            {row.kind === 'day'
              ? `${agendaDateLabel(row.day, today, true)}${row.isToday ? ' · TODAY' : ''}`
              : agendaGapLabel(row.startDay, row.endDay, today)}
          </span>
          <span aria-hidden="true" className="agenda-rule" />
        </>
      )}
    </div>
  )
}
