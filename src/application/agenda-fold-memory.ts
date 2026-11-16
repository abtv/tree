import type { PersistedAgendaFolds } from '../domain/document'
import type { AgendaRow } from './agenda-rows'
import { agendaFoldTargets, dayKey, overdueKey, type AgendaCommand, type AgendaState } from './agenda-state'

/** Remember user choices separately from search reveals and focused-day presentation. */
export class AgendaFoldMemory {
  private keys: ReadonlySet<string> = new Set()
  private saved: PersistedAgendaFolds | undefined

  public get collapsed(): ReadonlySet<string> {
    return this.keys
  }

  public get persisted(): PersistedAgendaFolds | undefined {
    return this.saved
  }

  public restore(value: PersistedAgendaFolds | undefined): void {
    this.saved = value
    this.keys = new Set([...(value?.days.map(dayKey) ?? []), ...(value?.overdueWeeks.map(overdueKey) ?? [])])
  }

  public remember(command: AgendaCommand, rows: readonly AgendaRow[], result: AgendaState): boolean {
    if (result.presentation.kind !== 'timeline' || (command.kind !== 'fold' && command.kind !== 'toggle-fold'))
      return false
    let changed: Set<string> | undefined
    for (const target of agendaFoldTargets(command, rows)) {
      const closed = result.collapsed.has(target.key)
      if (closed === this.keys.has(target.key)) continue
      changed ??= new Set(this.keys)
      if (closed) changed.add(target.key)
      else changed.delete(target.key)
    }
    if (changed === undefined) return false

    const days: number[] = []
    const overdueWeeks: number[] = []
    for (const key of changed) {
      if (key.startsWith('day:')) days.push(Number(key.slice(4)))
      else overdueWeeks.push(Number(key.slice(8)))
    }
    this.keys = changed
    this.saved = changed.size === 0 ? undefined : { days, overdueWeeks }
    return true
  }
}
