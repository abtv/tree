import { describe, expect, it, vi } from 'vitest'
import {
  availableCommands,
  commandRegistry,
  matchCommands,
  normalizeCommandHistory,
  rememberCommand,
} from './command-registry'

const names = (query: string, history: readonly string[] = []): string[] =>
  matchCommands(query, history).map((command) => command.name)

describe('command registry', () => {
  // @requirement PRODUCT.md §20.2.28
  it.each([
    [true, true, 8],
    [false, true, 7],
    [false, false, 6],
    [true, false, 7],
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
      'quit',
      'set-theme-auto',
      'set-theme-light',
      'show-agenda',
      'show-tree',
    ])
    expect(history).toEqual(['toggle-always-on-top', 'toggle-vim-mode', 'set-theme-dark'])
  })

  // @requirement PRODUCT.md §20.2.28
  it('records only the quit shortcut, as data without a platform label', () => {
    const shortcuts = commandRegistry.filter((command) => command.shortcut !== undefined)
    expect(shortcuts.map((command) => [command.name, command.shortcut])).toEqual([['quit', { key: 'Q' }]])
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
      'quit',
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
    expect(new Set(commandRegistry.map((command) => command.name)).size).toBe(8)
  })
})
