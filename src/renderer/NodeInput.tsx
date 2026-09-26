import type {
  ChangeEvent,
  ClipboardEvent,
  CompositionEvent,
  FocusEvent,
  FormEvent,
  KeyboardEvent,
  MouseEvent,
  SyntheticEvent,
} from 'react'
import { useState } from 'react'
import type { TreeNode } from '../domain/document'
import { richTextHtml } from './editor-dom'

export interface NodeInputBindings {
  selectedAll: boolean
  disabled: boolean
  inputRef: (input: HTMLElement | null) => void
  onBlur: () => void
  onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onContentInput: (event: FormEvent<HTMLElement>) => void
  onContentChange: (event: FormEvent<HTMLElement>) => void
  onCompositionStart: (event: CompositionEvent<HTMLElement>) => void
  onCompositionEnd: (event: CompositionEvent<HTMLElement>) => void
  onCut: () => void
  onContextMenu: (event: MouseEvent<HTMLElement>) => void
  onClick: (event: MouseEvent<HTMLElement>) => void
  onFocus: (event: FocusEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  onMouseDown: (event: MouseEvent<HTMLElement>) => void
  onPaste: (event: ClipboardEvent<HTMLElement>) => void
  onSelect: (event: SyntheticEvent<HTMLElement>) => void
}

interface NodeInputProps extends NodeInputBindings {
  node: TreeNode
  label: string
  parent?: boolean
  imageOnly?: boolean
  imageCaretActive?: boolean
}

export function NodeInput({
  node,
  label,
  parent = false,
  imageOnly = false,
  imageCaretActive = false,
  selectedAll,
  disabled,
  inputRef,
  onBlur,
  onTextChange,
  onContentInput,
  onContentChange,
  onCompositionStart,
  onCompositionEnd,
  onContextMenu,
  onClick,
  onCut,
  onFocus,
  onKeyDown,
  onMouseDown,
  onPaste,
  onSelect,
}: NodeInputProps): React.JSX.Element {
  const hasLinks = (node.links?.length ?? 0) > 0
  const [richEditor, setRichEditor] = useState<{ nodeId: string; enabled: boolean }>({
    nodeId: node.id,
    enabled: hasLinks,
  })
  const className = [
    'node-input',
    parent ? 'current-parent-input' : '',
    node.text.length === 0 ? 'node-input-empty' : '',
    imageOnly ? 'node-input-image-only' : '',
    imageCaretActive ? 'node-input-image-caret' : '',
    selectedAll ? 'select-all' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const commonProps = {
    'aria-label': label,
    className,
    onBlur,
    onCompositionEnd,
    onCompositionStart,
    onContextMenu,
    onClick,
    onCut,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (hasLinks) setRichEditor({ nodeId: node.id, enabled: true })
      onFocus(event)
    },
    onKeyDown,
    onMouseDown,
    onPaste,
    onSelect,
    spellCheck: true,
  }

  if (!hasLinks && !(richEditor.nodeId === node.id && richEditor.enabled)) {
    return (
      <textarea
        {...commonProps}
        ref={inputRef as (input: HTMLTextAreaElement | null) => void}
        readOnly={disabled}
        rows={1}
        value={node.text}
        onChange={onTextChange}
      />
    )
  }

  return (
    <div
      {...commonProps}
      contentEditable={!disabled}
      ref={inputRef}
      aria-multiline="true"
      role="textbox"
      onChange={onContentChange}
      onInput={(event: FormEvent<HTMLElement>) => {
        if (hasLinks) setRichEditor({ nodeId: node.id, enabled: true })
        onContentInput(event)
      }}
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: richTextHtml(node) }}
    />
  )
}
