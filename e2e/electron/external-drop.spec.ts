// @editing-modes: both
import { describeForEachEditingMode, expect, launchTree, node, seedDocument, test } from './fixtures'
import { expectExternalDropBlocked } from '../external-drop'

describeForEachEditingMode('external drops', () => {
  // @requirement PRODUCT.md §11
  test('rejects external HTML before native insertion in rich and plain editors', async ({ userDataDir }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'rich', text: '2026-10-25 Original', children: [] },
          { id: 'plain', text: 'Original', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'rich' },
    })
    const { window } = await launchTree(userDataDir)
    await expect(node(window, 1)).toHaveAttribute('contenteditable', 'true')
    await expectExternalDropBlocked(window, node(window, 1))
    await expectExternalDropBlocked(window, node(window, 2))
    await window.screenshot({ path: testInfo.outputPath('external-drop-rejected.png') })
  })
})
