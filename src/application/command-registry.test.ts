import { describe, expect, it, vi } from 'vitest'
import {
  availableCommands,
  type ApplicationCommand,
  commandRegistry,
  matchCommands,
  normalizeCommandHistory,
  rememberCommand,
} from './command-registry'

const names = (query: string, history: readonly string[] = []): string[] =>
  matchCommands(query, history).map((command) => command.name)

describe('command registry', () => {
  // @requirement PRODUCT.md §20.2.28
  it.each(commandRegistry)('provides a nonempty description for $name in the command panel', (command) => {
    expect(command.description.trim().length).toBeGreaterThan(0)
  })

  it('prioritizes exact names and aliases over history and prefix matches', () => {
    const command = (name: string, aliases: string[] = []): ApplicationCommand => ({
      name,
      aliases,
      description: name,
      active: () => false,
      run: async () => undefined,
    })
    const prefix = command('find-more')
    const exact = command('find')
    const alias = command('lookup', ['find'])

    expect(matchCommands('find', ['find-more'], [prefix, exact, alias])).toEqual([exact, alias, prefix])
    expect(matchCommands('two words', [], [command('lookup', ['two words'])])).toEqual([])
  })

  it('keeps quit unchecked in every context', () => {
    const quit = commandRegistry.find((command) => command.name === 'quit')!

    expect(quit.active({ alwaysOnTop: false, appearance: 'light', vimEnabled: false, view: 'agenda' })).toBe(false)
    expect(
      commandRegistry
        .find((command) => command.name === 'show-tree')!
        .active({ alwaysOnTop: false, appearance: 'light', vimEnabled: false, view: 'agenda' }),
    ).toBe(false)
  })

  // @requirement PRODUCT.md §20.2.28
  it.each([
    [true, true, 12],
    [false, true, 11],
    [false, false, 10],
    [true, false, 11],
  ])('filters capabilities before matching and history ordering (%s, %s)', (alwaysOnTop, vim, count) => {
    const commands = availableCommands({ alwaysOnTop, vim })

    expect(commands).toHaveLength(count)

    const history = ['toggle-always-on-top', 'toggle-vim-mode', 'set-theme-dark']
    const matches = (query: string) => matchCommands(query, history, commands).map((command) => command.name)

    expect(matches('toggle-always-on-top')).toEqual(alwaysOnTop ? ['toggle-always-on-top'] : [])
    expect(matches('top')).toEqual(alwaysOnTop ? ['toggle-always-on-top'] : [])
    expect(matches('vim')).toEqual(vim ? ['toggle-vim-mode'] : [])
    expect(matches('')).toEqual([
      ...(alwaysOnTop ? ['toggle-always-on-top'] : []),
      ...(vim ? ['toggle-vim-mode'] : []),
      'set-theme-dark',
      'find',
      'find-next',
      'find-previous',
      'quit',
      'search-all-nodes',
      'set-theme-auto',
      'set-theme-light',
      'show-agenda',
      'show-tree',
    ])
    expect(history).toEqual(['toggle-always-on-top', 'toggle-vim-mode', 'set-theme-dark'])
  })

  // @requirement PRODUCT.md §20.2.28
  it('records search and quit shortcuts as data without platform labels', () => {
    const shortcuts = commandRegistry.filter((command) => command.shortcut !== undefined)

    expect(shortcuts.map((command) => [command.name, command.shortcut])).toEqual([
      ['find', { key: 'F', shift: false }],
      ['find-next', { key: 'G', shift: false }],
      ['find-previous', { key: 'G', shift: true }],
      ['search-all-nodes', { key: ';', shift: false }],
      ['quit', { key: 'Q' }],
    ])
  })

  // @requirement PRODUCT.md §20.2.28
  it.each([
    ['theme', ['set-theme-auto', 'set-theme-dark', 'set-theme-light']],
    ['set-th', ['set-theme-auto', 'set-theme-dark', 'set-theme-light']],
    ['dark', ['set-theme-dark']],
    ['vim', ['toggle-vim-mode']],
    ['mode', ['toggle-vim-mode']],
    ['show', ['show-agenda', 'show-tree']],
    ['agenda', ['show-agenda']],
    ['tree', ['show-tree']],
    ['toggle', ['toggle-always-on-top', 'toggle-vim-mode']],
    ['q', ['quit']],
    ['qui', ['quit']],
    ['  dark  ', ['set-theme-dark']],
    ['Dark', []],
    ['ark', []],
    ['quit now', []],
    ['q!', []],
  ])('matches segment prefixes and exact aliases: %s', (query, expected) => {
    expect(names(query)).toEqual(expected)
  })

  it('ranks exact matches, unique history, then alphabetical remaining commands', () => {
    const history = ['set-theme-light', 'set-theme-dark', 'set-theme-light', 'unknown']

    expect(names('', history)).toEqual([
      'set-theme-light',
      'set-theme-dark',
      'find',
      'find-next',
      'find-previous',
      'quit',
      'search-all-nodes',
      'set-theme-auto',
      'show-agenda',
      'show-tree',
      'toggle-always-on-top',
      'toggle-vim-mode',
    ])
    expect(names('set-theme-dark', history)).toEqual(['set-theme-dark'])
    expect(names('theme', history)).toEqual(['set-theme-light', 'set-theme-dark', 'set-theme-auto'])
  })

  it('normalizes malformed history and remembers successful non-quit commands once', () => {
    expect(normalizeCommandHistory(null)).toEqual([])
    expect(normalizeCommandHistory(['unknown', 4, 'quit', 'set-theme-dark', 'set-theme-dark'])).toEqual([
      'set-theme-dark',
    ])
    expect(rememberCommand(['set-theme-light', 'set-theme-dark'], 'set-theme-dark')).toEqual([
      'set-theme-dark',
      'set-theme-light',
    ])
    expect(rememberCommand(['set-theme-dark'], 'quit')).toEqual(['set-theme-dark'])
  })

  it('delegates all actions to existing services and queries their current state', async () => {
    const services = {
      find: vi.fn(async () => undefined),
      findNext: vi.fn(async () => undefined),
      findPrevious: vi.fn(async () => undefined),
      searchAllNodes: vi.fn(async () => undefined),
      quit: vi.fn(async () => undefined),
      setAlwaysOnTop: vi.fn(async () => undefined),
      setAppearance: vi.fn(async () => undefined),
      setVimEnabled: vi.fn(async () => undefined),
      showAgenda: vi.fn(async () => undefined),
      showTree: vi.fn(async () => undefined),
    }
    for (const command of commandRegistry)
      await command.run(services, { alwaysOnTop: true, appearance: 'dark', vimEnabled: true, view: 'tree' })

    expect(services.showAgenda).toHaveBeenCalledExactlyOnceWith()
    expect(services.find).toHaveBeenCalledExactlyOnceWith()
    expect(services.findNext).toHaveBeenCalledExactlyOnceWith()
    expect(services.findPrevious).toHaveBeenCalledExactlyOnceWith()
    expect(services.searchAllNodes).toHaveBeenCalledExactlyOnceWith()
    expect(services.showTree).toHaveBeenCalledExactlyOnceWith()
    expect(services.quit).toHaveBeenCalledExactlyOnceWith()
    expect(services.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(false)
    expect(services.setVimEnabled).toHaveBeenCalledExactlyOnceWith(false)

    const toggleVim = commandRegistry.find((command) => command.name === 'toggle-vim-mode')!

    await toggleVim.run(services, { alwaysOnTop: false, appearance: 'system', vimEnabled: false, view: 'agenda' })

    expect(services.setVimEnabled).toHaveBeenLastCalledWith(true)
    expect(services.setAppearance.mock.calls).toEqual([['system'], ['light'], ['dark']])
    expect(
      commandRegistry
        .filter((command) => command.active({ alwaysOnTop: true, appearance: 'dark', vimEnabled: true, view: 'tree' }))
        .map((command) => command.name),
    ).toEqual(['show-tree', 'toggle-always-on-top', 'toggle-vim-mode', 'set-theme-dark'])
    expect(
      commandRegistry
        .find((command) => command.name === 'show-agenda')!
        .active({ alwaysOnTop: false, appearance: 'system', vimEnabled: false, view: 'agenda' }),
    ).toBe(true)
    expect(commandRegistry.flatMap((command) => command.aliases)).toEqual(['q'])
    expect(new Set(commandRegistry.map((command) => command.name)).size).toBe(12)
  })

  it('keeps search actions unchecked and tolerates unavailable search services', async () => {
    const services = {
      quit: vi.fn(async () => undefined),
      setAlwaysOnTop: vi.fn(async () => undefined),
      setAppearance: vi.fn(async () => undefined),
      setVimEnabled: vi.fn(async () => undefined),
      showAgenda: vi.fn(async () => undefined),
      showTree: vi.fn(async () => undefined),
    }
    const state = { alwaysOnTop: false, appearance: 'system', vimEnabled: false, view: 'tree' } as const

    for (const name of ['find', 'find-next', 'find-previous', 'search-all-nodes']) {
      const command = commandRegistry.find((candidate) => candidate.name === name)!

      expect(command.active(state)).toBe(false)
      await expect(command.run(services, state)).resolves.toBeUndefined()
    }
  })
})
