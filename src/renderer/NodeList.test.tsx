// @vitest-environment jsdom

import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { ReactNode } from 'react'
import type { TreeNode } from '../domain/document'
import './test/setup'
import { NodeList } from './NodeList'
import { EDGE_SCROLL_STEP, ROW_HEIGHT_ESTIMATE, WINDOWING_THRESHOLD } from './list-window'
import { HOLD_ACTIVATION_MS } from './node-drag'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
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

function rect(top: number, height = ROW_HEIGHT_ESTIMATE): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 600,
    width: 600,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function mockRowRects(originTop = 0, height = ROW_HEIGHT_ESTIMATE): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = this.dataset.nodeIndex
    if (index === undefined) return rect(originTop, height)
    return rect(originTop + Number(index) * height, height)
  })
}

class TestResizeObserver {
  static instances: TestResizeObserver[] = []

  constructor(private readonly callback: ResizeObserverCallback) {
    TestResizeObserver.instances.push(this)
  }

  observe = vi.fn<(target: Element) => void>()
  unobserve = vi.fn<(target: Element) => void>()
  disconnect = vi.fn<() => void>()

  trigger(entries: ResizeObserverEntry[]): void {
    act(() => this.callback(entries, this as unknown as ResizeObserver))
  }
}

function resizeEntry(target: Element, blockSize?: number): ResizeObserverEntry {
  return {
    target,
    borderBoxSize: blockSize === undefined ? [] : [{ blockSize, inlineSize: 600 }],
    contentBoxSize: [],
    devicePixelContentBoxSize: [],
    contentRect: rect(0),
  } as unknown as ResizeObserverEntry
}

interface RenderOptions {
  focusedNodeId?: string | undefined
  locked?: boolean
  list?: TreeNode[]
  renderInput?: (node: TreeNode, label: string) => ReactNode
  visualNodeSelection?: { anchorId: string; focusId: string } | undefined
  isExpanded?: (nodeId: string) => boolean
  onToggleExpansion?: (node: TreeNode) => void
}

type StubDragFreeze = {
  begin: Mock<(nodeId: string, pointerId: number) => void>
  end: Mock<(pointerId?: number) => void>
}

function stubDragFreeze(): StubDragFreeze {
  return {
    begin: vi.fn<(nodeId: string, pointerId: number) => void>(),
    end: vi.fn<(pointerId?: number) => void>(),
  }
}

function renderRows(
  options: RenderOptions = {},
  onMove = vi.fn(),
): ReturnType<typeof render> & { onMove: typeof onMove; dragFreeze: StubDragFreeze } {
  const list = options.list ?? nodes
  const dragFreeze = stubDragFreeze()
  const view = render(
    <NodeList
      dragFreeze={dragFreeze}
      focusedNodeId={options.focusedNodeId}
      isExpanded={options.isExpanded}
      locked={options.locked === true}
      nodes={list}
      renderInput={
        options.renderInput ??
        ((node, label) => <textarea aria-label={label} className="node-input" readOnly value={node.text} />)
      }
      onEnter={() => undefined}
      onMove={onMove}
      onToggleExpansion={options.onToggleExpansion}
      visualNodeSelection={options.visualNodeSelection}
    />,
  )
  return { ...view, onMove, dragFreeze }
}

function pointerDownAt(target: Element, clientY: number, init: Partial<PointerEventInit> = {}): void {
  fireEvent.pointerDown(target, {
    pointerId: 1,
    button: 0,
    isPrimary: true,
    pointerType: 'mouse',
    clientX: 100,
    clientY,
    ...init,
  })
}

function activate(target: Element, clientY: number): void {
  pointerDownAt(target, clientY)
  act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))
}

function pointerMoveAt(target: Element, clientY: number): void {
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY })
}

function pointerUpAt(target: Element, clientY: number): void {
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY })
}

function rowElements(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('.node-row'))
}

