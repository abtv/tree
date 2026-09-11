import {
  attachmentFiles,
  expect,
  firePaste,
  launchTree,
  node,
  parent,
  readPersisted,
  test,
  typeInto,
  writeClipboardImage,
} from './fixtures'

test.describe('persistence', () => {
  test('restores the document, current parent, and selected node after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await typeInto(node(first.window, 1), 'Projects')
    await first.window.keyboard.press('Meta+.')
    await first.window.keyboard.press('Enter')
    await typeInto(node(first.window, 1), 'Work')

    await expect.poll(() => readPersisted(userDataDir).location.currentParentId).not.toBeNull()
    const persisted = readPersisted(userDataDir)
    const parentId = persisted.document.roots[0]!.id
    const childId = persisted.document.roots[0]!.children[0]!.id
    expect(persisted.location).toEqual({ currentParentId: parentId, selectedNodeId: childId })

    await first.app.close()
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
    const attachmentId = readPersisted(userDataDir).document.roots[0]!.attachment!.id

    await first.app.close()
    const second = await launchTree(userDataDir)

    await expect(second.window.getByAltText('Attached image')).toBeVisible()
    expect(attachmentFiles(userDataDir)).toEqual([`${attachmentId}.png`])
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

    await first.app.close()
    const second = await launchTree(userDataDir)

    await expect(second.window.locator('input[aria-label^="Node "]')).toHaveCount(1)
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(0)
  })
})
