// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { BrowserMenuCommands } from './menu-commands'

// @requirement PRODUCT.md §20.2.28
it('shares explicit availability and synchronous actions between buttons and the panel', async () => {
  const source = new BrowserMenuCommands()
  const button = document.createElement('button')
  button.textContent = 'An unrelated presentation label'
  const action = vi.fn()
  const update = source.bind(button, action)

  update('import-notes', true)
  const command = source.getSnapshot()[0]!
  const pending = command.run({} as never, {} as never)

  expect(command.name).toBe('import-notes')
  expect(action).toHaveBeenCalledOnce()
  expect(button.hidden).toBe(false)
  expect(button.disabled).toBe(false)
  expect(button.textContent).toBe('An unrelated presentation label')

  await pending
  button.click()

  expect(action).toHaveBeenCalledTimes(2)

  update('import-notes', false)
  button.click()
  await command.run({} as never, {} as never)

  expect(button.disabled).toBe(true)
  expect(source.getSnapshot()[0]?.enabled).toBe(false)
  expect(action).toHaveBeenCalledTimes(2)

  update(undefined, true)
  await command.run({} as never, {} as never)

  expect(button.hidden).toBe(true)
  expect(source.getSnapshot()).toEqual([])
  expect(action).toHaveBeenCalledTimes(2)
})

// @requirement PRODUCT.md §24.5
it('publishes backup identities from state without observing labels or replacing handlers', async () => {
  const source = new BrowserMenuCommands()
  const backup = document.createElement('button')
  const action = vi.fn()
  const update = source.bind(backup, action)
  const listener = vi.fn()
  source.subscribe(listener)

  update('back-up-to-folder', true)
  const snapshot = source.getSnapshot()
  const handler = backup.onclick
  backup.textContent = 'A presentation-only change'
  update('back-up-to-folder', true)

  expect(source.getSnapshot()).toBe(snapshot)
  expect(listener).toHaveBeenCalledOnce()

  update('stop-backing-up', true)

  expect(source.getSnapshot().map((command) => command.name)).toEqual(['stop-backing-up'])

  update('resume-backing-up', true)
  const pending = source.getSnapshot()[0]!.run({} as never, {} as never)

  expect(action).toHaveBeenCalledOnce()
  expect(backup.onclick).toBe(handler)
  expect(source.getSnapshot().map((command) => command.name)).toEqual(['resume-backing-up'])

  await pending
})
