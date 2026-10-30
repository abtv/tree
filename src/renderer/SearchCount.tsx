import { useState } from 'react'
import { SearchPendingLabel } from './SearchPendingLabel'

export function SearchCount({ pending, label }: { pending: boolean; label: string }): React.JSX.Element {
  const [completedLabel, setCompletedLabel] = useState(label)
  if (!pending && completedLabel !== label) setCompletedLabel(label)

  return (
    <span className="search-count" role="status" aria-busy={pending}>
      {pending ? <SearchPendingLabel previous={completedLabel} /> : label}
    </span>
  )
}
