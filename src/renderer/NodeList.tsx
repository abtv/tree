import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import type { TreeNode } from '../domain/document'

interface NodeListProps {
  nodes: TreeNode[]
  renderInput: (node: TreeNode, label: string) => ReactNode
  onEnter: (node: TreeNode) => void
  onMove: (nodeId: string, insertionIndex: number) => void
}

export function NodeList({ nodes, renderInput, onEnter, onMove }: NodeListProps): React.JSX.Element {
  const [draggedNodeId, setDraggedNodeId] = useState<string>()

  const onDrop =
    (insertionIndex: number) =>
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault()
      const nodeId = event.dataTransfer.getData('text/plain') || draggedNodeId
      if (nodeId !== undefined) onMove(nodeId, insertionIndex)
      setDraggedNodeId(undefined)
    }
  const onRowDrop =
    (index: number) =>
    (event: DragEvent<HTMLDivElement>): void => {
      const bounds = event.currentTarget.getBoundingClientRect()
      onDrop(event.clientY < bounds.top + bounds.height / 2 ? index : index + 1)(event)
    }
  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  return (
    <section className="node-list" aria-label="Nodes">
      <DropZone index={0} onDrop={onDrop} start />
      {nodes.map((node, index) => (
        <div
          className="node-row"
          draggable
          key={node.id}
          onDragEnd={() => setDraggedNodeId(undefined)}
          onDragOver={onDragOver}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', node.id)
            setDraggedNodeId(node.id)
          }}
          onDrop={onRowDrop(index)}
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
      ))}
      <DropZone end index={nodes.length} onDrop={onDrop} />
    </section>
  )
}

function DropZone({
  end = false,
  index,
  onDrop,
  start = false,
}: {
  end?: boolean
  index: number
  onDrop: (index: number) => (event: DragEvent<HTMLDivElement>) => void
  start?: boolean
}): React.JSX.Element {
  return (
    <div
      className={`drop-zone${start ? ' drop-zone-start' : ''}${end ? ' drop-zone-end' : ''}`}
      aria-label={`Drop position ${index + 1}`}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      }}
      onDrop={onDrop(index)}
    />
  )
}
