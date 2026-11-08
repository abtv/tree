import { useEffect, useState } from 'react'
import type { AppUpdateStatus, UpdateCommandsState } from '../shared/ipc'

/** Keeps background progress local to this leaf, without rerendering the editor. */
export function UpdateStatus({ hidden }: { hidden: boolean }): React.JSX.Element {
  const [status, setStatus] = useState<AppUpdateStatus>(null)
  useEffect(() => {
    let disposed = false
    let receivedEvent = false
    const publish = (state: UpdateCommandsState) => {
      if (!disposed) setStatus(state.status ?? null)
    }
    const stop = window.treeApi.onUpdateCommandsChanged?.((state) => {
      receivedEvent = true
      publish(state)
    })
    void window.treeApi
      .getUpdateCommands?.()
      .then((state) => {
        if (!receivedEvent) publish(state)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      stop?.()
    }
  }, [])

  if (hidden || status === null) return <span aria-hidden="true" className="status-bar-spacer" />
  return (
    <span className="status-bar-message update-status">
      {status === 'ready'
        ? 'Update ready'
        : status === 'failed'
          ? 'Update failed. Check for Updates to retry.'
          : status === 'installing'
            ? 'Preparing to restart…'
            : `Downloading update… ${status}%`}
    </span>
  )
}
