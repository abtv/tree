import { MenuCommands, type DataMenuCommandName } from '../application/menu-commands'

interface BrowserMenuEntry {
  name: DataMenuCommandName
  enabled: boolean
  run(): void
}

/** Projects explicit command state into both buttons and the panel, without deferring activation. */
export class BrowserMenuCommands extends MenuCommands {
  private readonly entries = new Map<HTMLButtonElement, BrowserMenuEntry>()

  bind(
    button: HTMLButtonElement,
    action: () => void,
  ): (name: DataMenuCommandName | undefined, enabled: boolean) => void {
    const run = () => {
      if (this.entries.get(button)?.enabled) action()
    }
    button.onclick = run

    return (name, enabled) => {
      if (button.hidden !== (name === undefined)) button.hidden = name === undefined
      if (button.disabled !== !enabled) button.disabled = !enabled
      if (name === undefined) this.entries.delete(button)
      else this.entries.set(button, { name, enabled, run })
      this.update([...this.entries.values()])
    }
  }
}
