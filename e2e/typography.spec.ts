// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  node,
  screenshotContentSize,
  seedDocument,
  setMainWindowContentSize,
  test,
  typeInto,
} from './fixtures'

describeForEachEditingMode('typography', ({ screenshotName }) => {
  // @requirement PRODUCT.md §20.3
  test('typed URL characters render as typed, without font ligatures', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: '', links: [], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    const editor = node(window, 1)
    await typeInto(editor, 'http://localhost:8080 test me')
    await expect(editor).toHaveValue('http://localhost:8080 test me')
    // The bundled font draws "://l" as a ligature that moves the second slash and reads as ": /l".
    await expect(editor).toHaveCSS('font-variant-ligatures', 'none')
    await expect(editor).toHaveScreenshot(screenshotName('typed-url-without-ligatures.png'))
  })

  // @requirement PRODUCT.md §20.3
  test('linked text renders without font ligatures', async ({ userDataDir }) => {
    const url = 'http://localhost:8080'
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: url, links: [{ start: 0, end: url.length, url }], children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'root' },
    })
    const { app, window } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    const editor = node(window, 1)
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    await expect(editor).toHaveCSS('font-variant-ligatures', 'none')
    await expect(editor).toHaveScreenshot(screenshotName('linked-url-without-ligatures.png'))
  })
})
