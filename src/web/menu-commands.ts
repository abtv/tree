import { dataMenuCommands, MenuCommands, type DataMenuCommandName } from '../application/menu-commands'

/** Adapts the browser's existing Data controls, preserving synchronous picker activation. */
export function browserMenuCommands(menu: HTMLElement): MenuCommands {
  const commands = new MenuCommands()
  const buttons = [
    ...menu.querySelectorAll<HTMLButtonElement>('#data-export, #data-import, #data-backup, #data-restore'),
  ]
  const refresh = () => {
    commands.update(
      buttons.flatMap((button) => {
        if (button.hidden) return []
        const name = (Object.keys(dataMenuCommands) as DataMenuCommandName[]).find(
          (name) => dataMenuCommands[name] === button.textContent,
        )
        return name === undefined
          ? []
          : [
              {
                name,
                enabled: !button.disabled,
                run: () => {
                  button.click()
                },
              },
            ]
      }),
    )
  }
  const observer = new MutationObserver(refresh)
  for (const button of buttons)
    observer.observe(button, { attributes: true, childList: true, subtree: true, characterData: true })
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true })
  refresh()
  return commands
}