describe('NodeList', () => {
  it('does not render a range when a Visual endpoint is no longer displayed', () => {
    const { container } = renderRows({ visualNodeSelection: { anchorId: 'missing', focusId: 'b' } })

    expect(container.querySelectorAll('.node-row-visual-selected')).toHaveLength(0)
  })

  it('renders edge drop targets at both list edges', () => {
    const { container } = renderRows()

    expect(container.querySelector('.drop-zone-start')).toHaveClass('drop-zone-edge')
    expect(container.querySelector('.drop-zone-end')).toHaveClass('drop-zone-edge')
  })

  it('enters a childless node when its circular indicator is clicked', () => {
    const onEnter = vi.fn()
    const { getByRole } = render(
      <NodeList
        dragFreeze={stubDragFreeze()}
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
        dragFreeze={stubDragFreeze()}
        nodes={[parentNode, ...nodes]}
        renderInput={(node, label) => <span>{`${label}:${node.text}`}</span>}
        onEnter={onEnter}
        onMove={() => undefined}
      />,
    )

    const parentButton = getByRole('button', { name: 'Enter node 1' })
    const leafButton = getByRole('button', { name: 'Enter node 2' })
    expect(parentButton.className).toContain('node-enter-control-has-children')
    expect(leafButton.className).not.toContain('node-enter-control-has-children')

    fireEvent.mouseDown(parentButton)
    fireEvent.click(parentButton)
    expect(onEnter).toHaveBeenLastCalledWith(parentNode)

    fireEvent.click(leafButton)
    expect(onEnter).toHaveBeenLastCalledWith(nodes[0])
  })

  // @requirement PRODUCT.md §2.1
  it('marks only the row whose node contains the caret', () => {
    const parentNode: TreeNode = { id: 'p', text: 'Parent', children: [{ id: 'c', text: 'Child', children: [] }] }
    const list = [parentNode, ...nodes]
    const element = (focusedNodeId?: string): React.JSX.Element => (
      <NodeList
        dragFreeze={stubDragFreeze()}
        focusedNodeId={focusedNodeId}
        nodes={list}
        onEnter={() => undefined}
        onMove={() => undefined}
        renderInput={(node, label) => <span>{`${label}:${node.text}`}</span>}
      />
    )

    const { container, rerender } = render(element('p'))
    expect(container.querySelectorAll('.node-focus-marker')).toHaveLength(1)
    expect(container.querySelector('.node-focus-marker')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('[data-node-id="p"] .node-focus-marker')).not.toBeNull()
    expect(container.querySelector('[data-node-id="a"] .node-focus-marker')).toBeNull()

    rerender(element('b'))
    expect(container.querySelectorAll('.node-focus-marker')).toHaveLength(1)
    expect(container.querySelector('[data-node-id="b"] .node-focus-marker')).not.toBeNull()
    expect(container.querySelector('[data-node-id="p"] .node-focus-marker')).toBeNull()

    rerender(element(undefined))
    expect(container.querySelectorAll('.node-focus-marker')).toHaveLength(0)
  })
})

