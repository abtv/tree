// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { TreeNode } from '../domain/document'
import './test/setup'
import { NodeList } from './NodeList'
import { EDGE_SCROLL_STEP, WINDOWING_THRESHOLD } from './list-window'
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

function rect(top: number, height = 27): DOMRect {
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

function mockRowRects(originTop = 0, height = 27): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = this.dataset.nodeIndex
    if (index === undefined) return rect(originTop, height)
    return rect(originTop + Number(index) * height, height)
  })
}

interface RenderOptions {
  focusedNodeId?: string | undefined
  locked?: boolean
  list?: TreeNode[]
  renderInput?: (node: TreeNode, label: string) => ReactNode
}

function renderRows(
  options: RenderOptions = {},
  onMove = vi.fn(),
): ReturnType<typeof render> & { onMove: typeof onMove } {
  const list = options.list ?? nodes
  const view = render(
    <NodeList
      focusedNodeId={options.focusedNodeId}
      locked={options.locked === true}
      nodes={list}
      renderInput={
        options.renderInput ??
        ((node, label) => <textarea aria-label={label} className="node-input" readOnly value={node.text} />)
      }
      onEnter={() => undefined}
      onMove={onMove}
    />,
  )
  return { ...view, onMove }
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
  it('renders expanded edge drop targets without changing their insertion positions', () => {
    const { container } = renderRows()

    expect(container.querySelector('.drop-zone-start')).toHaveClass('drop-zone-edge')
    expect(container.querySelector('.drop-zone-end')).toHaveClass('drop-zone-edge')
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

  it('collapses an incidental selection when drag mode activates', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows()
    const rows = rowElements(container)
    const input = rows[0]!.querySelector('textarea')
    if (input === null) throw new Error('The first input was not rendered.')
    input.focus()
    input.setSelectionRange(0, 1)

    activate(rows[0]!, 13)

    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(0)
  })

  it('blurs the source input while dragging and restores its caret on release', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows({
      list: [
        { id: 'a', text: 'Alpha', children: [] },
        { id: 'b', text: 'Bravo', children: [] },
      ],
    })
    const rows = rowElements(container)
    const input = rows[0]!.querySelector('textarea')
    if (input === null) throw new Error('The first input was not rendered.')
    input.focus()
    input.setSelectionRange(1, 3)

    activate(rows[0]!, 13)
    expect(document.activeElement).not.toBe(input)
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(1)

    pointerUpAt(rows[0]!, 13)
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(1)
    expect(input.selectionEnd).toBe(1)
  })

  it('keeps the source input blurred after a cancelled drag until the pointer is released', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container } = renderRows({
      list: [
        { id: 'a', text: 'Alpha', children: [] },
        { id: 'b', text: 'Bravo', children: [] },
      ],
    })
    const rows = rowElements(container)
    const input = rows[0]!.querySelector('textarea')
    if (input === null) throw new Error('The first input was not rendered.')
    input.focus()
    input.setSelectionRange(2, 2)

    activate(rows[0]!, 13)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).not.toBe(input)

    pointerUpAt(rows[0]!, 40)
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(2)
    expect(input.selectionEnd).toBe(2)
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

  it('cancels a pending hold when the rows become locked or the source row disappears', () => {
    vi.useFakeTimers()
    mockRowRects()
    const first = renderRows()
    const row = rowElements(first.container)[0]!
    pointerDownAt(row, 13)
    first.rerender(
      <NodeList
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

  it('targets the list edges from the leading and trailing spacers', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows({ list: buildNodes(600) })
    const rows = rowElements(container)
    const mountedCount = rows.length

    activate(rows[1]!, 27 + 13)
    pointerMoveAt(rows[1]!, -10)
    expect(rows[0]).toHaveClass('node-row-drop-before')
    pointerUpAt(rows[1]!, -10)
    expect(onMove).toHaveBeenLastCalledWith('n1', 0)

    activate(rows[1]!, 27 + 13)
    pointerMoveAt(rows[1]!, 27 * mountedCount + 10)
    expect(rows[mountedCount - 1]).toHaveClass('node-row-drop-after')
    pointerUpAt(rows[1]!, 27 * mountedCount + 10)
    expect(onMove).toHaveBeenLastCalledWith('n1', mountedCount)
  })

  it('targets the pinned focused row without duplicating the marker', () => {
    vi.useFakeTimers()
    mockRowRects()
    const { container, onMove } = renderRows({ list: buildNodes(600), focusedNodeId: 'n550' })
    const rows = rowElements(container)
    const pinned = container.querySelector('.node-row-pinned')
    if (pinned === null) throw new Error('The pinned row was not rendered.')

    activate(rows[0]!, 13)
    pointerMoveAt(rows[0]!, 550 * 27 + 10)

    const markers = container.querySelectorAll('.node-row-drop-before, .node-row-drop-after')
    expect(markers).toHaveLength(1)
    expect(pinned).toHaveClass('node-row-drop-before')

    pointerUpAt(rows[0]!, 550 * 27 + 10)
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

    mockRowRects(-27 * 400)
    fireEvent.scroll(window)

    const list = container.querySelector('.node-list')
    if (list === null) throw new Error('The node list was not rendered.')
    const marker = container.querySelector('.node-row-drop-before, .node-row-drop-after')
    expect(marker).not.toBeNull()
    pointerUpAt(list, globalThis.innerHeight - 1)
    expect(onMove).toHaveBeenCalledWith('n0', 428)
  })
})

function mockRows(rectTop: number, height = 27): void {
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
