import { memo } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { TreeNode } from '../domain/document'

interface NodeRowProps {
  node: TreeNode
  index: number
  depth?: number
  renderInput: (node: TreeNode, label: string) => ReactNode
  onActivate?: (node: TreeNode) => void
  onEnter: (node: TreeNode) => void
  onToggleExpansion?: (node: TreeNode) => void
  expanded?: boolean
  onPointerDown: (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerLeave: (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => void
  rowRef: (nodeId: string, element: HTMLDivElement | null) => void
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  dropOn: boolean
  dropLevel?: number | undefined
  focused: boolean
  visualSelected?: boolean
  pinned?: boolean
  pinnedOffset?: number
}

export const NodeRow = memo(function NodeRow({
  node,
  index,
  depth = 0,
  renderInput,
  onActivate,
  onEnter,
  onToggleExpansion,
  expanded = false,
  onPointerDown,
  onPointerLeave,
  rowRef,
  dragging,
  dropBefore,
  dropAfter,
  dropOn,
  dropLevel,
  focused,
  visualSelected = false,
  pinned = false,
  pinnedOffset = 0,
}: NodeRowProps): React.JSX.Element {
  const hasChildren = node.children.length > 0
  const className = [
    pinned ? 'node-row node-row-pinned' : 'node-row',
    node.text.length === 0 && node.attachment !== undefined ? 'node-row-image-only' : '',
    dragging ? 'node-row-dragging' : '',
    dropBefore ? 'node-row-drop-before' : '',
    dropAfter ? 'node-row-drop-after' : '',
    dropOn ? 'node-row-drop-on' : '',
    visualSelected ? 'node-row-visual-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const style: CSSProperties = {
    ...(pinned ? { top: pinnedOffset } : {}),
    '--row-depth': depth,
    ...(dropLevel === undefined ? {} : { '--drop-level': dropLevel }),
  } as CSSProperties

  return (
    <div
      className={className}
      data-depth={depth}
      data-has-attachment={node.attachment !== undefined}
      data-node-id={node.id}
      data-node-index={index}
      onClick={(event) => {
        if (node.text.length !== 0 || node.attachment === undefined) return
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('.node-input, .node-enter-control, .node-disclosure-triangle, .attachment-button, a, button')
        )
          return
        onActivate?.(node)
      }}
      onPointerDown={(event) => onPointerDown(node, index, event)}
      onPointerLeave={(event) => onPointerLeave(node.id, event)}
      ref={(element) => rowRef(node.id, element)}
      style={style}
    >
      {focused ? <span aria-hidden="true" className="node-focus-marker" /> : null}
      <button
        aria-label={`Enter node ${index + 1}`}
        className={`node-enter-control${hasChildren ? ' node-enter-control-has-children' : ''}`}
        onClick={() => onEnter(node)}
        onMouseDown={(event) => {
          event.preventDefault()
          globalThis.getSelection()?.removeAllRanges()
        }}
        onPointerDown={(event) => {
          event.preventDefault()
          globalThis.getSelection()?.removeAllRanges()
        }}
        type="button"
      />
      {hasChildren ? (
        <button
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} node ${index + 1}`}
          className="node-disclosure-triangle"
          onClick={() => onToggleExpansion?.(node)}
          onMouseDown={(event) => {
            event.preventDefault()
            globalThis.getSelection()?.removeAllRanges()
          }}
          onPointerDown={(event) => {
            event.preventDefault()
            globalThis.getSelection()?.removeAllRanges()
          }}
          type="button"
        />
      ) : null}
      {renderInput(node, `Node ${index + 1}`)}
    </div>
  )
})
