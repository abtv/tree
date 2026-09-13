// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
import { NodeList } from './NodeList'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const nodes: TreeNode[] = [
  { id: 'a', text: 'A', children: [] },
  { id: 'b', text: 'B', children: [] },
]

function createTransfer(nodeId: string): DataTransfer {
  return {
    dropEffect: 'none',
    effectAllowed: 'all',
    getData: () => nodeId,
    setData: () => undefined,
  } as unknown as DataTransfer
}

function dropAt(target: Element, nodeId: string, clientY: number): void {
  const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientY })
  Object.defineProperty(event, 'dataTransfer', { value: createTransfer(nodeId) })
  target.dispatchEvent(event)
}

describe('NodeList', () => {
  it('inserts above or below a row based on the drop position within it', () => {
    const onMove = vi.fn()
    const { container } = render(
      <NodeList
        nodes={nodes}
        renderInput={(node, label) => <span>{`${label}:${node.text}`}</span>}
        onEnter={() => undefined}
        onMove={onMove}
      />,
    )
    const firstRow = container.querySelector('.node-row')
    if (firstRow === null) throw new Error('The first row was not rendered.')
    const target = firstRow.querySelector('span')
    if (target === null) throw new Error('The first row input was not rendered.')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 10, height: 20 } as DOMRect)

    dropAt(target, 'b', 11)
    expect(onMove).toHaveBeenLastCalledWith('b', 0)

    dropAt(target, 'b', 29)
    expect(onMove).toHaveBeenLastCalledWith('b', 1)
  })
})
