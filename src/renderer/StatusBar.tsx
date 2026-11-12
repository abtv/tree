import { useLayoutEffect, useRef, type ReactNode } from 'react'

/** Expose the actual footer height to popups while messages wrap on narrow windows. */
export function StatusBar({ children }: { children: ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const footer = ref.current
    if (!footer || typeof ResizeObserver === 'undefined') return
    const root = footer.closest<HTMLElement>('.tree-app')
    const observer = new ResizeObserver(() =>
      root?.style.setProperty('--status-bar-height', `${footer.getBoundingClientRect().height}px`),
    )
    observer.observe(footer)
    return () => {
      observer.disconnect()
      root?.style.removeProperty('--status-bar-height')
    }
  }, [])
  return (
    <footer className="status-bar" ref={ref}>
      {children}
    </footer>
  )
}
