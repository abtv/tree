import type { MenuItem, MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { applicationMenuTemplate } from './application-menu'

function createActions() {
  return { requestQuit: vi.fn(), setVimEnabled: vi.fn(), setAlwaysOnTop: vi.fn() }
}

function submenuItems(template: MenuItemConstructorOptions[], label: string): MenuItemConstructorOptions[] {
  const menu = template.find((entry) => entry.label === label)
  return Array.isArray(menu?.submenu) ? menu.submenu : []
}

function clickWithChecked(item: MenuItemConstructorOptions, checked: boolean): void {
  item.click?.({ checked } as MenuItem, undefined, {} as Electron.KeyboardEvent)
}

describe('application menu template', () => {
  // @requirement PRODUCT.md §9.3
  it('follows the macOS layout: Quit in the app menu, Vim in Edit, Always on Top in Window', () => {
    const template = applicationMenuTemplate({ vimEnabled: false, alwaysOnTop: false }, createActions())

    expect(template.map((entry) => entry.label)).toEqual(['Tree', 'Edit', 'Window'])
    expect(submenuItems(template, 'Tree').map((item) => item.label)).toEqual(['Quit Tree'])
    expect(submenuItems(template, 'Edit').map((item) => item.label)).toEqual(['Vim Editing'])
    expect(submenuItems(template, 'Window').map((item) => item.label)).toEqual(['Always on Top'])
  })

  // @requirement PRODUCT.md §9.3
  it.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ])('shows the current preferences as check marks (vim %s, always on top %s)', (vimEnabled, alwaysOnTop) => {
    const template = applicationMenuTemplate({ vimEnabled, alwaysOnTop }, createActions())

    const vim = submenuItems(template, 'Edit')[0]
    const pin = submenuItems(template, 'Window')[0]
    expect([vim?.type, vim?.checked]).toEqual(['checkbox', vimEnabled])
    expect([pin?.type, pin?.checked]).toEqual(['checkbox', alwaysOnTop])
  })

  // @requirement PRODUCT.md §9.3
  it('passes the new check state of each item to its action', () => {
    const actions = createActions()
    const template = applicationMenuTemplate({ vimEnabled: false, alwaysOnTop: true }, actions)

    clickWithChecked(submenuItems(template, 'Edit')[0]!, true)
    clickWithChecked(submenuItems(template, 'Window')[0]!, false)

    expect(actions.setVimEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(actions.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(false)
    expect(actions.requestQuit).not.toHaveBeenCalled()
  })

  // @requirement PRODUCT.md §9.1
  it('keeps Cmd+Q on the quit item', () => {
    const actions = createActions()
    const quit = submenuItems(applicationMenuTemplate({ vimEnabled: false, alwaysOnTop: false }, actions), 'Tree')[0]!

    expect(quit.accelerator).toBe('CommandOrControl+Q')
    clickWithChecked(quit, false)
    expect(actions.requestQuit).toHaveBeenCalledOnce()
  })
})
