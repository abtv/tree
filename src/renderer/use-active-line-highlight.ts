import { useLayoutEffect, useState, type RefObject } from 'react'
import { createActiveLineHighlight } from './active-line-highlight'

export function useActiveLineHighlight(root: RefObject<HTMLElement | null>): () => void {
  const [highlight] = useState(createActiveLineHighlight)
  const refresh = (): void => highlight.update(root.current)

  useLayoutEffect(() => highlight.mount(() => root.current), [highlight, root])
  useLayoutEffect(refresh)

  return refresh
}