describe('NodeList inline expansion', () => {
  it('renders no disclosure triangle for a leaf row', () => {
    renderRows()

    expect(screen.queryByRole('button', { name: /Expand node|Collapse node/ })).not.toBeInTheDocument()
  })

  it('renders a collapsed disclosure triangle for a node with children and reports it accessibly', () => {
    const parentNode: TreeNode = { id: 'p', text: 'Parent', children: [{ id: 'c', text: 'Child', children: [] }] }
    renderRows({ list: [parentNode, ...nodes] })

    const triangle = screen.getByRole('button', { name: 'Expand node 1' })
    expect(triangle).toHaveAttribute('aria-expanded', 'false')
  })

  it('prevents caret placement and clears the document selection on disclosure mouse down', () => {
    const parentNode: TreeNode = { id: 'p', text: 'Parent', children: [{ id: 'c', text: 'Child', children: [] }] }
    const { container } = renderRows({ list: [parentNode, ...nodes], renderInput: (node) => <span>{node.text}</span> })
    const parentText = container.querySelector('[data-node-id="p"] span')
    expect(parentText).not.toBeNull()
    const range = document.createRange()
    range.selectNodeContents(parentText!)
    const selection = globalThis.getSelection()
    selection?.addRange(range)
    expect(selection?.rangeCount).toBe(1)

    const triangle = screen.getByRole('button', { name: 'Expand node 1' })
    const event = createEvent.mouseDown(triangle)
    fireEvent(triangle, event)

    expect(event.defaultPrevented).toBe(true)
    expect(selection?.rangeCount).toBe(0)
  })

  it('flattens an expanded node’s children inline, in preorder, without windowing them separately', () => {
    const parentNode: TreeNode = { id: 'p', text: 'Parent', children: [{ id: 'c', text: 'Child', children: [] }] }
    const { container } = renderRows({ list: [parentNode, ...nodes], isExpanded: (id) => id === 'p' })

    const rows = rowElements(container)
    expect(rows.map((row) => row.getAttribute('data-node-id'))).toEqual(['p', 'c', 'a', 'b'])
    expect(screen.getByRole('button', { name: 'Collapse node 1' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('calls back with the node when its own disclosure triangle is clicked, without entering or selecting it', () => {
    const parentNode: TreeNode = { id: 'p', text: 'Parent', children: [{ id: 'c', text: 'Child', children: [] }] }
    const onToggleExpansion = vi.fn()
    const onEnter = vi.fn()
    render(
      <NodeList
        dragFreeze={stubDragFreeze()}
        nodes={[parentNode, ...nodes]}
        renderInput={(node, label) => <span>{`${label}:${node.text}`}</span>}
        onEnter={onEnter}
        onMove={() => undefined}
        onToggleExpansion={onToggleExpansion}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Expand node 1' }))

    expect(onToggleExpansion).toHaveBeenCalledWith(parentNode)
    expect(onEnter).not.toHaveBeenCalled()
  })

  it('snaps a drop position inside a dragged node’s own descendant block to the nearest real boundary', () => {
    vi.useFakeTimers()
    mockRowRects()
    // p1 has its own child p1a; p2 is p1's next real sibling. Flattened: a, p1, p1a, p2, b. The
    // position between p1 and p1a (row index 2) is not a valid boundary for a's children — it sits
    // inside p1's own visible block — so it must snap to the nearest real boundary (before p1) and
    // dropping there commits nothing.
    const parentNode: TreeNode = {
      id: 'a',
      text: 'A',
      children: [
        { id: 'p1', text: 'P1', children: [{ id: 'p1a', text: 'P1a', children: [] }] },
        { id: 'p2', text: 'P2', children: [] },
      ],
    }
    const { container, onMove } = renderRows({
      list: [parentNode, { id: 'b', text: 'B', children: [] }],
      isExpanded: (id) => id === 'a' || id === 'p1',
    })
    const rows = rowElements(container)
    expect(rows.map((row) => row.getAttribute('data-node-id'))).toEqual(['a', 'p1', 'p1a', 'p2', 'b'])

    activate(rows[1]!, ROW_HEIGHT_ESTIMATE + 12)
    pointerMoveAt(rows[1]!, ROW_HEIGHT_ESTIMATE * 2 + 5)
    expect(rows[1]).toHaveClass('node-row-drop-before')
    expect(container.querySelectorAll('.node-row-drop-before, .node-row-drop-after')).toHaveLength(1)
    pointerUpAt(rows[1]!, ROW_HEIGHT_ESTIMATE * 2 + 5)

    expect(onMove).not.toHaveBeenCalled()
  })

  it('commits a drag among a descendant’s own real siblings to the position after them', () => {
    vi.useFakeTimers()
    mockRowRects()
    const parentNode: TreeNode = {
      id: 'a',
      text: 'A',
      children: [
        { id: 'p1', text: 'P1', children: [] },
        { id: 'p2', text: 'P2', children: [] },
      ],
    }
    const { container, onMove } = renderRows({
      list: [parentNode, { id: 'b', text: 'B', children: [] }],
      isExpanded: (id) => id === 'a',
    })
    const rows = rowElements(container)
    expect(rows.map((row) => row.getAttribute('data-node-id'))).toEqual(['a', 'p1', 'p2', 'b'])

    activate(rows[1]!, ROW_HEIGHT_ESTIMATE + 12)
    pointerMoveAt(rows[1]!, ROW_HEIGHT_ESTIMATE * 3 + 5)
    expect(rows[3]).toHaveClass('node-row-drop-before')
    pointerUpAt(rows[1]!, ROW_HEIGHT_ESTIMATE * 3 + 5)

    expect(onMove).toHaveBeenCalledWith('p1', 2)
  })

  it('does not start a drag from the disclosure triangle', () => {
    vi.useFakeTimers()
    mockRowRects()
    const parentNode: TreeNode = { id: 'p', text: 'Parent', children: [{ id: 'c', text: 'Child', children: [] }] }
    const { container } = renderRows({ list: [parentNode, ...nodes] })
    const triangle = screen.getByRole('button', { name: 'Expand node 1' })

    pointerDownAt(triangle, 13)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))

    expect(container.querySelector('.node-row-dragging')).toBeNull()
  })
})

describe('NodeList drag interaction', () => {
  it('only marks the source row once the hold threshold elapses', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 13)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS - 1))
    expect(rows[0]).not.toHaveClass('node-row-dragging')
    expect(document.body).not.toHaveClass('node-drag-active')

    act(() => vi.advanceTimersByTime(1))
    expect(rows[0]).toHaveClass('node-row-dragging')
    expect(rows[1]).not.toHaveClass('node-row-dragging')
    expect(container.querySelector('.node-row-drop-before, .node-row-drop-after')).toBeNull()
    expect(document.body).toHaveClass('node-drag-active')

    pointerUpAt(rows[0]!, 13)
    expect(rows[0]).not.toHaveClass('node-row-dragging')
    expect(document.body).not.toHaveClass('node-drag-active')
  })

  it('never arms a drag for excluded pointer downs', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, getByRole } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 13, { button: 2 })
    pointerDownAt(rows[0]!, 13, { isPrimary: false })
    pointerDownAt(rows[0]!, 13, { pointerType: 'touch' })
    pointerDownAt(getByRole('button', { name: 'Enter node 1' }), 13)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))

    expect(container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
  })

  it('prevents the secondary pointer down from selecting text across rows', () => {
    const { container } = renderRows()
    const rows = rowElements(container)

    expect(
      fireEvent.pointerDown(rows[1]!, {
        cancelable: true,
        pointerId: 1,
        button: 2,
        isPrimary: true,
        pointerType: 'mouse',
      }),
    ).toBe(false)
  })

  it('ignores a duplicate press while a gesture is already pending', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 13)
    pointerDownAt(rows[1]!, 40, { pointerId: 2 })
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))
    pointerMoveAt(rows[0]!, 47)
    pointerUpAt(rows[0]!, 47)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('a', 2)
  })

  it('does not enter drag mode on a release before the threshold', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 13)
    act(() => vi.advanceTimersByTime(100))
    pointerUpAt(rows[0]!, 13)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))

    expect(container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
    expect(onMove).not.toHaveBeenCalled()
  })

  it('keeps an eligible hold within the move tolerance and cancels it when the pointer leaves the row', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 10)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS / 2))
    pointerMoveAt(rows[0]!, 12)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))
    expect(rows[0]).toHaveClass('node-row-dragging')

    pointerUpAt(rows[0]!, 12)
    pointerDownAt(rows[0]!, 10)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS / 2))
    pointerMoveAt(rows[0]!, 40)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
    expect(container.querySelector('.node-row-dragging')).toBeNull()
  })

  it('cancels the pending hold when the pointer moves beyond the tolerance', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 10)
    pointerMoveAt(rows[0]!, 15)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
    pointerUpAt(rows[0]!, 15)

    expect(container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
    expect(onMove).not.toHaveBeenCalled()
  })

  it('cancels a pending hold when the pointer leaves the row within the move tolerance', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)

    // The press lands 2px below the row's top edge and the pointer moves 3px up: within the 4px
    // hold tolerance but outside the row, which cancels the pending hold (`docs/PRODUCT.md` §11).
    pointerDownAt(rows[0]!, 2)
    pointerMoveAt(rows[0]!, -1)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
    pointerUpAt(rows[0]!, -1)

    expect(container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
    expect(onMove).not.toHaveBeenCalled()
  })

  it('keeps a pending hold when a hover reset reports no pressed buttons', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 10)
    fireEvent.pointerOut(rows[0]!, {
      pointerId: 1,
      clientX: 700,
      clientY: 200,
      buttons: 0,
      relatedTarget: document.body,
    })
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))

    expect(rows[0]).toHaveClass('node-row-dragging')
  })

  it('cancels a pending hold when the held pointer leaves the row', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 10)
    fireEvent.pointerOut(rows[0]!, {
      pointerId: 1,
      clientX: 700,
      clientY: 200,
      buttons: 1,
      relatedTarget: document.body,
    })
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS))

    expect(container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
  })

  it('hands the caret freeze to its owner when drag mode activates and releases it with the pointer', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, dragFreeze } = renderRows()
    const rows = rowElements(container)

    pointerDownAt(rows[0]!, 13)
    expect(dragFreeze.end).toHaveBeenCalledWith()
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS - 1))
    expect(dragFreeze.begin).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(dragFreeze.begin).toHaveBeenCalledWith('a', 1)

    pointerUpAt(rows[0]!, 13)
    expect(dragFreeze.end).toHaveBeenCalledWith(1)
  })

  it('keeps the caret freeze until the pointer is released after a cancelled drag', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, dragFreeze } = renderRows()
    const rows = rowElements(container)

    activate(rows[0]!, 13)
    const releasesBeforeCancel = dragFreeze.end.mock.calls.length
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(dragFreeze.end).toHaveBeenCalledTimes(releasesBeforeCancel)

    pointerUpAt(rows[0]!, 40)
    expect(dragFreeze.end).toHaveBeenLastCalledWith(1)
  })

  it('ends the visual freeze without releasing the caret when the source row disappears', () => {
    vi.useFakeTimers()
    mockRowRects()
    const view = renderRows({ list: buildNodes(2) })
    const row = rowElements(view.container)[0]!
    activate(row, 13)
    expect(document.body).toHaveClass('node-drag-active')

    view.rerender(
      <NodeList
        dragFreeze={view.dragFreeze}
        nodes={buildNodes(2).slice(1)}
        renderInput={(node, label) => <textarea aria-label={label} className="node-input" readOnly value={node.text} />}
        onEnter={() => undefined}
        onMove={view.onMove}
      />,
    )

    expect(view.container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
    expect(view.dragFreeze.end).toHaveBeenCalledTimes(1)
    expect(view.dragFreeze.begin).toHaveBeenCalledTimes(1)
  })

  it('commits a move to the boundary chosen by the release position', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)

    activate(rows[0]!, 13)
    pointerMoveAt(rows[0]!, 47)
    expect(rows[1]).toHaveClass('node-row-drop-after')
    expect(container.querySelectorAll('.node-row-drop-before, .node-row-drop-after')).toHaveLength(1)

    pointerUpAt(rows[0]!, 47)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('a', 2)
    expect(container.querySelector('.node-row-drop-before, .node-row-drop-after')).toBeNull()
  })

  it('commits a move before a row when the pointer is in its top half', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)

    activate(rows[1]!, 40)
    pointerMoveAt(rows[1]!, 5)
    expect(rows[0]).toHaveClass('node-row-drop-before')

    pointerUpAt(rows[1]!, 5)

    expect(onMove).toHaveBeenCalledWith('b', 0)
  })

  it('releases without a position change and commits nothing', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)

    activate(rows[0]!, 20)
    pointerUpAt(rows[0]!, 20)
    expect(onMove).not.toHaveBeenCalled()

    activate(rows[0]!, 13)
    pointerMoveAt(rows[0]!, 5)
    pointerUpAt(rows[0]!, 5)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('does not reuse the previous gesture target when a new drag activates', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows()
    const rows = rowElements(container)

    activate(rows[0]!, 13)
    pointerMoveAt(rows[0]!, 47)
    expect(rows[1]).toHaveClass('node-row-drop-after')
    pointerUpAt(rows[0]!, 47)

    activate(rows[0]!, 13)
    expect(container.querySelector('.node-row-drop-before, .node-row-drop-after')).toBeNull()
    pointerUpAt(rows[0]!, 13)
  })

  it('cancels an active drag on Escape, pointer cancellation, lost capture, and window blur', () => {
    vi.useFakeTimers()
    mockRowRects()

    const cases: Array<{ label: string; cancel: (row: Element, container: HTMLElement) => void }> = [
      {
        label: 'Escape',
        cancel: () => fireEvent.keyDown(window, { key: 'Escape' }),
      },
      {
        label: 'pointercancel',
        cancel: (row) => fireEvent.pointerCancel(row, { pointerId: 1 }),
      },
      {
        label: 'lostpointercapture',
        cancel: (_row, container) =>
          fireEvent.lostPointerCapture(container.querySelector('.node-list')!, {
            pointerId: 1,
          }),
      },
      {
        label: 'blur',
        cancel: () => fireEvent.blur(window),
      },
    ]

    for (const { label, cancel } of cases) {
      const { container, onMove, unmount } = renderRows()
      const row = rowElements(container)[0]!
      activate(row, 13)
      pointerMoveAt(row, 47)
      expect(container.querySelector('.node-row-drop-after'), label).not.toBeNull()

      cancel(row, container)

      expect(container.querySelector('.node-row-dragging'), label).toBeNull()
      expect(container.querySelector('.node-row-drop-before, .node-row-drop-after'), label).toBeNull()
      expect(document.body, label).not.toHaveClass('node-drag-active')
      pointerUpAt(row, 47)
      expect(onMove, label).not.toHaveBeenCalled()
      unmount()
    }
  })

  it('keeps an active drag through events that do not belong to the gesture', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows()
    const rows = rowElements(container)
    const list = container.querySelector('.node-list')!

    activate(rows[0]!, 13)
    pointerMoveAt(rows[0]!, 47)
    expect(rows[1]).toHaveClass('node-row-drop-after')

    // A release from another pointer, another pointer's lost capture, the source row's hover
    // reset, and an ordinary key must not end the gesture; only the owning pointer and Escape do.
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 100, clientY: 47 })
    fireEvent.lostPointerCapture(list, { pointerId: 2 })
    fireEvent.pointerOut(rows[0]!, {
      pointerId: 1,
      clientX: 100,
      clientY: 200,
      buttons: 1,
      relatedTarget: document.body,
    })
    fireEvent.keyDown(window, { key: 'x' })

    expect(rows[0]).toHaveClass('node-row-dragging')
    expect(rows[1]).toHaveClass('node-row-drop-after')

    pointerUpAt(rows[0]!, 47)

    expect(onMove).toHaveBeenCalledTimes(1)
    expect(onMove).toHaveBeenCalledWith('a', 2)
    expect(container.querySelector('.node-row-dragging')).toBeNull()
  })

  it('cancels a pending hold when the rows become locked or the source row disappears', () => {
    vi.useFakeTimers()
    mockRowRects()
    const first = renderRows()
    const row = rowElements(first.container)[0]!
    pointerDownAt(row, 13)
    first.rerender(
      <NodeList
        dragFreeze={stubDragFreeze()}
        locked
        nodes={nodes}
        renderInput={(node, label) => <textarea aria-label={label} readOnly value={node.text} />}
        onEnter={() => undefined}
        onMove={first.onMove}
      />,
    )
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
    expect(first.container.querySelector('.node-row-dragging')).toBeNull()
    first.unmount()

    const second = renderRows({ list: buildNodes(4) })
    const secondRow = rowElements(second.container)[0]!
    pointerDownAt(secondRow, 13)
    second.rerender(
      <NodeList
        dragFreeze={stubDragFreeze()}
        nodes={buildNodes(4).slice(1)}
        renderInput={(node, label) => <textarea aria-label={label} readOnly value={node.text} />}
        onEnter={() => undefined}
        onMove={second.onMove}
      />,
    )
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
    expect(second.container.querySelector('.node-row-dragging')).toBeNull()
  })

  it('suppresses the click that follows a drag while an ordinary click is delivered', () => {
    vi.useFakeTimers()
    mockRowRects()
    const onClick = vi.fn()
    const { container } = renderRows({
      renderInput: (node, label) => <textarea aria-label={label} readOnly value={node.text} onClick={onClick} />,
    })
    const row = rowElements(container)[0]!
    const input = row.querySelector('textarea')!

    fireEvent.click(input)
    expect(onClick).toHaveBeenCalledTimes(1)

    activate(row, 13)
    pointerMoveAt(row, 47)
    pointerUpAt(row, 47)
    fireEvent.click(input)
    expect(onClick).toHaveBeenCalledTimes(1)

    pointerDownAt(row, 13)
    pointerUpAt(row, 13)
    fireEvent.click(input)
    expect(onClick).toHaveBeenCalledTimes(2)
  })
})

