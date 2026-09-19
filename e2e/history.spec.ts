import { existsSync } from 'node:fs'
import {
  attachmentPath,
  dragRow,
  expect,
  firePaste,
  launchTree,
  node,
  nodeTexts,
  readPersisted,
  setCursor,
  test,
  typeInto,
  writeClipboardImage,
  writeClipboardText,
} from './fixtures'

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

  test('undoes and redoes a split', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'Current')
    await setCursor(node(window, 1), 3)
    await window.keyboard.press('Enter')
    await expect(node(window, 1)).toHaveValue('Cur')
    await expect(node(window, 2)).toHaveValue('rent')

    await window.keyboard.press('Meta+z')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('Current')

    await window.keyboard.press('Meta+Shift+z')
    await expect(node(window, 1)).toHaveValue('Cur')
    await expect(node(window, 2)).toHaveValue('rent')
  })

  test('undoes and redoes node and subtree deletion with stable IDs', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'B')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'C')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(3)
    const bId = await window.locator('.node-row').nth(1).getAttribute('data-node-id')
    expect(bId).toBeTruthy()

    await node(window, 2).focus()
    await window.keyboard.press('Meta+Backspace')
    expect(await nodeTexts(window)).toEqual(['A', 'C'])

    await window.keyboard.press('Meta+z')
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C'])
    expect(await window.locator('.node-row').nth(1).getAttribute('data-node-id')).toBe(bId)

    await window.keyboard.press('Meta+Shift+z')
    expect(await nodeTexts(window)).toEqual(['A', 'C'])

    await window.keyboard.press('Meta+z')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'B', 'C'])

    // Give B a child, then delete B's whole subtree.
    await node(window, 2).focus()
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 1), 'Work')
    const childId = await window.locator('.node-row').nth(0).getAttribute('data-node-id')
    expect(childId).toBeTruthy()
    await window.keyboard.press('Meta+,')

    await node(window, 2).focus()
    await window.keyboard.press('Meta+Backspace')
    expect(await nodeTexts(window)).toEqual(['A', 'C'])

    await window.keyboard.press('Meta+z')
    expect(await nodeTexts(window)).toEqual(['A', 'B', 'C'])
    expect(await window.locator('.node-row').nth(1).getAttribute('data-node-id')).toBe(bId)

    await node(window, 2).focus()
    await window.keyboard.press('Meta+.')
    await expect(node(window, 1)).toHaveValue('Work')
    expect(await window.locator('.node-row').nth(0).getAttribute('data-node-id')).toBe(childId)
    await window.keyboard.press('Meta+,')

    await window.keyboard.press('Meta+Shift+z')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'C'])
  })

  test('undoes and redoes sibling reordering', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'A')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 2), 'B')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 3), 'C')
    await window.keyboard.press('Enter')
    await typeInto(node(window, 4), 'D')

    await dragRow(window, 3, 1)
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'D', 'B', 'C'])

    await window.keyboard.press('Meta+z')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'B', 'C', 'D'])

    await window.keyboard.press('Meta+Shift+z')
    await expect.poll(() => nodeTexts(window)).toEqual(['A', 'D', 'B', 'C'])
  })

  test('undoes and redoes text and multiline paste', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await typeInto(node(window, 1), 'ab')
    await setCursor(node(window, 1), 2)
    await writeClipboardText(app, 'XYZ')
    await firePaste(node(window, 1))
    await expect(node(window, 1)).toHaveValue('abXYZ')

    await window.keyboard.press('Meta+z')
    await expect(node(window, 1)).toHaveValue('ab')
    await window.keyboard.press('Meta+Shift+z')
    await expect(node(window, 1)).toHaveValue('abXYZ')

    await setCursor(node(window, 1), 0)
    await writeClipboardText(app, 'one\ntwo')
    await firePaste(node(window, 1))
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    expect(await nodeTexts(window)).toEqual(['one', 'twoabXYZ'])

    await window.keyboard.press('Meta+z')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(1)
    await expect(node(window, 1)).toHaveValue('abXYZ')

    await window.keyboard.press('Meta+Shift+z')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(2)
    expect(await nodeTexts(window)).toEqual(['one', 'twoabXYZ'])
  })

  test('undoes and redoes image paste and image-bearing deletion', async ({ userDataDir }) => {
    const { app, window } = await launchTree(userDataDir)

    await writeClipboardImage(app)
    await firePaste(node(window, 1))
    await expect(window.getByAltText('Attached image')).toHaveCount(1)
    await expect.poll(() => readPersisted(userDataDir).document.roots[0]?.attachment?.id).toEqual(expect.any(String))
    const attachmentId = readPersisted(userDataDir).document.roots[0]!.attachment!.id

    await window.keyboard.press('Meta+z')
    await expect(window.getByAltText('Attached image')).toHaveCount(0)

    await window.keyboard.press('Meta+Shift+z')
    await expect(window.getByAltText('Attached image')).toHaveCount(1)
    expect(readPersisted(userDataDir).document.roots[0]?.attachment?.id).toBe(attachmentId)

    await node(window, 1).press('Meta+Backspace')
    await expect(window.getByAltText('Attached image')).toHaveCount(0)

    await window.keyboard.press('Meta+z')
    await expect(window.getByAltText('Attached image')).toHaveCount(1)
    expect(readPersisted(userDataDir).document.roots[0]?.attachment?.id).toBe(attachmentId)
    expect(existsSync(attachmentPath(userDataDir, attachmentId))).toBe(true)
  })
})
