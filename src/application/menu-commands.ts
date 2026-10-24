import type { ApplicationCommand } from './command-registry'

export const dataMenuCommands = {
  'export-notes': 'Export Notes…',
  'import-notes': 'Import Notes…',
  'back-up-to-folder': 'Back Up to Folder…',
  'stop-backing-up': 'Stop Backing Up',
  'resume-backing-up': 'Resume Backing Up…',
  'restore-from-folder': 'Restore from Folder…',
} as const

export type DataMenuCommandName = keyof typeof dataMenuCommands
export interface MenuCommandSource {
  getSnapshot(): readonly ApplicationCommand[]
  subscribe(listener: () => void): () => void
}

/** Hosts publish the same availability and handlers used by their menus. */
export class MenuCommands implements MenuCommandSource {
  private commands: readonly ApplicationCommand[] = []
  private listeners = new Set<() => void>()
  getSnapshot = (): readonly ApplicationCommand[] => this.commands
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(entries: readonly { name: DataMenuCommandName; enabled: boolean; run(): void | Promise<void> }[]): void {
    if (
      entries.length === this.commands.length &&
      entries.every(
        (entry, index) => entry.name === this.commands[index]?.name && entry.enabled === this.commands[index]?.enabled,
      )
    )
      return
    this.commands = entries.map((entry) => ({
      name: entry.name,
      description: dataMenuCommands[entry.name],
      aliases: [],
      enabled: entry.enabled,
      active: () => false,
      run: async () => {
        await entry.run()
      },
    }))
    for (const listener of this.listeners) listener()
  }
}

export const emptyMenuCommands = new MenuCommands()
