// @editing-modes: pending
import { documentPath, expect, launchTree, node, test, tryReadPersisted } from './fixtures'

test.describe('initial state', () => {
  // @requirement PRODUCT.md §3
  // @requirement PRODUCT.md §19
  // @requirement PRODUCT.md §20.3
  test('first launch creates one empty focused root that is persisted', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await expect(window.locator('body')).toHaveCSS('font-family', '"JetBrains Mono"')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 1)).toBeFocused()

    await expect.poll(() => tryReadPersisted(userDataDir)?.document.roots ?? []).toHaveLength(1)
    await expect.poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.text ?? '').toBe('')
    expect(documentPath(userDataDir)).toContain('document.json')
  })
})
