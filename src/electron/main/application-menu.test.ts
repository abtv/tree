import type { MenuItem, MenuItemConstructorOptions, NativeImage } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { AppearancePreference } from '../../infrastructure/main/window-state'
import {
  applicationMenuTemplate as createTemplate,
  type ApplicationMenuActions,
  type ApplicationMenuState,
} from './application-menu'
import { createMenuIcons } from './menu-icons'

function applicationMenuTemplate(
  state: ApplicationMenuState,
  actions: ApplicationMenuActions,
  icons = createMenuIcons((name) => ({ name }) as unknown as NativeImage),
) {
  return createTemplate(state, actions, icons)
}

function createActions() {
  return {
    requestQuit: vi.fn(),
    setVimEnabled: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setAppearance: vi.fn(),
    notesCommand: vi.fn(),
    viewCommand: vi.fn(),
  }
}

function state(
  overrides: Partial<{ vimEnabled: boolean; alwaysOnTop: boolean; appearance: AppearancePreference }> = {},
) {
  return {
    vimEnabled: false,
    alwaysOnTop: false,
    appearance: 'system' as AppearancePreference,
    notes: { canExport: false, canImport: false },
    ...overrides,
  }
}

function submenuItems(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const menu = template.find((entry) => entry.label === label)
  return Array.isArray(menu?.submenu) ? menu.submenu : []
}

function appearanceItems(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  const appearance = submenuItems(template, 'View').find((item) => item.label === 'Appearance')
  return Array.isArray(appearance?.submenu) ? appearance.submenu : []
}

function clickWithChecked(item: MenuItemConstructorOptions, checked: boolean): void {
  item.click?.({ checked } as MenuItem, undefined, {} as Electron.KeyboardEvent)
}

describe('application menu template', () => {
  // @requirement PRODUCT.md §25.1
  it('orders notes commands, applies availability and dispatches without shortcuts', () => {
    const actions = createActions()
    const template = applicationMenuTemplate({ ...state(), notes: { canExport: true, canImport: false } }, actions)
    const items = submenuItems(template, 'File')

    expect(items.map((item) => [item.label, item.enabled, item.accelerator])).toEqual([
      ['Export Notes…', true, undefined],
      ['Import Notes…', false, undefined],
    ])

    clickWithChecked(items[0]!, false)
    clickWithChecked(items[1]!, false)

    expect(actions.notesCommand.mock.calls).toEqual([['export'], ['import']])
  })
  // @requirement PRODUCT.md §9.3
  it('follows the macOS layout: Quit in the app menu, Vim in Edit, Appearance in View, Always on Top in Window', () => {
    const template = applicationMenuTemplate(state(), createActions())

    expect(template.map((entry) => entry.label)).toEqual(['Tree', 'File', 'Edit', 'View', 'Window'])
    expect(submenuItems(template, 'Tree').map((item) => item.label)).toEqual(['Quit Tree'])
    expect(submenuItems(template, 'Edit').map((item) => item.label)).toEqual(['Vim Editing'])
    expect(submenuItems(template, 'View').map((item) => item.label ?? item.type)).toEqual([
      'Tree',
      'Agenda',
      'separator',
      'Appearance',
    ])
    expect(appearanceItems(template).map((item) => item.label)).toEqual(['Automatic', 'Light', 'Dark'])
    expect(submenuItems(template, 'Window').map((item) => item.label)).toEqual(['Always on Top'])
  })

  // @requirement PRODUCT.md §9.3
  // @requirement PRODUCT.md §25.1
  it('uses native symbols for views and notes actions while retaining text and command routing', () => {
    const createSymbol = vi.fn((name: string) => ({ name }) as unknown as NativeImage)
    const icons = createMenuIcons(createSymbol)

    expect(createSymbol.mock.calls).toEqual([
      ['point.3.connected.trianglepath.dotted'],
      ['calendar'],
      ['square.and.arrow.up'],
      ['square.and.arrow.down'],
    ])

    const actions = createActions()
    const template = applicationMenuTemplate(state(), actions, icons)
    const views = submenuItems(template, 'View')

    expect(views.slice(0, 2).map((item) => [item.label, item.icon, item.accelerator])).toEqual([
      ['Tree', icons.tree, undefined],
      ['Agenda', icons.agenda, undefined],
    ])
    expect(submenuItems(template, 'File').map((item) => item.icon)).toEqual([icons.export, icons.import])

    clickWithChecked(views[0]!, false)
    clickWithChecked(views[1]!, false)

    expect(actions.viewCommand.mock.calls).toEqual([['tree'], ['agenda']])
  })

  // @requirement PRODUCT.md §9.3
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('shows the current preferences as check marks (vim %s, always on top %s)', (vimEnabled, alwaysOnTop) => {
    const template = applicationMenuTemplate(state({ vimEnabled, alwaysOnTop }), createActions())

    const vim = submenuItems(template, 'Edit')[0]
    const pin = submenuItems(template, 'Window')[0]

    expect([vim?.type, vim?.checked]).toEqual(['checkbox', vimEnabled])
    expect([pin?.type, pin?.checked]).toEqual(['checkbox', alwaysOnTop])
  })

  // @requirement PRODUCT.md §9.3
  // @requirement PRODUCT.md §20.5
  it.each([
    ['system', [true, false, false]],
    ['light', [false, true, false]],
    ['dark', [false, false, true]],
  ] as const)('checks exactly the %s appearance radio item', (appearance, checked) => {
    const items = appearanceItems(applicationMenuTemplate(state({ appearance }), createActions()))

    expect(items.map((item) => item.type)).toEqual(['radio', 'radio', 'radio'])
    expect(items.map((item) => item.checked)).toEqual(checked)
  })

  // @requirement PRODUCT.md §20.5
  it('passes the chosen appearance to its action', () => {
    const actions = createActions()
    const items = appearanceItems(applicationMenuTemplate(state(), actions))

    clickWithChecked(items[1]!, true)
    clickWithChecked(items[2]!, true)
    clickWithChecked(items[0]!, true)

    expect(actions.setAppearance.mock.calls).toEqual([['light'], ['dark'], ['system']])
  })

  // @requirement PRODUCT.md §9.3
  it('passes the new check state of each item to its action', () => {
    const actions = createActions()
    const template = applicationMenuTemplate(state({ alwaysOnTop: true }), actions)

    clickWithChecked(submenuItems(template, 'Edit')[0]!, true)
    clickWithChecked(submenuItems(template, 'Window')[0]!, false)

    expect(actions.setVimEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(actions.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(false)
    expect(actions.requestQuit).not.toHaveBeenCalled()
    expect(actions.setAppearance).not.toHaveBeenCalled()
  })

  // @requirement PRODUCT.md §9.1
  it('keeps Cmd+Q on the quit item', () => {
    const actions = createActions()
    const quit = submenuItems(applicationMenuTemplate(state(), actions), 'Tree')[0]!

    expect(quit.accelerator).toBe('CommandOrControl+Q')

    clickWithChecked(quit, false)

    expect(actions.requestQuit).toHaveBeenCalledOnce()
  })
})
