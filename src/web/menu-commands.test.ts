// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { browserMenuCommands } from './menu-commands'

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.body.replaceChildren()
})

// @requirement PRODUCT.md §20.2.28
it('adapts supported menu actions, live disabled state and backup labels without deferring activation', async () => {
  const menu = document.createElement('div')
  menu.innerHTML =
    '<button id="data-export">Export Notes…</button><button id="data-import">Import Notes…</button><button id="data-backup" hidden>Back Up to Folder…</button><button id="data-restore" hidden>Restore from Folder…</button>'
  document.body.append(menu)
  const source = browserMenuCommands(menu)
  const names = () => source.getSnapshot().map((command) => command.name)

  expect(names()).toEqual(['export-notes', 'import-notes'])

  const button = menu.querySelector<HTMLButtonElement>('#data-export')!
  const click = vi.fn()
  button.onclick = click
  const pending = source.getSnapshot()[0]!.run({} as never, {} as never)

  expect(click).toHaveBeenCalledOnce()

  await pending
  button.disabled = true
  await Promise.resolve()

  expect(source.getSnapshot()[0]?.enabled).toBe(false)

  await source.getSnapshot()[0]!.run({} as never, {} as never)

  expect(click).toHaveBeenCalledOnce()

  const backup = menu.querySelector<HTMLButtonElement>('#data-backup')!
  backup.hidden = false
  await Promise.resolve()

  expect(names()).toContain('back-up-to-folder')

  backup.textContent = 'Stop Backing Up'
  await Promise.resolve()

  expect(names()).toContain('stop-backing-up')
  expect(names()).not.toContain('back-up-to-folder')

  backup.textContent = 'Resume Backing Up…'
  await Promise.resolve()

  expect(names()).toContain('resume-backing-up')
  expect(names()).not.toContain('stop-backing-up')
})
