import {
  attachmentFiles,
  expect,
  firePaste,
  launchTree,
  node,
  nodeTexts,
  setCursor,
  test,
  typeInto,
  writeClipboardImage,
  writeClipboardImageAndText,
  writeClipboardText,
} from './fixtures'

test.describe('clipboard', () => {
  test('pastes plain text at the cursor', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'abcdef')
    await setCursor(node(window, 1), 3)
    await writeClipboardText(app, 'XYZ')
    await firePaste(node(window, 1))

    await expect(node(window, 1)).toHaveValue('abcXYZdef')
  })

  test('pastes multiline text as separate nodes', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'abcdef')
    await setCursor(node(window, 1), 3)
    await writeClipboardText(app, 'one\ntwo\nthree')
    await firePaste(node(window, 1))

    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(3)
    expect(await nodeTexts(window)).toEqual(['abcone', 'two', 'threedef'])
  })

  test('pastes an image as an attachment', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImage(app)
    await firePaste(node(window, 1))

    await expect(window.getByAltText('Attached image')).toBeVisible()
    await expect(node(window, 1)).toHaveValue('')
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(1)
  })

  test('prefers the image representation over text', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImageAndText(app)
    await firePaste(node(window, 1))

    await expect(window.getByAltText('Attached image')).toBeVisible()
    await expect(node(window, 1)).toHaveValue('')
  })

  test('pasting an image onto a node that already has one creates a sibling', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImage(app)
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toHaveCount(1)

    await firePaste(node(window, 1))
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    await expect(window.getByAltText('Attached image')).toHaveCount(2)
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(2)
  })
})
