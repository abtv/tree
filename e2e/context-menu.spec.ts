import { expect, launchTree, node, test, typeInto, writeClipboardText } from './fixtures'
import type { ElectronApplication } from '@playwright/test'

async function chooseEditorMenuItem(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, requestedLabel) => {
    const menuPrototype = Menu.prototype as typeof Menu.prototype & {
      popup: (options: { callback?: () => void }) => void
    }
    menuPrototype.popup = function (options) {
      const item = this.items.find((entry) => entry.label === requestedLabel)
      if (item === undefined) throw new Error(`Menu item "${requestedLabel}" was not created.`)
      item.click()
      options?.callback?.()
    }
  }, label)
}

test.describe('editable node context menu', () => {
  test('routes Copy and Paste through the editor store path', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const editor = node(window, 1)
    await typeInto(editor, 'Context menu text')
    await window.keyboard.press('Meta+a')
    await chooseEditorMenuItem(app, 'Copy')
    await editor.click({ button: 'right' })
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText())).toBe('Context menu text')

    await writeClipboardText(app, 'pasted')
    await editor.press('End')
    await chooseEditorMenuItem(app, 'Paste')
    await editor.click({ button: 'right' })
    await expect(editor).toHaveValue('Context menu textpasted')
    await app.close()
  })
})
