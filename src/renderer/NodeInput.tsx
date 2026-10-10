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
import { useLayoutEffect, useRef, useState } from 'react'
import type { TreeNode } from '../domain/document'
import { richTextHtml, setSelectionRange, type TextDecoration } from './editor-dom'

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
  onMouseUp: (event: MouseEvent<HTMLElement>) => void
  onPaste: (event: ClipboardEvent<HTMLElement>) => void
  onSelect: (event: SyntheticEvent<HTMLElement>) => void
}

interface NodeInputProps extends NodeInputBindings {
  node: TreeNode
  label: string
  parent?: boolean
  imageOnly?: boolean
  imageCaretActive?: boolean
  decorations?: readonly TextDecoration[] | undefined
}

export function NodeInput({
  node,
  label,
  parent = false,
  imageOnly = false,
  imageCaretActive = false,
  decorations,
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
  onMouseUp,
  onPaste,
  onSelect,
}: NodeInputProps): React.JSX.Element {
  const hasLinks = (node.links?.length ?? 0) > 0
  const [compositionHtml, setCompositionHtml] = useState<string>()
  const [richEditor, setRichEditor] = useState<{ nodeId: string; enabled: boolean }>({
    nodeId: node.id,
    enabled: hasLinks,
  })
  // Decorated text needs the rich element. Once a row needs it, the row keeps it, so removing the last
  // decoration while typing never swaps the focused element back.
  if (decorations !== undefined && decorations.length > 0 && !(richEditor.nodeId === node.id && richEditor.enabled))
    setRichEditor({ nodeId: node.id, enabled: true })
  const plain = decorations === undefined && !hasLinks && !(richEditor.nodeId === node.id && richEditor.enabled)
  const element = useRef<HTMLElement | null>(null)
  const wasPlain = useRef(plain)
  // The textarea's focus and selection, kept from its events: replacing it with the rich element
  // unmounts it, which would otherwise drop both.
  const textarea = useRef({ focused: false, start: 0, end: 0 })
  const remember = (target: EventTarget): void => {
    if (!(target instanceof HTMLTextAreaElement)) return
    textarea.current = { focused: true, start: target.selectionStart, end: target.selectionEnd }
  }
  useLayoutEffect(() => {
    const input = element.current
    if (wasPlain.current && !plain && textarea.current.focused && input !== null) {
      input.focus({ preventScroll: true })
      setSelectionRange(input, textarea.current.start, textarea.current.end)
    }
    wasPlain.current = plain
  })
  const attach = (input: HTMLElement | null): void => {
    element.current = input
    inputRef(input)
  }
  const className = [
    'node-input',
    parent ? 'current-parent-input' : '',
    node.text.length === 0 ? 'node-input-empty' : '',
    node.struckThrough === true ? 'node-input-struck' : '',
    imageOnly ? 'node-input-image-only' : '',
    imageCaretActive ? 'node-input-image-caret' : '',
    selectedAll ? 'select-all' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const commonProps = {
    'aria-label': label,
    className,
    onBlur: () => {
      textarea.current.focused = false
      onBlur()
    },
    onCompositionEnd: (event: CompositionEvent<HTMLElement>) => {
      onCompositionEnd(event)
      setCompositionHtml(undefined)
    },
    onCompositionStart: (event: CompositionEvent<HTMLElement>) => {
      // Any rich element freezes its markup for the composition, including a Tree row that kept the
      // rich element after its last date-like token was removed.
      if (!plain) setCompositionHtml(richTextHtml(node, decorations))
      onCompositionStart(event)
    },
    onContextMenu,
    onClick,
    onCut,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      remember(event.target)
      if (hasLinks) setRichEditor({ nodeId: node.id, enabled: true })
      onFocus(event)
    },
    onKeyDown,
    onMouseDown,
    onMouseUp,
    onPaste,
    onSelect: (event: SyntheticEvent<HTMLElement>) => {
      remember(event.target)
      onSelect(event)
    },
    spellCheck: true,
  }

  if (plain) {
    return (
      <textarea
        {...commonProps}
        ref={attach}
        readOnly={disabled}
        rows={1}
        value={node.text}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          remember(event.target)
          onTextChange(event)
        }}
      />
    )
  }

  return (
    <div
      {...commonProps}
      contentEditable={!disabled}
      ref={attach}
      aria-multiline="true"
      role="textbox"
      onChange={onContentChange}
      onInput={(event: FormEvent<HTMLElement>) => {
        if (hasLinks) setRichEditor({ nodeId: node.id, enabled: true })
        onContentInput(event)
      }}
      suppressContentEditableWarning
      dangerouslySetInnerHTML={{ __html: compositionHtml ?? richTextHtml(node, decorations) }}
    />
  )
}
