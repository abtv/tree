import { MenuCommands, type MenuCommandSource } from '../application/menu-commands'
import type { TreeApi, UpdateCommandsState } from '../shared/ipc'

/** Combines desktop menu actions with the main process's authoritative update availability. */
export function installUpdateCommands(api: TreeApi, data: MenuCommandSource, reportError: (error: unknown) => void) {
  const updates = new MenuCommands()
  let disposed = false
  let receivedEvent = false
  const publish = (state: UpdateCommandsState) => {
    if (disposed) return
    updates.update(
      (['check-for-updates', 'update-app'] as const).map((name) => ({
        name,
        enabled: state[name],
        ...(name === 'update-app'
          ? { description: state.version ? `Restart and Install ${state.version}` : 'Restart and Install Update' }
          : {}),
        run: () => api.runUpdateCommand!(name),
      })),
    )
  }
  publish({ 'check-for-updates': false, 'update-app': false })
  let snapshot = [...data.getSnapshot(), ...updates.getSnapshot()]
  const listeners = new Set<() => void>()
  const changed = () => {
    snapshot = [...data.getSnapshot(), ...updates.getSnapshot()]
    for (const listener of listeners) listener()
  }
  const stops = [data.subscribe(changed), updates.subscribe(changed)]
  const stopUpdates = api.onUpdateCommandsChanged!((state) => {
    receivedEvent = true
    publish(state)
  })
  void api.getUpdateCommands!()
    .then((state) => {
      if (!receivedEvent) publish(state)
    })
    .catch(reportError)
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {
      disposed = true
      stopUpdates()
      for (const stop of stops) stop()
      listeners.clear()
    },
  }
}
