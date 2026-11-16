import { memo, useCallback, type CSSProperties, type ReactNode } from 'react'
import type { AgendaRow as Row } from '../application/agenda-rows'
import type { AgendaPath } from '../application/agenda-path'
import type { TreeNode } from '../domain/document'
import { agendaDecorations } from './date-decorations'
import { agendaRowLabel } from './agenda-labels'
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

function pathText(path: AgendaPath, marks: readonly CaretMark[]): ReactNode[] {
  const parts: ReactNode[] = []
  let start = 0
  for (const range of path.struckMatches) {
    parts.push(...markedNodes(path.text, start, range.start, marks, false))
    parts.push(
      <span key={range.start} className="node-text-struck">
        {markedNodes(path.text, range.start, range.end, marks, false)}
      </span>,
    )
    start = range.end
  }
  parts.push(...markedNodes(path.text, start, path.text.length, marks, true))
  return parts
}

export const AgendaRow = memo(function AgendaRow({
  lineNumber,
  row,
  path,
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
}: {
  lineNumber?: number | undefined
  row: Row
  path?: AgendaPath | undefined
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
}): React.JSX.Element {
  const depth = row.kind === 'node' ? row.depth + 1 : 0
  const ref = useCallback((element: HTMLDivElement | null) => rowRef(row.key, element), [row.key, rowRef])
  return (
    <div
      className={`agenda-entry agenda-entry-${row.kind}${row.kind === 'day' && row.content ? ' agenda-entry-content' : ''}${row.kind === 'path' && row.leading ? ' agenda-entry-leading-path' : ''}${pinned ? ' agenda-row-pinned' : ''}`}
      data-agenda-measure-key={row.key}
      style={pinned ? { top: pinnedOffset } : undefined}
    >
      {row.kind === 'separator' ? <span aria-hidden="true" className="agenda-day-separator" /> : null}
      <div
        className={`agenda-row agenda-row-${row.kind}${row.kind === 'node' ? ` agenda-role-${row.role}` : ''}${row.kind === 'day' && row.isToday ? ' agenda-today' : ''}${mirror ? ' agenda-mirror' : ''}`}
        data-agenda-key={row.key}
        data-caret-end={caretAtStart ? 'start' : 'end'}
        data-depth={depth}
        data-node-id={row.kind === 'node' ? row.nodeId : undefined}
        data-has-attachment={row.kind === 'node' && node?.attachment !== undefined}
        aria-selected={selected}
        aria-label={row.kind === 'separator' ? 'Day separator' : undefined}
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
        {selected && row.kind !== 'separator' ? <span aria-hidden="true" className="node-focus-marker" /> : null}
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
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${agendaRowLabel(row, today)}`}
            tabIndex={-1}
            onPointerDown={(event) => event.preventDefault()}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(row.key)
            }}
          />
        ) : null}
        {row.kind === 'separator' ? (
          <span className="agenda-text">{markedNodes('', 0, 0, marks, true)}</span>
        ) : row.kind === 'path' ? (
          <span className="agenda-text agenda-path">{pathText(path!, marks)}</span>
        ) : row.kind === 'node' ? (
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
            <span className="agenda-label">
              {markedNodes(agendaRowLabel(row, today), 0, agendaRowLabel(row, today).length, marks, true)}
            </span>
            {row.kind === 'day' && row.isToday ? (
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
