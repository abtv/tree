import { documentPath, expect, launchTree, node, readPersisted, test } from './fixtures'

test.describe('initial state', () => {
  test('first launch creates one empty focused root that is persisted', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 1)).toBeFocused()

    await expect.poll(() => readPersisted(userDataDir).document.roots).toHaveLength(1)
    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.text).toBe('')
    expect(documentPath(userDataDir)).toContain('document.json')
  })
})
