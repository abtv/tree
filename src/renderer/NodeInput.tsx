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
import { getSelectionEndpoints, setSelectionRange, type TextDecoration } from './editor-dom'
import { RichTextProjection } from './rich-text-projection'
import { useSearchDecorations } from './search-decorations'
import { nodeFlagsLabel } from './node-flags'

export interface NodeInputBindings {
  selectedAll: boolean
  disabled: boolean
  readReplaceDraft: () => string | undefined
  inputRef: (input: HTMLElement | null) => void
  onBlur: (event?: FocusEvent<HTMLElement>) => void
  onTextChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
  onContentInput: (event: FormEvent<HTMLElement>) => void
  onContentChange: (event: FormEvent<HTMLElement>) => void
  onCompositionStart: (event: CompositionEvent<HTMLElement>) => void
  onCompositionEnd: (event: CompositionEvent<HTMLElement>) => void
  onCompositionProjectionChange?: () => void
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
  richEditingEnabled?: boolean
  searchQuery?: string
  currentMatch?: { start: number; end: number } | undefined
}

export function NodeInput({
  node,
  label,
  parent = false,
  imageOnly = false,
  imageCaretActive = false,
  decorations: baseDecorations,
  searchQuery = '',
  currentMatch,
  richEditingEnabled = true,
  selectedAll,
  disabled,
  readReplaceDraft,
  inputRef,
  onBlur,
  onTextChange,
  onContentInput,
  onContentChange,
  onCompositionStart,
  onCompositionEnd,
  onCompositionProjectionChange,
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
  const draft = readReplaceDraft()
  const matches = useSearchDecorations(node.text, searchQuery)
  const hasLinks = (node.links?.length ?? 0) > 0
  const [compositionProjection, setCompositionProjection] = useState<'plain' | 'rich'>()
  const [richEditor, setRichEditor] = useState<{ nodeId: string; enabled: boolean }>({
    nodeId: node.id,
    enabled: hasLinks,
  })
  // Decorated text needs the rich element. Once a row needs it, the row keeps it, so removing the last
  // decoration while typing never swaps the focused element back.
  if (
    compositionProjection === undefined &&
    ((baseDecorations?.length ?? 0) > 0 || matches.length > 0) &&
    !(richEditor.nodeId === node.id && richEditor.enabled)
  )
    setRichEditor({ nodeId: node.id, enabled: true })
  const canStayPlain =
    baseDecorations === undefined &&
    matches.length === 0 &&
    !hasLinks &&
    !(richEditor.nodeId === node.id && richEditor.enabled)
  // A new decoration during composition must not replace the element receiving native input.
  const plain = compositionProjection === undefined ? canStayPlain : compositionProjection === 'plain'
  const element = useRef<HTMLElement | null>(null)
  const projection = useRef<RichTextProjection | null>(null)
  useLayoutEffect(() => () => projection.current?.reset(), [])
  const retainedSelection = useRef<{ anchor: number; focus: number } | undefined>(undefined)
  useLayoutEffect(() => {
    const input = element.current
    if (input !== null && retainedSelection.current !== undefined) {
      const { anchor, focus } = retainedSelection.current
      retainedSelection.current = undefined
      // A render re-attaches the same element. Rewriting an unchanged selection would reset a native
      // pointer drag in progress, whose direction a macOS text area does not report until release.
      const current = getSelectionEndpoints(input)
      if (input.ownerDocument.activeElement === input && (current.anchor !== anchor || current.focus !== focus))
        setSelectionRange(input, anchor, focus)
    }
  })
  const attach = (input: HTMLElement | null): void => {
    const previous = element.current
    if (input === null && previous !== null && previous.ownerDocument.activeElement === previous) {
      retainedSelection.current = getSelectionEndpoints(previous)
    }
    element.current = input
    // Commit the projection before registration/row measurement. Native input often already made
    // exactly this edit; replacing its DOM would discard selection and disturb scroll anchoring.
    if (input !== null && !plain && compositionProjection === undefined) {
      if (draft === undefined)
        (projection.current ??= new RichTextProjection()).apply(input, node, baseDecorations, matches, currentMatch)
      else {
        projection.current?.reset()
        if (input.textContent !== draft) input.textContent = draft
      }
    } else if (input !== null) projection.current?.reset()
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
    'aria-description': nodeFlagsLabel(node),
    className,
    onBlur: (event: FocusEvent<HTMLElement>) => {
      if (event.relatedTarget instanceof Element) setCompositionProjection(undefined)
      onBlur(event)
    },
    onCompositionEnd: (event: CompositionEvent<HTMLElement>) => {
      onCompositionEnd(event)
      setCompositionProjection(undefined)
      if (plain && !canStayPlain) onCompositionProjectionChange?.()
    },
    onCompositionStart: (event: CompositionEvent<HTMLElement>) => {
      setCompositionProjection(plain ? 'plain' : 'rich')
      onCompositionStart(event)
    },
    onContextMenu,
    onClick,
    onCut,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (hasLinks) setRichEditor({ nodeId: node.id, enabled: true })
      onFocus(event)
    },
    onKeyDown,
    onMouseDown,
    onMouseUp,
    onPaste,
    onSelect,
    spellCheck: false,
  }

  if (plain) {
    return (
      <textarea
        {...commonProps}
        ref={attach}
        readOnly={disabled}
        rows={1}
        value={draft ?? node.text}
        onChange={onTextChange}
      />
    )
  }

  return (
    <div
      {...commonProps}
      contentEditable={!disabled && richEditingEnabled}
      tabIndex={richEditingEnabled ? undefined : 0}
      ref={attach}
      aria-multiline="true"
      role="textbox"
      onChange={onContentChange}
      onInput={(event: FormEvent<HTMLElement>) => {
        if (hasLinks) setRichEditor({ nodeId: node.id, enabled: true })
        onContentInput(event)
      }}
      suppressContentEditableWarning
    />
  )
}
