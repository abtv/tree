import type { MouseEventHandler } from 'react'
import type { TreeNode } from '../domain/document'
import type { CaretMark } from './agenda-row-caret'
import { agendaDecorations } from './date-decorations'
import { richTextHtml } from './editor-dom'
import { useSearchDecorations } from './search-decorations'
import { preventReadOnlyLinkFocus } from './node-input-pointer-handlers'

export function AgendaSearchText({
  node,
  day,
  today,
  marks,
  query,
  currentMatch,
  context,
  onClick,
}: {
  node: TreeNode
  day: number
  today?: number | undefined
  marks: readonly CaretMark[]
  query: string
  currentMatch?: { start: number; end: number } | undefined
  context: boolean
  onClick: MouseEventHandler<HTMLElement>
}): React.JSX.Element {
  const matches = useSearchDecorations(node.text, query)
  const decorations = [
    ...agendaDecorations(node, day, today),
    ...matches.map((match) =>
      currentMatch?.start === match.start && currentMatch.end === match.end
        ? { ...match, className: 'search-match search-match-current' }
        : match,
    ),
  ]
  return (
    <span
      className={`agenda-text${node.struckThrough ? ' agenda-text-struck' : ''}`}
      onClick={context ? undefined : onClick}
      onMouseDown={context ? undefined : preventReadOnlyLinkFocus}
      dangerouslySetInnerHTML={{ __html: richTextHtml(context ? { ...node, links: [] } : node, decorations, marks) }}
    />
  )
}
