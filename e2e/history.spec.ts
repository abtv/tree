import { expect, launchTree, node, readPersisted, test, typeInto } from './fixtures'

test.describe('undo and redo', () => {
  test('undoes and redoes a text edit', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'First')
    await expect(node(window, 1)).toHaveValue('First')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('')

    await window.keyboard.press('Meta+Shift+z')
    await expect(node(window, 1)).toHaveValue('First')
  })

  test('undoes a structural node creation', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)

    await window.keyboard.press('Meta+z')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('A')
  })

  test('keeps node IDs stable across undo and redo', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.id).toBeTruthy()
    const rootId = readPersisted(userDataDir).document.roots[0]!.id

    await window.keyboard.press('Enter')
    await window.keyboard.press('Meta+z')
    await window.keyboard.press('Meta+Shift+z')

    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.id).toBe(rootId)
  })
})
