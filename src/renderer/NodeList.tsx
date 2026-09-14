import { memo, useCallback, useRef } from 'react'
import type { DragEvent, ReactNode } from 'react'
import type { TreeNode } from '../domain/document'

interface NodeListProps {
  nodes: readonly TreeNode[]
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onMove: (nodeId: string, insertionIndex: number) => void
}

type DropHandler = (insertionIndex: number, event: DragEvent<HTMLDivElement>) => void

interface MutableReference<T> {
  current: T
}

export function NodeList({ nodes, renderInput, onEnter, onMove }: NodeListProps): React.JSX.Element {
  const draggedNodeIdRef = useRef<string | undefined>(undefined)
  const onDrop = useCallback<DropHandler>(
    (insertionIndex, event) => {
      event.preventDefault()
      const nodeId = event.dataTransfer.getData('text/plain') || draggedNodeIdRef.current
      if (nodeId !== undefined) onMove(nodeId, insertionIndex)
      draggedNodeIdRef.current = undefined
    },
    [onMove],
  )
  const onDragEnd = useCallback((): void => {
    draggedNodeIdRef.current = undefined
  }, [])

  return (
    <section className="node-list" aria-label="Nodes">
      <DropZone index={0} onDrop={onDrop} start />
      {nodes.map((node, index) => (
        <NodeRow
          draggedNodeIdRef={draggedNodeIdRef}
          index={index}
          key={node.id}
          node={node}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          onEnter={onEnter}
          renderInput={renderInput}
        />
      ))}
      <DropZone end index={nodes.length} onDrop={onDrop} />
    </section>
  )
}

interface NodeRowProps {
  node: TreeNode
  index: number
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onDrop: DropHandler
  onDragEnd: () => void
  draggedNodeIdRef: MutableReference<string | undefined>
}

const NodeRow = memo(function NodeRow({
  node,
  index,
  renderInput,
  onEnter,
  onDrop,
  onDragEnd,
  draggedNodeIdRef,
}: NodeRowProps): React.JSX.Element {
  const onDropRow = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      const bounds = event.currentTarget.getBoundingClientRect()
      onDrop(event.clientY < bounds.top + bounds.height / 2 ? index : index + 1, event)
    },
    [index, onDrop],
  )
  const onDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>): void => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', node.id)
      draggedNodeIdRef.current = node.id
    },
    [draggedNodeIdRef, node.id],
  )

  return (
    <div
      className="node-row"
      draggable
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDropRow}
    >
      <button
        aria-label={`Enter node ${index + 1}`}
        className={`node-disclosure${node.children.length > 0 ? ' node-disclosure-has-children' : ''}`}
        onClick={() => onEnter(node)}
        onMouseDown={(event) => event.preventDefault()}
        type="button"
      />
      {renderInput(node, `Node ${index + 1}`)}
    </div>
  )
})

function onDragOver(event: DragEvent<HTMLDivElement>): void {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
}

function DropZone({
  end = false,
  index,
  onDrop,
  start = false,
}: {
  end?: boolean
  index: number
  onDrop: DropHandler
  start?: boolean
}): React.JSX.Element {
  return (
    <div
      className={`drop-zone${start ? ' drop-zone-start' : ''}${end ? ' drop-zone-end' : ''}`}
      aria-label={`Drop position ${index + 1}`}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(index, event)}
    />
  )
}
