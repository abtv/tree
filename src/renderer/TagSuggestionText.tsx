import { Fragment, useMemo } from 'react'
import { tagNameMatch } from '../domain/tag-search'
import { tagPrefix } from '../domain/tags'

export function TagSuggestionText({ name, query }: { name: string; query: string }): React.JSX.Element {
  const parts = useMemo(() => {
    const prefix = tagPrefix(query)!
    const match = tagNameMatch(name, query.slice(1))
    if (match === undefined) return [{ text: `${prefix}${name}`, matched: false }]
    return [
      { text: match.start === 0 ? '' : `${prefix}${name.slice(0, match.start)}`, matched: false },
      { text: `${match.start === 0 ? prefix : ''}${name.slice(match.start, match.end)}`, matched: true },
      { text: name.slice(match.end), matched: false },
    ]
  }, [name, query])

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.matched ? <strong className="node-search-match">{part.text}</strong> : part.text}
        </Fragment>
      ))}
    </>
  )
}
