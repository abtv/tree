import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { DesktopDataOperations } from '../application/notes-archive/desktop-data-operations'

interface Props {
  text: string
  action: 'Cancel' | 'OK'
  onAction(): void
}

export function DataActivityPanel({ text, action, onAction }: Props): React.JSX.Element {
  const panel = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = panel.current
    let previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const rememberFocus = (event: FocusEvent): void => {
      if (event.target instanceof HTMLElement && !element?.contains(event.target)) previous = event.target
    }
    document.addEventListener('focusin', rememberFocus)
    return () => {
      document.removeEventListener('focusin', rememberFocus)
      if (element?.contains(document.activeElement) && previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  return (
    <aside className="data-activity" aria-label="Notes activity" ref={panel}>
      <span role="status">{text}</span>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onAction}>
        {action}
      </button>
    </aside>
  )
}

/** Keep archive progress subscriptions out of the editor's render path. */
export function DesktopDataActivity({ operations }: { operations: DesktopDataOperations }): React.JSX.Element | null {
  const state = useSyncExternalStore(operations.subscribe, operations.getSnapshot, operations.getSnapshot)
  if (state.phase !== 'running' && state.phase !== 'done' && state.phase !== 'failed') return null
  return (
    <DataActivityPanel
      text={state.text}
      action={state.phase === 'running' ? 'Cancel' : 'OK'}
      onAction={
        state.phase === 'running'
          ? () => {
              void operations.cancel()
            }
          : operations.dismiss
      }
    />
  )
}
