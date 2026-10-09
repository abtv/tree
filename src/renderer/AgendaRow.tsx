import { memo, useCallback, type CSSProperties, type ReactNode } from 'react'
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

export const AgendaRow = memo(function AgendaRow({
  row,
  node,
  today,
  selected,
  expanded,
  pinned = false,
  pinnedOffset = 0,
  mirror = false,
  rowRef,
  onSelect,
  onToggle,
  renderInput,
  renderAttachment,
  renderText,
}: {
  row: Row
  node?: TreeNode | undefined
  today: number
  selected: boolean
  expanded: boolean
  pinned?: boolean
  pinnedOffset?: number
  mirror?: boolean
  rowRef: (key: string, element: HTMLDivElement | null) => void
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  renderInput?: ((node: TreeNode, day: number) => ReactNode) | undefined
  renderAttachment?: ((node: TreeNode, editable: boolean) => ReactNode) | undefined
  renderText?: ((node: TreeNode, day: number) => ReactNode) | undefined
}): React.JSX.Element {
  const depth = row.kind === 'node' ? row.depth + 1 : 0
  const ref = useCallback((element: HTMLDivElement | null) => rowRef(row.key, element), [row.key, rowRef])
  return (
    <div
      className={`agenda-row agenda-row-${row.kind}${row.kind === 'node' ? ` agenda-role-${row.role}` : ''}${row.kind === 'day' && row.isToday ? ' agenda-today' : ''}${pinned ? ' agenda-row-pinned' : ''}${mirror ? ' agenda-mirror' : ''}`}
      data-agenda-key={row.key}
      data-depth={depth}
      data-node-id={row.kind === 'node' ? row.nodeId : undefined}
      data-has-attachment={row.kind === 'node' && node?.attachment !== undefined}
      aria-selected={selected}
      role="row"
      tabIndex={selected ? 0 : -1}
      ref={ref}
      onClick={(event) => {
        if (!selected && !(event.target instanceof Element && event.target.closest('.node-input'))) onSelect(row.key)
      }}
      onFocus={(event) => {
        if (event.target !== event.currentTarget && renderInput !== undefined) return
        if (!selected) onSelect(row.key)
      }}
      style={{ '--row-depth': depth, ...(pinned ? { top: pinnedOffset } : {}) } as CSSProperties}
    >
      {selected ? <span aria-hidden="true" className="node-focus-marker" /> : null}
      {row.kind === 'gap' ||
      (row.kind === 'day' && row.content) ||
      (row.kind === 'node' && row.hasProjectedChildren) ? (
        <button
          className="node-disclosure-triangle"
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.kind === 'node' ? node!.text : row.kind === 'day' ? agendaDateLabel(row.day, today, true) : agendaGapLabel(row.startDay, row.endDay, today)}`}
          tabIndex={-1}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            onToggle(row.key)
          }}
        />
      ) : null}
      {row.kind === 'node' ? (
        <>
          <span
            aria-hidden="true"
            className={`node-enter-control${node!.children.length > 0 ? ' node-enter-control-has-children' : ''}`}
          />
          {renderInput === undefined ? (
            row.role === 'match' && renderText !== undefined ? (
              renderText(node!, row.day)
            ) : (
              <span className={`agenda-text${node!.struckThrough ? ' agenda-text-struck' : ''}`}>
                {datedText(node!, row.day)}
              </span>
            )
          ) : (
            renderInput(node!, row.day)
          )}
          {row.role === 'match' ? renderAttachment?.(node!, renderInput !== undefined) : null}
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
})