// @requirement PRODUCT.md §20.1
describe('NodeList windowing', () => {
  function renderList(count: number, focusedNodeId?: string): ReturnType<typeof render> {
    return renderRows({ focusedNodeId, list: buildNodes(count) })
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

  it('updates measured height from a ResizeObserver border box and re-lays out', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    TestResizeObserver.instances = []
    mockRows(0)
    const { container } = renderRows({ focusedNodeId: 'n550', list: buildNodes(600) })
    const observer = TestResizeObserver.instances[0]!
    const trailingSpacer = container.querySelectorAll<HTMLElement>('.node-list-spacer')[1]!
    const initialHeight = Number.parseFloat(trailingSpacer.style.height)
    const firstRow = container.querySelector<HTMLElement>('[data-node-id="n550"]')!
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rect(0, this.dataset.nodeId === 'n550' ? ROW_HEIGHT_ESTIMATE * 2 : ROW_HEIGHT_ESTIMATE)
    })

    observer.trigger([resizeEntry(firstRow, ROW_HEIGHT_ESTIMATE * 2)])

    expect(Number.parseFloat(trailingSpacer.style.height)).toBe(initialHeight + ROW_HEIGHT_ESTIMATE)
  })

  it('falls back to the row bounding-box height when a ResizeObserver entry has no border box', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    TestResizeObserver.instances = []
    mockRows(0)
    const { container } = renderRows({ focusedNodeId: 'n550', list: buildNodes(600) })
    const observer = TestResizeObserver.instances[0]!
    const trailingSpacer = container.querySelectorAll<HTMLElement>('.node-list-spacer')[1]!
    const initialHeight = Number.parseFloat(trailingSpacer.style.height)
    const firstRow = container.querySelector<HTMLElement>('[data-node-id="n550"]')!
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rect(0, this.dataset.nodeId === 'n550' ? ROW_HEIGHT_ESTIMATE + 30 : ROW_HEIGHT_ESTIMATE)
    })

    observer.trigger([resizeEntry(firstRow)])

    expect(Number.parseFloat(trailingSpacer.style.height)).toBe(initialHeight + 30)
  })

  it('keeps a known height when ResizeObserver reports zero', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    TestResizeObserver.instances = []
    mockRows(0)
    const { container } = renderRows({ focusedNodeId: 'n550', list: buildNodes(600) })
    const observer = TestResizeObserver.instances[0]!
    const trailingSpacer = container.querySelectorAll<HTMLElement>('.node-list-spacer')[1]!
    const initialHeight = Number.parseFloat(trailingSpacer.style.height)
    const firstRow = container.querySelector<HTMLElement>('[data-node-id="n550"]')!
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rect(0, this.dataset.nodeId === 'n550' ? ROW_HEIGHT_ESTIMATE * 2 : ROW_HEIGHT_ESTIMATE)
    })
    observer.trigger([resizeEntry(firstRow, ROW_HEIGHT_ESTIMATE * 2)])
    const measuredHeight = Number.parseFloat(trailingSpacer.style.height)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rect(0, this.dataset.nodeId === 'n550' ? 0 : ROW_HEIGHT_ESTIMATE)
    })

    observer.trigger([resizeEntry(firstRow, 0)])

    expect(measuredHeight).toBe(initialHeight + ROW_HEIGHT_ESTIMATE)
    expect(Number.parseFloat(trailingSpacer.style.height)).toBe(measuredHeight)
  })

  it('clears and remeasures heights only when the window width changes', () => {
    vi.stubGlobal('ResizeObserver', TestResizeObserver)
    TestResizeObserver.instances = []
    mockRows(0)
    const originalWidth = globalThis.innerWidth
    const { container } = renderRows({ focusedNodeId: 'n550', list: buildNodes(600) })
    const observer = TestResizeObserver.instances[0]!
    const trailingSpacer = container.querySelectorAll<HTMLElement>('.node-list-spacer')[1]!
    const initialHeight = Number.parseFloat(trailingSpacer.style.height)
    const firstRow = container.querySelector<HTMLElement>('[data-node-id="n550"]')!
    observer.trigger([resizeEntry(firstRow, ROW_HEIGHT_ESTIMATE * 2)])
    const measuredHeight = Number.parseFloat(trailingSpacer.style.height)

    act(() => globalThis.dispatchEvent(new Event('resize')))
    expect(Number.parseFloat(trailingSpacer.style.height)).toBe(measuredHeight)

    Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: originalWidth + 1 })
    expect(globalThis.innerWidth).toBe(originalWidth + 1)
    expect(window.innerWidth).toBe(originalWidth + 1)
    fireEvent.resize(window)
    act(() => globalThis.dispatchEvent(new Event('resize')))
    expect(Number.parseFloat(trailingSpacer.style.height)).toBe(initialHeight)

    observer.trigger([resizeEntry(firstRow, ROW_HEIGHT_ESTIMATE * 3)])

    expect(Number.parseFloat(trailingSpacer.style.height)).toBe(initialHeight + ROW_HEIGHT_ESTIMATE * 2)
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
    mockRows(-ROW_HEIGHT_ESTIMATE * 200)
    fireEvent.scroll(window)
    expect(screen.queryByRole('textbox', { name: 'Node 1' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Node 201' })).toBeInTheDocument()
  })

  it('keeps the same input mounted when the window catches up with the focused row', () => {
    mockRows(0)
    renderList(600, 'n550')
    const input = screen.getByRole('textbox', { name: 'Node 551' })
    input.focus()
    mockRows(-ROW_HEIGHT_ESTIMATE * 540)
    fireEvent.scroll(window)
    const later = screen.getByRole('textbox', { name: 'Node 551' })
    expect(later).toBe(input)
    expect(later).toHaveFocus()
  })

  it('targets the list edges from the leading and trailing spacers', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows({ list: buildNodes(600) })
    const rows = rowElements(container)
    const mountedCount = rows.length

    activate(rows[1]!, ROW_HEIGHT_ESTIMATE + 12)
    pointerMoveAt(rows[1]!, -10)
    expect(rows[0]).toHaveClass('node-row-drop-before')
    pointerUpAt(rows[1]!, -10)
    expect(onMove).toHaveBeenLastCalledWith('n1', 0)

    activate(rows[1]!, ROW_HEIGHT_ESTIMATE + 12)
    pointerMoveAt(rows[1]!, ROW_HEIGHT_ESTIMATE * mountedCount + 10)
    expect(rows[mountedCount - 1]).toHaveClass('node-row-drop-after')
    pointerUpAt(rows[1]!, ROW_HEIGHT_ESTIMATE * mountedCount + 10)
    expect(onMove).toHaveBeenLastCalledWith('n1', mountedCount)
  })

  it('keeps the caret marker on the pinned row while the caret row is outside the window', () => {
    mockRows(0)
    const { container } = renderList(600, 'n550')
    expect(container.querySelectorAll('.node-focus-marker')).toHaveLength(1)
    expect(container.querySelector('.node-row-pinned .node-focus-marker')).not.toBeNull()

    mockRows(-ROW_HEIGHT_ESTIMATE * 540)
    fireEvent.scroll(window)
    expect(container.querySelectorAll('.node-focus-marker')).toHaveLength(1)
    expect(container.querySelector('.node-row-pinned')).toBeNull()
    expect(container.querySelector('[data-node-id="n550"] .node-focus-marker')).not.toBeNull()
  })

  it('targets the pinned focused row without duplicating the marker', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows({ list: buildNodes(600), focusedNodeId: 'n550' })
    const rows = rowElements(container)
    const pinned = container.querySelector('.node-row-pinned')
    if (pinned === null) throw new Error('The pinned row was not rendered.')

    activate(rows[0]!, 13)
    pointerMoveAt(rows[0]!, 550 * ROW_HEIGHT_ESTIMATE + 10)

    const markers = container.querySelectorAll('.node-row-drop-before, .node-row-drop-after')
    expect(markers).toHaveLength(1)
    expect(pinned).toHaveClass('node-row-drop-before')

    pointerUpAt(rows[0]!, 550 * ROW_HEIGHT_ESTIMATE + 10)
    expect(onMove).toHaveBeenCalledWith('n0', 550)
  })

  it('auto-scrolls only while dragging and stops on release', () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)
    const scrollBy = vi.fn()
    vi.stubGlobal('scrollBy', scrollBy)
    mockRowRects()
    const { container } = renderRows({ list: buildNodes(600) })
    const row = rowElements(container)[0]!

    pointerMoveAt(row, globalThis.innerHeight - 1)
    expect(frames).toHaveLength(0)

    activate(row, 13)
    pointerMoveAt(row, globalThis.innerHeight - 1)
    expect(frames).toHaveLength(1)
    frames[0]!(0)
    expect(scrollBy).toHaveBeenCalledWith(0, EDGE_SCROLL_STEP)

    pointerUpAt(row, globalThis.innerHeight - 1)
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1)
  })

  it('recomputes the drop target after auto-scrolling changes the mounted rows', () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback)
      return frames.length
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('scrollBy', vi.fn())
    mockRowRects()
    const { container, onMove } = renderRows({ list: buildNodes(600) })
    const row = rowElements(container)[0]!

    activate(row, 13)
    pointerMoveAt(row, globalThis.innerHeight - 1)
    expect(frames).toHaveLength(1)

    mockRowRects(-ROW_HEIGHT_ESTIMATE * 400)
    fireEvent.scroll(window)

    const list = container.querySelector('.node-list')
    if (list === null) throw new Error('The node list was not rendered.')
    const marker = container.querySelector('.node-row-drop-before, .node-row-drop-after')
    expect(marker).not.toBeNull()
    pointerUpAt(list, globalThis.innerHeight - 1)
    expect(onMove).toHaveBeenCalledWith('n0', 431)
  })

  it('never arms or keeps a pending hold when windowing unmounts the pressed row', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, dragFreeze } = renderRows({ list: buildNodes(600) })
    const list = container.querySelector('.node-list')!
    const pressedRow = rowElements(container)[0]!

    pointerDownAt(pressedRow, 13)
    // Scrolling far enough unmounts the pressed row while its hold is still pending. The hold
    // timer must not arm against the missing element, and a later pointer move must cancel the
    // pending hold instead of reading bounds from it.
    mockRowRects(-ROW_HEIGHT_ESTIMATE * 300)
    fireEvent.scroll(window)
    expect(container.contains(pressedRow)).toBe(false)

    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))
    expect(container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
    expect(dragFreeze.begin).not.toHaveBeenCalled()

    pointerMoveAt(list, 13)
    act(() => vi.advanceTimersByTime(HOLD_ACTIVATION_MS * 2))

    expect(container.querySelector('.node-row-dragging')).toBeNull()
    expect(document.body).not.toHaveClass('node-drag-active')
    expect(dragFreeze.begin).not.toHaveBeenCalled()
  })
})

function mockRows(rectTop: number, height = ROW_HEIGHT_ESTIMATE): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top: rectTop,
    height,
    bottom: rectTop + height,
    left: 0,
    right: 0,
    width: 0,
    x: 0,
    y: rectTop,
    toJSON: () => ({}),
  } as DOMRect)
}
