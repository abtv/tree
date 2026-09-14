// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreeNode } from '../domain/document'
import './test/setup'
import { NodeList } from './NodeList'
import { EDGE_SCROLL_STEP, WINDOWING_THRESHOLD } from './list-window'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const nodes: TreeNode[] = [
  { id: 'a', text: 'A', children: [] },
  { id: 'b', text: 'B', children: [] },
]

function buildNodes(count: number): TreeNode[] {
  return Array.from({ length: count }, (_, index) => ({ id: `n${index}`, text: `Text ${index}`, children: [] }))
}

function mockRows(rectTop: number, height = 27): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        top: rectTop,
        height,
        bottom: rectTop + height,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: rectTop,
        toJSON: () => ({}),
      }) as DOMRect,
  )
}

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

  it('enters a childless node when its circular indicator is clicked', () => {
    const onEnter = vi.fn()
    const { getByRole } = render(
      <NodeList
        nodes={nodes}
        renderInput={(node, label) => <span>{`${label}:${node.text}`}</span>}
        onEnter={onEnter}
        onMove={() => undefined}
      />,
    )

    fireEvent.click(getByRole('button', { name: 'Enter node 1' }))

    expect(onEnter).toHaveBeenCalledWith(nodes[0])
  })

  it('distinguishes leaf and child-bearing indicators while entering both', () => {
    const parentNode: TreeNode = { id: 'p', text: 'Parent', children: [{ id: 'c', text: 'Child', children: [] }] }
    const onEnter = vi.fn()
    const { getByRole } = render(
      <NodeList
        nodes={[parentNode, ...nodes]}
        renderInput={(node, label) => <span>{`${label}:${node.text}`}</span>}
        onEnter={onEnter}
        onMove={() => undefined}
      />,
    )

    const parentButton = getByRole('button', { name: 'Enter node 1' })
    const leafButton = getByRole('button', { name: 'Enter node 2' })
    expect(parentButton.className).toContain('node-disclosure-has-children')
    expect(leafButton.className).not.toContain('node-disclosure-has-children')

    fireEvent.mouseDown(parentButton)
    fireEvent.click(parentButton)
    expect(onEnter).toHaveBeenLastCalledWith(parentNode)

    fireEvent.click(leafButton)
    expect(onEnter).toHaveBeenLastCalledWith(nodes[0])
  })
})

describe('NodeList windowing', () => {
  function renderList(count: number, focusedNodeId?: string): ReturnType<typeof render> {
    return render(
      <NodeList
        focusedNodeId={focusedNodeId}
        nodes={buildNodes(count)}
        renderInput={(node, label) => <textarea aria-label={label} readOnly value={node.text} />}
        onEnter={() => undefined}
        onMove={() => undefined}
      />,
    )
  }

  it('renders every row without spacers at the threshold', () => {
    mockRows(0)
    const { container } = renderList(WINDOWING_THRESHOLD)
    expect(container.querySelectorAll('.node-row')).toHaveLength(WINDOWING_THRESHOLD)
    expect(container.querySelectorAll('.node-list-spacer')).toHaveLength(0)
  })

  it('mounts only a window of rows above the threshold and pads the rest with spacers', () => {
    mockRows(0)
    const { container } = renderList(600)
    const rows = container.querySelectorAll('.node-row')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(100)
    const spacers = container.querySelectorAll<HTMLElement>('.node-list-spacer')
    expect(spacers).toHaveLength(2)
    expect(spacers[0]!.style.height).toBe('0px')
    expect(Number.parseFloat(spacers[1]!.style.height)).toBeGreaterThan(0)
  })

  it('mounts the focused row even when it is outside the window', () => {
    mockRows(0)
    renderList(600, 'n550')
    expect(screen.getByRole('textbox', { name: 'Node 551' })).toBeInTheDocument()
  })

  it('moves the window when the page scrolls', () => {
    mockRows(0)
    renderList(600)
    expect(screen.getByRole('textbox', { name: 'Node 1' })).toBeInTheDocument()
    mockRows(-27 * 200)
    fireEvent.scroll(window)
    expect(screen.queryByRole('textbox', { name: 'Node 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 201' })).toBeInTheDocument()
  })

  it('keeps the same input mounted when the window catches up with the focused row', () => {
    mockRows(0)
    renderList(600, 'n550')
    const input = screen.getByRole('textbox', { name: 'Node 551' })
    input.focus()
    mockRows(-27 * 540)
    fireEvent.scroll(window)
    const later = screen.getByRole('textbox', { name: 'Node 551' })
    expect(later).toBe(input)
    expect(later).toHaveFocus()
  })

  it('maps drops on the spacers to the window edges', () => {
    mockRows(0)
    const onMove = vi.fn()
    const { container } = render(
      <NodeList
        nodes={buildNodes(600)}
        renderInput={(node, label) => <textarea aria-label={label} readOnly value={node.text} />}
        onEnter={() => undefined}
        onMove={onMove}
      />,
    )
    const spacers = container.querySelectorAll('.node-list-spacer')
    expect(spacers).toHaveLength(2)

    dropAt(spacers[0]!, 'n500', 10)
    expect(onMove).toHaveBeenLastCalledWith('n500', 0)

    dropAt(spacers[1]!, 'n500', 10)
    expect(onMove.mock.calls.at(-1)?.[1]).toBeGreaterThan(0)
  })

  it('stops auto-scrolling when the drag leaves the list', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    vi.stubGlobal('scrollBy', vi.fn())
    mockRows(0)
    const { container } = renderList(600)
    const list = container.querySelector('.node-list')
    if (list === null) throw new Error('The node list was not rendered.')

    fireEvent(
      list,
      new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: globalThis.innerHeight - 1 }),
    )
    expect(frames).toHaveLength(1)
    fireEvent(list, new MouseEvent('dragleave', { bubbles: true, cancelable: true, relatedTarget: document.body }))
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('auto-scrolls while a drag is near the bottom edge and stops on drag end', () => {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    const scrollBy = vi.fn()
    vi.stubGlobal('scrollBy', scrollBy)
    mockRows(0)
    const { container } = renderList(600)
    const list = container.querySelector('.node-list')
    if (list === null) throw new Error('The node list was not rendered.')
    const row = container.querySelector('.node-row')
    if (row === null) throw new Error('No row was rendered.')

    fireEvent(
      list,
      new MouseEvent('dragover', { bubbles: true, cancelable: true, clientY: globalThis.innerHeight - 1 }),
    )
    expect(frames).toHaveLength(1)
    frames[0]!(0)
    expect(scrollBy).toHaveBeenCalledWith(0, EDGE_SCROLL_STEP)

    fireEvent.dragEnd(row)
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
    expect(scrollBy).toHaveBeenCalledTimes(1)
  })
})
