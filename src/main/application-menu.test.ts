import type { MenuItem, MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { AppearancePreference } from '../infrastructure/main/window-state'
import { applicationMenuTemplate } from './application-menu'

function createActions() {
  return { requestQuit: vi.fn(), setVimEnabled: vi.fn(), setAlwaysOnTop: vi.fn(), setAppearance: vi.fn() }
}

function state(
  overrides: Partial<{ vimEnabled: boolean; alwaysOnTop: boolean; appearance: AppearancePreference }> = {},
) {
  return { vimEnabled: false, alwaysOnTop: false, appearance: 'system' as AppearancePreference, ...overrides }
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
  // @requirement PRODUCT.md §9.3
  it('follows the macOS layout: Quit in the app menu, Vim in Edit, Appearance in View, Always on Top in Window', () => {
    const template = applicationMenuTemplate(state(), createActions())

    expect(template.map((entry) => entry.label)).toEqual(['Tree', 'Edit', 'View', 'Window'])
    expect(submenuItems(template, 'Tree').map((item) => item.label)).toEqual(['Quit Tree'])
    expect(submenuItems(template, 'Edit').map((item) => item.label)).toEqual(['Vim Editing'])
    expect(submenuItems(template, 'View').map((item) => item.label)).toEqual(['Appearance'])
    expect(appearanceItems(template).map((item) => item.label)).toEqual(['Automatic', 'Light', 'Dark'])
    expect(submenuItems(template, 'Window').map((item) => item.label)).toEqual(['Always on Top'])
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
