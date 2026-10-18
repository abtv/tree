// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import './test/setup'
import { NodeInput, type NodeInputBindings } from './NodeInput'
import { DATE_LIKE_CLASS, getSelectionRange } from './editor-dom'
import { treeDecorations } from './date-decorations'

afterEach(cleanup)

const noop = (): void => undefined
const bindings: NodeInputBindings = {
  selectedAll: false,
  disabled: false,
  inputRef: noop,
  onBlur: noop,
  onTextChange: noop,
  onContentInput: noop,
  onContentChange: noop,
  onCompositionStart: noop,
  onCompositionEnd: noop,
  onCut: noop,
  onContextMenu: noop,
  onClick: noop,
  onFocus: noop,
  onKeyDown: noop,
  onMouseDown: noop,
  onMouseUp: noop,
  onPaste: noop,
  onSelect: noop,
}

const node = (text: string) => ({ id: 'n', text, children: [] })

describe('native rich editing', () => {
  it('retains native editing by default and locks either rich editing policy', () => {
    const value = node('2026-10-18 Review')
    const field = (disabled: boolean, richEditingEnabled?: boolean) => (
      <NodeInput
        {...bindings}
        node={value}
        label="Node 1"
        decorations={treeDecorations(value)}
        disabled={disabled}
        {...(richEditingEnabled === undefined ? {} : { richEditingEnabled })}
      />
    )
    const { rerender } = render(field(false))
    expect(screen.getByLabelText('Node 1')).toHaveAttribute('contenteditable', 'true')
    for (const enabled of [true, false]) {
      rerender(field(true, enabled))
      expect(screen.getByLabelText('Node 1')).toHaveAttribute('contenteditable', 'false')
    }
  })

  it('keeps plain textareas editable when rich editing is deferred', () => {
    render(<NodeInput {...bindings} node={node('Plain text')} label="Node 1" richEditingEnabled={false} />)
    const input = screen.getByLabelText('Node 1') as HTMLTextAreaElement
    expect(input.tagName).toBe('TEXTAREA')
    expect(input.readOnly).toBe(false)
  })

  it('keeps the same focused rich field when native editing changes', () => {
    const value = node('2026-10-18 Review the details')
    const field = (enabled: boolean) => (
      <NodeInput
        {...bindings}
        node={value}
        label="Node 1"
        decorations={treeDecorations(value)}
        richEditingEnabled={enabled}
      />
    )
    const { rerender } = render(field(false))
    const input = screen.getByLabelText('Node 1')
    expect(input.getAttribute('contenteditable')).toBe('false')
    expect(input.tabIndex).toBe(0)
    input.focus()
    rerender(field(true))
    expect(screen.getByLabelText('Node 1')).toBe(input)
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('contenteditable')).toBe('true')
    rerender(field(false))
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('contenteditable')).toBe('false')
    expect(input.textContent).toBe(value.text)
  })
})

function view(text: string): React.JSX.Element {
  const value = node(text)
  return <NodeInput {...bindings} node={value} label="Node 1" decorations={treeDecorations(value)} />
}

// @requirement PRODUCT.md §20.10
describe('date-like text in a Tree input', () => {
  it('keeps the plain textarea for ordinary text', () => {
    render(view('ordinary plain text'))
    expect(screen.getByLabelText('Node 1').tagName).toBe('TEXTAREA')
  })
  it('renders resembling text through the rich element with the marker class', () => {
    render(view('due 2026-02-31'))
    const input = screen.getByLabelText('Node 1')
    expect(input.tagName).toBe('DIV')
    expect(input.querySelector(`.${DATE_LIKE_CLASS}`)?.textContent).toBe('2026-02-31')
  })
  it('keeps focus and the selection when a focused textarea becomes rich', () => {
    const { rerender } = render(view('abc'))
    const textarea = screen.getByLabelText('Node 1') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(2, 3)
    fireEvent.select(textarea)
    rerender(view('abc 2026-10-1'))
    const rich = screen.getByLabelText('Node 1')
    expect(rich.tagName).toBe('DIV')
    expect(document.activeElement).toBe(rich)
    expect(getSelectionRange(rich)).toEqual({ start: 2, end: 3 })
  })
  it('does not steal focus when an unfocused textarea becomes rich', () => {
    const { rerender } = render(view('abc'))
    rerender(view('abc 2026-10-1'))
    expect(document.activeElement).toBe(document.body)
  })
  it('freezes the markup during composition in a row that stayed rich after its token was removed', () => {
    const { rerender } = render(view('2026-10-1'))
    const input = screen.getByLabelText('Node 1')
    fireEvent.compositionStart(input)
    rerender(view('2026-10-14 x'))
    expect(screen.getByLabelText('Node 1').textContent).toBe('2026-10-1')
    fireEvent.compositionEnd(input)
    expect(screen.getByLabelText('Node 1').textContent).toBe('2026-10-14 x')
  })
  it('stays rich after the last resembling token is removed, so a focused row is never swapped back', () => {
    const { rerender } = render(view('2026-10-1'))
    expect(screen.getByLabelText('Node 1').tagName).toBe('DIV')
    rerender(view('ordinary text'))
    expect(screen.getByLabelText('Node 1').tagName).toBe('DIV')
  })
})

// @requirement PRODUCT.md §20.11
describe('valid dates in a Tree input', () => {
  it('renders valid dates with Agenda styling', () => {
    render(view('due 2026-10-14'))
    expect(screen.getByLabelText('Node 1').querySelector('.agenda-date-active')?.textContent).toBe('2026-10-14')
  })
  it('preserves focus and selection when a valid date first requires rich rendering', () => {
    const { rerender } = render(view('abc'))
    const textarea = screen.getByLabelText('Node 1') as HTMLTextAreaElement
    textarea.focus()
    textarea.setSelectionRange(1, 2)
    fireEvent.select(textarea)
    rerender(view('abc 2026-10-14'))
    const input = screen.getByLabelText('Node 1')
    expect(document.activeElement).toBe(input)
    expect(getSelectionRange(input)).toEqual({ start: 1, end: 2 })
    rerender(view('abc'))
    expect(screen.getByLabelText('Node 1')).toBe(input)
    expect(document.activeElement).toBe(input)
  })
})
