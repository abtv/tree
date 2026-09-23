import { memo } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { TreeNode } from '../domain/document'

interface NodeRowProps {
  node: TreeNode
  index: number
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onPointerDown: (node: TreeNode, index: number, event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerLeave: (nodeId: string, event: ReactPointerEvent<HTMLDivElement>) => void
  rowRef: (nodeId: string, element: HTMLDivElement | null) => void
  dragging: boolean
  dropBefore: boolean
  dropAfter: boolean
  focused: boolean
  visualSelected?: boolean
  pinned?: boolean
  pinnedOffset?: number
}

export const NodeRow = memo(function NodeRow({
  node,
  index,
  renderInput,
  onEnter,
  onPointerDown,
  onPointerLeave,
  rowRef,
  dragging,
  dropBefore,
  dropAfter,
  focused,
  visualSelected = false,
  pinned = false,
  pinnedOffset = 0,
}: NodeRowProps): React.JSX.Element {
  const className = [
    pinned ? 'node-row node-row-pinned' : 'node-row',
    dragging ? 'node-row-dragging' : '',
    dropBefore ? 'node-row-drop-before' : '',
    dropAfter ? 'node-row-drop-after' : '',
    visualSelected ? 'node-row-visual-selected' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={className}
      data-node-id={node.id}
      data-node-index={index}
      onPointerDown={(event) => onPointerDown(node, index, event)}
      onPointerLeave={(event) => onPointerLeave(node.id, event)}
      ref={(element) => rowRef(node.id, element)}
      style={pinned ? { top: pinnedOffset } : undefined}
    >
      {focused ? <span aria-hidden="true" className="node-focus-marker" /> : null}
      <button
        aria-label={`Enter node ${index + 1}`}
        className={`node-disclosure${node.children.length > 0 ? ' node-disclosure-has-children' : ''}`}
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
      {renderInput(node, `Node ${index + 1}`)}
    </div>
  )
})
