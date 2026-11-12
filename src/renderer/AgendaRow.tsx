import { memo, useCallback, type CSSProperties, type ReactNode } from 'react'
import type { AgendaRow as Row } from '../application/agenda-rows'
import type { TreeNode } from '../domain/document'
import { agendaDecorations } from './date-decorations'
import { agendaDateLabel, agendaRowLabel } from './agenda-labels'
import type { CaretMark } from './agenda-row-caret'
import { markedNodes } from './marked-nodes'

function datedText(node: TreeNode, day: number, today: number, marks: readonly CaretMark[]): ReactNode[] {
  const parts: ReactNode[] = []
  let start = 0
  for (const decoration of agendaDecorations(node, day, today)) {
    parts.push(...markedNodes(node.text, start, decoration.start, marks, false))
    parts.push(
      <span key={decoration.start} className={decoration.className}>
        {markedNodes(node.text, decoration.start, decoration.end, marks, false)}
      </span>,
    )
    start = decoration.end
  }
  parts.push(...markedNodes(node.text, start, node.text.length, marks, true))
  return parts
}

const NO_MARKS: readonly CaretMark[] = []

export const AgendaRow = memo(function AgendaRow({
  lineNumber,
  row,
  node,
  today,
  selected,
  expanded,
  pinned = false,
  pinnedOffset = 0,
  mirror = false,
  marks = NO_MARKS,
  caretAtStart = false,
  rowRef,
  onSelect,
  onToggle,
  renderInput,
  renderAttachment,
  renderText,
  pathLabel,
  startsGroup = false,
  startsDay = false,
  separatesDay = false,
}: {
  lineNumber?: number | undefined
  row: Row
  node?: TreeNode | undefined
  today: number
  selected: boolean
  expanded: boolean
  pinned?: boolean
  pinnedOffset?: number
  mirror?: boolean
  /** The caret and selection marks of the selected row when it has no editor. */
  marks?: readonly CaretMark[] | undefined
  caretAtStart?: boolean
  rowRef: (key: string, element: HTMLDivElement | null) => void
  onSelect: (key: string) => void
  onToggle: (key: string) => void
  renderInput?: ((node: TreeNode, day: number) => ReactNode) | undefined
  renderAttachment?: ((node: TreeNode, editable: boolean) => ReactNode) | undefined
  renderText?: ((node: TreeNode, day: number, marks: readonly CaretMark[], context: boolean) => ReactNode) | undefined
  pathLabel?: string | undefined
  startsGroup?: boolean
  startsDay?: boolean
  separatesDay?: boolean
}): React.JSX.Element {
  const depth = row.kind === 'node' ? row.depth + 1 : 0
  const ref = useCallback((element: HTMLDivElement | null) => rowRef(row.key, element), [row.key, rowRef])
  return (
    <div
      className={`agenda-entry agenda-entry-${row.kind}${row.kind === 'day' && row.content ? ' agenda-entry-content' : ''}${startsGroup ? ' agenda-entry-group-start' : ''}${startsDay ? ' agenda-entry-first-in-day' : ''}${separatesDay ? ' agenda-entry-separated' : ''}${pinned ? ' agenda-row-pinned' : ''}`}
      data-agenda-measure-key={row.key}
      style={pinned ? { top: pinnedOffset } : undefined}
    >
      {separatesDay ? <span aria-hidden="true" className="agenda-day-separator" /> : null}
      {pathLabel === undefined ? null : <div className="agenda-path-label">{pathLabel}</div>}
      <div
        className={`agenda-row agenda-row-${row.kind}${row.kind === 'node' ? ` agenda-role-${row.role}` : ''}${row.kind === 'day' && row.isToday ? ' agenda-today' : ''}${mirror ? ' agenda-mirror' : ''}`}
        data-agenda-key={row.key}
        data-caret-end={caretAtStart ? 'start' : 'end'}
        data-depth={depth}
        data-node-id={row.kind === 'node' ? row.nodeId : undefined}
        data-has-attachment={row.kind === 'node' && node?.attachment !== undefined}
        aria-selected={selected}
        aria-current={row.kind === 'day' && row.isToday ? 'date' : undefined}
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
        style={{ '--row-depth': 0 } as CSSProperties}
      >
        {selected ? <span aria-hidden="true" className="node-focus-marker" /> : null}
        {lineNumber === undefined ? null : (
          <span aria-hidden="true" className="line-number">
            {lineNumber}
          </span>
        )}
        {row.kind === 'day' && row.content ? (
          <button
            className="node-disclosure-triangle"
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${agendaDateLabel(row.day, today, true)}`}
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
              renderText !== undefined ? (
                renderText(node!, row.day, marks, false)
              ) : (
                <span className={`agenda-text${node!.struckThrough ? ' agenda-text-struck' : ''}`}>
                  {datedText(node!, row.day, today, marks)}
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
              {markedNodes(agendaRowLabel(row, today), 0, agendaRowLabel(row, today).length, marks, true)}
            </span>
            {row.kind === 'day' && row.isToday && row.content ? (
              <span aria-hidden="true" className="agenda-today-badge">
                Today
              </span>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
})
