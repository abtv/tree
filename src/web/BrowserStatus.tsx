import { useLayoutEffect, useRef } from 'react'

/** Preserve the browser controllers' DOM-owned messages and actions in the shared footer. */
export function BrowserStatus(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const status = document.getElementById('browser-status')
    if (!status || !ref.current) return
    const parent = status.parentNode
    const next = status.nextSibling
    const problem = document.getElementById('prototype-problem')
    const problemParent = problem?.parentNode
    const problemNext = problem?.nextSibling ?? null
    if (problem) status.prepend(problem)
    ref.current.append(status)
    status.hidden = false
    return () => {
      if (problem) problemParent?.insertBefore(problem, problemNext)
      status.hidden = true
      parent?.insertBefore(status, next)
    }
  }, [])
  return <div className="browser-status-slot" ref={ref} />
}
