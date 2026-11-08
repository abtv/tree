import { Fragment, useMemo } from 'react'
import { tagNameMatch } from '../domain/tag-search'

export function TagSuggestionText({ name, query }: { name: string; query: string }): React.JSX.Element {
  const parts = useMemo(() => {
    const match = tagNameMatch(name, query.slice(1))
    if (match === undefined) return [{ text: `#${name}`, matched: false }]
    return [
      { text: match.start === 0 ? '' : `#${name.slice(0, match.start)}`, matched: false },
      { text: `${match.start === 0 ? '#' : ''}${name.slice(match.start, match.end)}`, matched: true },
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
