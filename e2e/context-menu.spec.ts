import { expect, firePaste, launchTree, node, setCursor, test, typeInto, writeClipboardText } from './fixtures'
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

  test('does not extend a text selection when the next node is right-clicked', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const first = node(window, 1)
    await writeClipboardText(app, 'https://first.example')
    await firePaste(first)
    await expect(window.getByRole('link', { name: 'https://first.example' })).toBeVisible()
    await setCursor(first, 0)
    await window.keyboard.press('Enter')

    const second = node(window, 2)
    await writeClipboardText(app, 'https://second.example')
    await second.focus()
    await firePaste(second)
    await expect(window.getByRole('link', { name: 'https://second.example' })).toBeVisible()
    await setCursor(first, 0)
    await chooseEditorMenuItem(app, 'Copy')
    await second.click({ button: 'right' })

    await expect.poll(() => window.evaluate(() => document.defaultView?.getSelection()?.toString() ?? '')).toBe('')
    await app.close()
  })

  test('clears document selection when the disclosure circle is right-clicked', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    await typeInto(node(window, 1), 'Parent')
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Another parent')
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'aaa aaa fff - 1')
    await window.keyboard.press('End')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 4), 'fdf')
    await window.getByRole('button', { name: 'Enter node 4' }).click({ button: 'right' })

    await expect.poll(() => window.evaluate(() => document.defaultView?.getSelection()?.toString() ?? '')).toBe('')
    await app.close()
  })
})
