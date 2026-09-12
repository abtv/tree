import type { ChangeEvent, ClipboardEvent, FocusEvent, FormEvent, KeyboardEvent, SyntheticEvent } from 'react'
import type { TreeNode } from '../domain/document'
import { richTextHtml } from './editor-dom'

interface NodeInputProps {
  node: TreeNode
  label: string
  parent?: boolean
  selectedAll: boolean
  inputRef: (input: HTMLElement | null) => void
  onBlur: () => void
  onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onContentInput: (event: FormEvent<HTMLElement>) => void
  onContentChange: (event: FormEvent<HTMLElement>) => void
  onCompositionStart: () => void
  onCompositionEnd: () => void
  onCut: () => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onMouseDown: () => void
  onPaste: (event: ClipboardEvent<HTMLElement>) => void
  onSelect: (event: SyntheticEvent<HTMLElement>) => void
}

export function NodeInput({
  node,
  label,
  parent = false,
  selectedAll,
  inputRef,
  onBlur,
  onTextChange,
  onContentInput,
  onContentChange,
  onCompositionStart,
  onCompositionEnd,
  onCut,
  onFocus,
  onKeyDown,
  onMouseDown,
  onPaste,
  onSelect,
}: NodeInputProps): React.JSX.Element {
  const className = ['node-input', parent ? 'current-parent-input' : '', selectedAll ? 'select-all' : '']
    .filter(Boolean)
    .join(' ')
  const commonProps = {
    'aria-label': label,
    className,
    onBlur,
    onCompositionEnd,
    onCompositionStart,
    onCut,
    onFocus,
    onKeyDown,
    onMouseDown,
    onPaste,
    onSelect,
    spellCheck: true,
  }

  if (node.links === undefined || node.links.length === 0) {
    return (
      <textarea
        {...commonProps}
        ref={inputRef as (input: HTMLTextAreaElement | null) => void}
        rows={1}
        value={node.text}
        onChange={onTextChange}
      />
    )
  }

  return (
    <div
      {...commonProps}
      contentEditable
      ref={inputRef}
      aria-multiline="true"
      role="textbox"
      onChange={onContentChange}
      onInput={onContentInput}
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: richTextHtml(node) }}
    />
  )
}
