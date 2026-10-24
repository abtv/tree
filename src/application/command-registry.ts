export type CommandAppearance = 'system' | 'light' | 'dark'

export interface CommandCapabilities {
  alwaysOnTop: boolean
  vim: boolean
}

export interface CommandServices {
  quit(): Promise<void>
  setAlwaysOnTop(value: boolean): Promise<void>
  setAppearance(value: CommandAppearance): Promise<void>
  setVimEnabled(value: boolean): Promise<void>
  showAgenda(): Promise<void>
  showTree(): Promise<void>
}

export interface CommandContext {
  alwaysOnTop: boolean
  appearance: CommandAppearance
  vimEnabled: boolean
  view: 'tree' | 'agenda'
}

/** A keyboard shortcut as data: the primary modifier is implied; the renderer formats the label per platform. */
export interface CommandShortcut {
  key: string
  shift?: boolean
}

export interface ApplicationCommand {
  name: string
  aliases: readonly string[]
  description: string
  shortcut?: CommandShortcut
  requires?: keyof CommandCapabilities
  active(context: CommandContext): boolean
  run(services: CommandServices, context: CommandContext): Promise<void>
}

export const commandRegistry: readonly ApplicationCommand[] = [
  {
    name: 'show-agenda',
    aliases: [],
    description: 'Show Agenda',
    active: (context) => context.view === 'agenda',
    run: (services) => services.showAgenda(),
  },
  {
    name: 'show-tree',
    aliases: [],
    description: 'Show Tree',
    active: (context) => context.view === 'tree',
    run: (services) => services.showTree(),
  },
  {
    name: 'quit',
    aliases: ['q'],
    description: 'Quit Tree',
    shortcut: { key: 'Q' },
    active: () => false,
    run: (services) => services.quit(),
  },
  {
    name: 'toggle-always-on-top',
    requires: 'alwaysOnTop',
    aliases: [],
    description: 'Keep the window above other windows',
    active: (context) => context.alwaysOnTop,
    run: (services, context) => services.setAlwaysOnTop(!context.alwaysOnTop),
  },
  {
    name: 'toggle-vim-mode',
    requires: 'vim',
    aliases: [],
    description: 'Use Vim editing',
    active: (context) => context.vimEnabled,
    run: (services, context) => services.setVimEnabled(!context.vimEnabled),
  },
  ...(
    [
      ['auto', 'system', 'Follow the system appearance'],
      ['light', 'light', 'Use the light appearance'],
      ['dark', 'dark', 'Use the dark appearance'],
    ] as const
  ).map(([name, value, description]): ApplicationCommand => ({
    name: `set-theme-${name}`,
    aliases: [],
    description,
    active: (context) => context.appearance === value,
    run: (services) => services.setAppearance(value),
  })),
]

export function normalizeCommandHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const names = new Set(commandRegistry.filter((command) => command.name !== 'quit').map((command) => command.name))
  return [...new Set(value.filter((name): name is string => typeof name === 'string' && names.has(name)))].slice(0, 100)
}

export function rememberCommand(history: readonly string[], name: string): string[] {
  return normalizeCommandHistory([name, ...history])
}

// Sort the registry once; each keystroke then scans commands/history without sorting or document work.
const alphabeticalCommands = [...commandRegistry].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))

export function availableCommands(capabilities: CommandCapabilities): readonly ApplicationCommand[] {
  return alphabeticalCommands.filter((command) => command.requires === undefined || capabilities[command.requires])
}

export function matchCommands(
  input: string,
  history: readonly string[],
  commands: readonly ApplicationCommand[] = alphabeticalCommands,
): readonly ApplicationCommand[] {
  const query = input.trim()
  if (/\s/.test(query)) return []
  const exact = (command: ApplicationCommand): boolean => command.name === query || command.aliases.includes(query)
  const matches = commands.filter(
    (command) =>
      exact(command) ||
      command.name.split('-').some((_segment, index, segments) => segments.slice(index).join('-').startsWith(query)),
  )
  const remaining = new Map(matches.map((command) => [command.name, command]))
  const ordered: ApplicationCommand[] = []
  const take = (command: ApplicationCommand | undefined): void => {
    if (command === undefined || !remaining.delete(command.name)) return
    ordered.push(command)
  }
  for (const command of matches) if (exact(command)) take(command)
  for (const name of history) take(remaining.get(name))
  return [...ordered, ...remaining.values()]
}
