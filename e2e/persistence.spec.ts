import {
  attachmentFiles,
  closeApp,
  expect,
  firePaste,
  launchTree,
  node,
  parent,
  readPersisted,
  test,
  typeInto,
  writeClipboardImage,
  writeClipboardText,
} from './fixtures'

test.describe('persistence', () => {
  test('does not surface a save error during rapid edits', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const text = 'rapid '.repeat(100)

    await typeInto(node(window, 1), text)
    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.text).toBe(text)
  })

  test('restores the document, current parent, and selected node after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await typeInto(node(first.window, 1), 'Projects')
    await first.window.keyboard.press('Meta+.')
    await first.window.keyboard.press('Enter')
    await typeInto(node(first.window, 1), 'Work')

    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.children[0]?.text).toBe('Work')
    const persisted = readPersisted(userDataDir)
    const parentId = persisted.document.roots[0]!.id
    const childId = persisted.document.roots[0]!.children[0]!.id
    expect(persisted.location).toEqual({ currentParentId: parentId, selectedNodeId: childId })

    await closeApp(first.app)
    const second = await launchTree(userDataDir)

    await expect(parent(second.window)).toHaveValue('Projects')
    await expect(node(second.window, 1)).toHaveValue('Work')
    await expect(node(second.window, 1)).toBeFocused()
  })

  test('restores an image attachment after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await writeClipboardImage(first.app)
    await firePaste(node(first.window, 1))
    await expect(first.window.getByAltText('Attached image')).toBeVisible()
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(1)
    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.attachment?.id).toEqual(expect.any(String))
    const attachmentId = readPersisted(userDataDir).document.roots[0]!.attachment!.id

    await closeApp(first.app)
    const second = await launchTree(userDataDir)

    await expect(second.window.getByAltText('Attached image')).toBeVisible()
    expect(attachmentFiles(userDataDir)).toEqual([`${attachmentId}.png`])
  })

  test('restores a pasted hyperlink after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await writeClipboardText(first.app, 'https://example.com')
    await firePaste(node(first.window, 1))
    await expect(first.window.getByRole('link', { name: 'https://example.com' })).toBeVisible()

    await closeApp(first.app)
    const second = await launchTree(userDataDir)

    await expect(second.window.getByRole('link', { name: 'https://example.com' })).toBeVisible()
  })

  test('removes an attachment file after its node is deleted and the app restarts', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await writeClipboardImage(first.app)
    await firePaste(node(first.window, 1))
    await expect(first.window.getByAltText('Attached image')).toBeVisible()
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(1)

    await node(first.window, 1).focus()
    await first.window.keyboard.press('Meta+Backspace')
    await expect(first.window.getByAltText('Attached image')).toHaveCount(0)

    await closeApp(first.app)
    const second = await launchTree(userDataDir)

    await expect(second.window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(0)
  })
})
