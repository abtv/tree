// @vitest-environment jsdom

import type { KeyboardEvent } from 'react'
import fc from 'fast-check'
import { describe, expect, it, vi } from 'vitest'
import { moveSelectionTransition } from '../application/editor-command-transitions'
import type { EditorStore } from '../application/editor-store'
import type { Document, TreeNode } from '../domain/document'
import { createEditorKeyDownHandler } from './editor-input-handlers'
import { setNormalCaret } from './editor-dom'
import type { VimKeyboardState } from './vim-keyboard-types'

type Motion = 'h' | 'j' | 'k' | 'l' | '0' | '$'

interface MotionCommand {
  key: Motion
  count: number
}

function keyEvent(input: HTMLTextAreaElement, key: string): KeyboardEvent<HTMLElement> {
  return {
    currentTarget: input,
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent<HTMLElement>
}

function assertImageMotionSequence(
  textLength: number,
  hasAttachment: boolean,
  initialCursor: number,
  commands: readonly MotionCommand[],
): void {
  const node: TreeNode = {
    id: 'node',
    text: 'x'.repeat(textLength),
    ...(hasAttachment ? { attachment: { id: 'image', mimeType: 'image/png' } } : {}),
    children: [],
  }
  const input = document.createElement('textarea')
  input.value = node.text
  input.setSelectionRange(initialCursor, initialCursor)
  const row = document.createElement('div')
  row.className = 'node-row'
  row.dataset.hasAttachment = String(hasAttachment)
  row.append(input)
  let imageCaret = hasAttachment && initialCursor === textLength
  const imageTextCursor: { current: number | undefined } = { current: undefined }
  const store = {
    getSnapshot: () => ({
      status: 'ready',
      document: { roots: [node] },
      location: { currentParentId: null, selectedNodeId: node.id },
    }),
    moveSelection: vi.fn(),
  } as unknown as EditorStore
  const vim: VimKeyboardState = {
    mode: 'normal',
    register: { current: { kind: 'empty' } },
    lastFind: { current: undefined },
    pending: { current: undefined },
    visualAnchor: { current: undefined },
    visualFocus: { current: undefined },
    imageTextCursor,
    moveBoundary: vi.fn(),
    moveViewport: vi.fn(),
    syncImageCaretToFocus: vi.fn(),
    setMode: vi.fn(),
    setImageCaret: vi.fn((_nodeId, active) => {
      imageCaret = active
      input.classList.toggle('node-input-image-caret', active)
    }),
    scheduleCaret: vi.fn(),
  }
  const handler = createEditorKeyDownHandler({
    store,
    node,
    isComposing: () => false,
    setSelectAllNodeId: vi.fn(),
    onPreviewAttachment: vi.fn(),
    vim,
  })

  for (const { key, count } of commands) {
    if (count > 1) handler(keyEvent(input, String(count)))

    let expectedCursor = input.selectionStart
    let expectedImageCaret = imageCaret
    let expectedReturnCursor = imageTextCursor.current
    const current = input.selectionStart

    if (key === 'h') {
      if (expectedImageCaret && hasAttachment && textLength > 0) {
        expectedCursor = Math.max(0, (expectedReturnCursor ?? textLength - 1) - (count - 1))
        expectedReturnCursor = undefined
      } else {
        const maximum = hasAttachment ? textLength : Math.max(0, textLength - 1)
        expectedCursor = Math.max(0, Math.min(maximum, current - count))
      }
      expectedImageCaret = hasAttachment && expectedCursor === textLength
      if (!expectedImageCaret) expectedReturnCursor = undefined
    } else if (key === 'l') {
      const maximum = hasAttachment ? textLength : Math.max(0, textLength - 1)
      expectedCursor = Math.max(0, Math.min(maximum, current + count))
      if (!expectedImageCaret && hasAttachment && expectedCursor === textLength && textLength > 0)
        expectedReturnCursor = Math.min(textLength - 1, current + count - 1)
      expectedImageCaret = hasAttachment && expectedCursor === textLength
    } else if (key === 'j') {
      if (!expectedImageCaret && hasAttachment && current < textLength) {
        expectedCursor = textLength
        expectedImageCaret = true
        expectedReturnCursor = current
      }
    } else if (key === 'k') {
      if (hasAttachment && (expectedImageCaret || current === textLength) && textLength > 0) {
        expectedCursor = expectedReturnCursor ?? textLength - 1
        expectedImageCaret = false
        expectedReturnCursor = undefined
      }
    } else if (key === '0') {
      expectedCursor = 0
      expectedImageCaret = hasAttachment && textLength === 0
      expectedReturnCursor = undefined
    } else {
      expectedCursor = Math.max(0, textLength - 1)
      expectedImageCaret = hasAttachment && textLength === 0
      expectedReturnCursor = undefined
    }

    handler(keyEvent(input, key))

    expect(input.selectionStart, `cursor after ${count}${key}`).toBe(expectedCursor)
    expect(imageCaret, `image caret after ${count}${key}`).toBe(expectedImageCaret)
    expect(imageTextCursor.current, `saved return cursor after ${count}${key}`).toBe(expectedReturnCursor)
    expect(imageCaret).toBe(hasAttachment && input.selectionStart === textLength)
    if (imageTextCursor.current !== undefined) {
      expect(hasAttachment).toBe(true)
      expect(textLength).toBeGreaterThan(0)
      expect(imageTextCursor.current).toBeGreaterThanOrEqual(0)
      expect(imageTextCursor.current).toBeLessThan(textLength)
    }
  }
}

interface SiblingCommand {
  key: Motion
  count: number
}

function assertSiblingMotionSequence(
  specifications: readonly { textLength: number; hasAttachment: boolean }[],
  initialIndex: number,
  initialCursor: number,
  commands: readonly SiblingCommand[],
): void {
  const nodes: TreeNode[] = specifications.map(({ textLength, hasAttachment }, index) => ({
    id: `node-${index}`,
    text: 'x'.repeat(textLength),
    ...(hasAttachment ? { attachment: { id: `image-${index}`, mimeType: 'image/png' } } : {}),
    children: [],
  }))
  const documentTree: Document = { roots: nodes }
  const inputs = new Map<string, HTMLTextAreaElement>()
  const rows = new Map<string, HTMLElement>()
  const container = document.createElement('div')
  for (const node of nodes) {
    const input = document.createElement('textarea')
    input.value = node.text
    const row = document.createElement('div')
    row.className = 'node-row'
    row.dataset.hasAttachment = String(node.attachment !== undefined)
    row.append(input)
    container.append(row)
    inputs.set(node.id, input)
    rows.set(node.id, row)
  }
  document.body.append(container)

  let selectedNodeId = nodes[initialIndex]!.id
  const startNode = nodes[initialIndex]!
  const startMaximum =
    startNode.attachment !== undefined ? startNode.text.length : Math.max(0, startNode.text.length - 1)
  const startCursor = Math.min(initialCursor, startMaximum)
  let focus = { nodeId: selectedNodeId, cursor: startCursor, token: 0 }
  let imageCaretNodeId =
    startNode.attachment !== undefined && startCursor === startNode.text.length ? startNode.id : undefined
  const imageTextCursor: { current: number | undefined } = { current: undefined }
  const inputAt = (id: string): HTMLTextAreaElement => inputs.get(id)!

  for (const node of nodes) {
    const input = inputAt(node.id)
    setNormalCaret(input, node.id === selectedNodeId ? startCursor : 0)
    input.classList.toggle('node-input-image-caret', imageCaretNodeId === node.id)
  }
  inputAt(selectedNodeId).focus()

  const store = {
    getSnapshot: () => ({
      status: 'ready',
      document: documentTree,
      location: { currentParentId: null, selectedNodeId },
      focus,
    }),
    moveSelection: vi.fn((direction: 'up' | 'down', cursor: number) => {
      const selectedIndex = nodes.findIndex((node) => node.id === selectedNodeId)
      const target = moveSelectionTransition(documentTree, { currentParentId: null, selectedNodeId }, direction, cursor)
      expect(target).toEqual(expectedRootSiblingMove(specifications, selectedIndex, direction, cursor))
      if (target === undefined) return
      if (target.nodeId !== selectedNodeId) imageTextCursor.current = undefined
      selectedNodeId = target.nodeId
      focus = { ...target, token: focus.token + 1 }
      const targetNode = nodes.find((node) => node.id === target.nodeId)!
      setNormalCaret(inputAt(target.nodeId), target.cursor)
      inputAt(target.nodeId).focus()
      imageCaretNodeId =
        targetNode.attachment !== undefined && target.cursor === targetNode.text.length ? targetNode.id : undefined
      for (const node of nodes) {
        const active = imageCaretNodeId === node.id
        rows.get(node.id)!.classList.toggle('node-row-image-caret', active)
        inputAt(node.id).classList.toggle('node-input-image-caret', active)
      }
    }),
  } as unknown as EditorStore

  const vim: VimKeyboardState = {
    mode: 'normal',
    register: { current: { kind: 'empty' } },
    lastFind: { current: undefined },
    pending: { current: undefined },
    visualAnchor: { current: undefined },
    visualFocus: { current: undefined },
    imageTextCursor,
    moveBoundary: vi.fn(),
    moveViewport: vi.fn(),
    syncImageCaretToFocus: () => {
      imageTextCursor.current = undefined
      const target = nodes.find((node) => node.id === focus.nodeId)!
      imageCaretNodeId = target.attachment !== undefined && focus.cursor === target.text.length ? target.id : undefined
    },
    setMode: vi.fn(),
    setImageCaret: vi.fn((nodeId, active) => {
      imageCaretNodeId = active ? nodeId : undefined
      for (const node of nodes) {
        const selected = active && node.id === nodeId
        rows.get(node.id)!.classList.toggle('node-row-image-caret', selected)
        inputAt(node.id).classList.toggle('node-input-image-caret', selected)
      }
    }),
    scheduleCaret: vi.fn(),
  }
  const press = (key: Motion): void => {
    const node = nodes.find((candidate) => candidate.id === selectedNodeId)!
    const handler = createEditorKeyDownHandler({
      store,
      node,
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment: vi.fn(),
      vim,
    })
    const input = inputAt(selectedNodeId)
    handler(keyEvent(input, key))
  }

  try {
    for (const { key, count } of commands) {
      if (count > 1) {
        const node = nodes.find((candidate) => candidate.id === selectedNodeId)!
        createEditorKeyDownHandler({
          store,
          node,
          isComposing: () => false,
          setSelectAllNodeId: vi.fn(),
          onPreviewAttachment: vi.fn(),
          vim,
        })(keyEvent(inputAt(selectedNodeId), String(count)))
      }
      press(key)

      const selected = nodes.find((node) => node.id === selectedNodeId)!
      const input = inputAt(selectedNodeId)
      const cursor = input.selectionStart
      const maximum = selected.attachment !== undefined ? selected.text.length : Math.max(0, selected.text.length - 1)
      expect(document.activeElement, `focused input after ${count}${key}`).toBe(input)
      expect(focus.nodeId, `focus owner after ${count}${key}`).toBe(selectedNodeId)
      expect(cursor, `cursor bounds after ${count}${key}`).toBeGreaterThanOrEqual(0)
      expect(cursor, `cursor bounds after ${count}${key}`).toBeLessThanOrEqual(maximum)
      if (imageCaretNodeId !== undefined) {
        expect(imageCaretNodeId, `image caret owner after ${count}${key}`).toBe(selectedNodeId)
        expect(selected.attachment, `image caret target after ${count}${key}`).toBeDefined()
      }
      if (imageTextCursor.current !== undefined) {
        expect(selected.attachment, `saved image return position after ${count}${key}`).toBeDefined()
        expect(selected.text.length, `saved image return position after ${count}${key}`).toBeGreaterThan(0)
        expect(imageTextCursor.current, `saved image return position after ${count}${key}`).toBeGreaterThanOrEqual(0)
        expect(imageTextCursor.current, `saved image return position after ${count}${key}`).toBeLessThan(
          selected.text.length,
        )
      }
    }
  } finally {
    container.remove()
  }
}

const motionCommand = fc.oneof(
  fc.record({ key: fc.constantFrom<Motion>('h', 'j', 'k', 'l'), count: fc.integer({ min: 1, max: 8 }) }),
  fc.constant({ key: '0' as const, count: 1 }),
  fc.constant({ key: '$' as const, count: 1 }),
)

function expectedRootSiblingMove(
  specifications: readonly { textLength: number }[],
  selectedIndex: number,
  direction: 'up' | 'down',
  cursor: number,
): { nodeId: string; cursor: number } {
  const lastIndex = specifications.length - 1
  if (direction === 'up' && selectedIndex === 0) return { nodeId: `node-${selectedIndex}`, cursor: 0 }
  if (direction === 'down' && selectedIndex === lastIndex)
    return { nodeId: `node-${selectedIndex}`, cursor: specifications[selectedIndex]!.textLength }
  const targetIndex = selectedIndex + (direction === 'up' ? -1 : 1)
  return {
    nodeId: `node-${targetIndex}`,
    cursor: Math.min(cursor, specifications[targetIndex]!.textLength),
  }
}

function assertImagePutReturnSequence(text: string, cursor: number, pastedText: string): void {
  let node: TreeNode = {
    id: 'node',
    text,
    attachment: { id: 'image', mimeType: 'image/png' },
    children: [],
  }
  const input = document.createElement('textarea')
  input.value = text
  input.setSelectionRange(cursor, cursor)
  const row = document.createElement('div')
  row.className = 'node-row'
  row.dataset.hasAttachment = 'true'
  row.append(input)
  let imageCaret = false
  const imageTextCursor: { current: number | undefined } = { current: undefined }
  const store = {
    getSnapshot: () => ({
      status: 'ready',
      document: { roots: [node] },
      location: { currentParentId: null, selectedNodeId: node.id },
    }),
    replaceTextRange: vi.fn((_nodeId: string, start: number, end: number, inserted: string) => {
      node = { ...node, text: node.text.slice(0, start) + inserted + node.text.slice(end) }
      input.value = node.text
    }),
  } as unknown as EditorStore
  const vim: VimKeyboardState = {
    mode: 'normal',
    register: { current: { kind: 'text', value: pastedText } },
    lastFind: { current: undefined },
    pending: { current: undefined },
    visualAnchor: { current: undefined },
    visualFocus: { current: undefined },
    imageTextCursor,
    moveBoundary: vi.fn(),
    moveViewport: vi.fn(),
    syncImageCaretToFocus: vi.fn(),
    setMode: vi.fn(),
    setImageCaret: vi.fn((_nodeId, active) => {
      imageCaret = active
      input.classList.toggle('node-input-image-caret', active)
    }),
    scheduleCaret: vi.fn((target, position) => setNormalCaret(target as HTMLTextAreaElement, position)),
  }
  const press = (key: string): void => {
    const handler = createEditorKeyDownHandler({
      store,
      node,
      isComposing: () => false,
      setSelectAllNodeId: vi.fn(),
      onPreviewAttachment: vi.fn(),
      vim,
    })
    handler(keyEvent(input, key))
  }

  press('j')
  expect(imageCaret).toBe(true)
  expect(imageTextCursor.current).toBe(cursor)
  expect(input.selectionStart).toBe(text.length)

  press('p')
  const expectedText = text + pastedText
  const expectedCursor = expectedText.length - 1
  expect(node.text).toBe(expectedText)
  expect(input.selectionStart).toBe(expectedCursor)
  expect(imageCaret).toBe(false)
  expect(imageTextCursor.current).toBeUndefined()

  press('l')
  expect(input.selectionStart).toBe(expectedText.length)
  expect(imageCaret).toBe(true)
  expect(imageTextCursor.current).toBe(expectedCursor)

  press('h')
  expect(input.selectionStart).toBe(expectedCursor)
  expect(imageCaret).toBe(false)
  expect(imageTextCursor.current).toBeUndefined()
}

describe('generated Vim image-caret interaction sequences', () => {
  it('keeps the sole image character active when k is clamped at the first root', () => {
    assertImageMotionSequence(0, true, 0, [{ key: 'k', count: 1 }])
  })

  it('does not save a text return position when k enters an image-only sibling', () => {
    assertSiblingMotionSequence(
      [
        { textLength: 0, hasAttachment: true },
        { textLength: 4, hasAttachment: false },
      ],
      1,
      0,
      [{ key: 'k', count: 1 }],
    )
  })

  it('clears an image return position when counted k leaves that node', () => {
    assertSiblingMotionSequence(
      [
        { textLength: 0, hasAttachment: false },
        { textLength: 1, hasAttachment: true },
        { textLength: 0, hasAttachment: false },
      ],
      2,
      0,
      [{ key: 'k', count: 2 }],
    )
  })

  it('matches the caret transition model after every counted motion', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 24 }),
        fc.boolean(),
        fc.nat(24),
        fc.array(motionCommand, { minLength: 1, maxLength: 30 }),
        (textLength, hasAttachment, arbitraryCursor, commands) => {
          const maximum = hasAttachment ? textLength : Math.max(0, textLength - 1)
          assertImageMotionSequence(textLength, hasAttachment, Math.min(arbitraryCursor, maximum), commands)
        },
      ),
      { numRuns: 250 },
    )
  })

  it('keeps selected-node focus, caret ownership, and image return positions valid across siblings', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ textLength: fc.integer({ min: 0, max: 12 }), hasAttachment: fc.boolean() }), {
          minLength: 1,
          maxLength: 5,
        }),
        fc.nat(5),
        fc.nat(24),
        fc.array(motionCommand, { minLength: 1, maxLength: 30 }),
        (specifications, arbitraryIndex, arbitraryCursor, commands) => {
          const index = arbitraryIndex % specifications.length
          const selected = specifications[index]!
          const maximum = selected.hasAttachment ? selected.textLength : Math.max(0, selected.textLength - 1)
          assertSiblingMotionSequence(specifications, index, Math.min(arbitraryCursor, maximum), commands)
        },
      ),
      { numRuns: 150 },
    )
  })

  it('matches an independent destination model for root sibling moves', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            textLength: fc.integer({ min: 0, max: 24 }),
            hasAttachment: fc.boolean(),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        fc.nat(32),
        fc.nat(64),
        fc.constantFrom<'up' | 'down'>('up', 'down'),
        (specifications, arbitraryIndex, cursor, direction) => {
          const selectedIndex = arbitraryIndex % specifications.length
          const documentTree: Document = {
            roots: specifications.map(({ textLength, hasAttachment }, index) => ({
              id: `node-${index}`,
              text: 'x'.repeat(textLength),
              ...(hasAttachment ? { attachment: { id: `image-${index}`, mimeType: 'image/png' } } : {}),
              children: [],
            })),
          }
          const actual = moveSelectionTransition(
            documentTree,
            { currentParentId: null, selectedNodeId: `node-${selectedIndex}` },
            direction,
            cursor,
          )
          expect(actual).toEqual(expectedRootSiblingMove(specifications, selectedIndex, direction, cursor))
        },
      ),
      { numRuns: 250 },
    )
  })

  it('clears the image return position across a put, then restores the new final text position', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('a', 'b', 'c'), { minLength: 2, maxLength: 40 }).map((parts) => parts.join('')),
        fc.nat(1000),
        fc.array(fc.constantFrom('x', 'y', 'z'), { minLength: 1, maxLength: 8 }).map((parts) => parts.join('')),
        (text, arbitraryCursor, pastedText) => {
          assertImagePutReturnSequence(text, arbitraryCursor % (text.length - 1), pastedText)
        },
      ),
      { numRuns: 150 },
    )
  })
})
