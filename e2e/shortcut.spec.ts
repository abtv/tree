import { expect, launchTree, node, test, typeInto } from './fixtures'

test.describe('Cmd+0', () => {
  test('is registered globally and preserves the document and selection', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Alpha')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'Beta')

    const registered = await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('CommandOrControl+0'))
    expect(registered).toBe(true)

    await window.keyboard.press('Meta+0')

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    await expect(node(window, 1)).toHaveValue('Alpha')
    await expect(node(window, 2)).toHaveValue('Beta')
    await expect(node(window, 2)).toBeFocused()
  })
})

test.describe('Cmd+Q', () => {
  test('quits the application from an editable node', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))

    await node(window, 1)
      .press('Meta+q')
      .catch(() => undefined)

    await closed
  })

  test('quits after an edit has queued persistence', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)
    const closed = new Promise<void>((resolve) => app.once('close', resolve))

    await typeInto(node(window, 1), 'pending persistence '.repeat(100))
    await node(window, 1)
      .press('Meta+q')
      .catch(() => undefined)

    await closed
  })
})
