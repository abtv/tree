// @editing-modes: both
import { describeForEachEditingMode, documentPath, expect, launchTree, node, test, tryReadPersisted } from './fixtures'

describeForEachEditingMode('initial state', ({ mode }) => {
  // @requirement PRODUCT.md §3
  // @requirement PRODUCT.md §19
  // @requirement PRODUCT.md §20.3
  test('first launch creates one empty focused root that is persisted', async ({ userDataDir }) => {
    // The standard variant is a true first run with no saved preference, so it also covers the
    // first-run default (PRODUCT.md §20.2.1).
    const { window } = await launchTree(userDataDir, mode === 'standard' ? { vimPreference: 'saved' } : {})

    await expect(window.getByLabel('Vim mode')).toHaveCount(mode === 'vim' ? 1 : 0)
    await expect(window.locator('body')).toHaveCSS('font-family', '"JetBrains Mono"')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('')
    await expect(node(window, 1)).toBeFocused()

    await expect.poll(() => tryReadPersisted(userDataDir)?.document.roots ?? []).toHaveLength(1)
    await expect.poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.text ?? '').toBe('')
    expect(documentPath(userDataDir)).toContain('document.json')
  })
})
