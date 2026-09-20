import {
  allowRendererError,
  attachmentFiles,
  closeApp,
  documentGenerations,
  documentPath,
  expect,
  firePaste,
  launchTree,
  node,
  parent,
  readMainWindowBounds,
  readPersisted,
  seedDocument,
  setMainWindowBounds,
  test,
  tryReadPersisted,
  tryReadWindowBounds,
  typeInto,
  writeClipboardImage,
  writeClipboardText,
} from './fixtures'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function depthSeed(depth: number) {
  const root = { id: 'n0', text: 'Level 1', children: [] as Array<{ id: string; text: string; children: never[] }> }
  let current = root
  for (let index = 1; index < depth; index += 1) {
    const child = { id: `n${index}`, text: `Level ${index + 1}`, children: [] as never[] }
    current.children.push(child)
    current = child
  }
  return {
    document: { roots: [root] },
    location: { currentParentId: depth === 1 ? null : current.id, selectedNodeId: current.id },
  }
}

function depthSeedWithLeaf(parentDepth: number) {
  type BuiltNode = { id: string; text: string; children: BuiltNode[] }
  const root: BuiltNode = { id: 'n0', text: 'Level 1', children: [] }
  let current = root
  for (let index = 1; index < parentDepth; index += 1) {
    const child: BuiltNode = { id: `n${index}`, text: `Level ${index + 1}`, children: [] }
    current.children.push(child)
    current = child
  }
  const leaf: BuiltNode = { id: `n${parentDepth}`, text: `Level ${parentDepth + 1}`, children: [] }
  current.children.push(leaf)
  return {
    document: { roots: [root] },
    location: { currentParentId: current.id, selectedNodeId: leaf.id },
  }
}

test.describe('persistence', () => {
  test('rejects a child below level 20 without changing the editor or persisted bytes', async ({ userDataDir }) => {
    seedDocument(userDataDir, depthSeed(20))
    const before = readFileSync(`${userDataDir}/data/document.json`)
    const { app, window } = await launchTree(userDataDir)

    await window.keyboard.press('Enter')
    await expect(window.getByRole('alert')).toHaveText(
      'Operation failed: Nodes cannot be nested deeper than 20 levels.',
    )
    expect(readFileSync(`${userDataDir}/data/document.json`)).toEqual(before)
    await closeApp(app)
  })

  test('shows the document error and leaves an over-depth file byte-for-byte unchanged', async ({ userDataDir }) => {
    seedDocument(userDataDir, depthSeed(21))
    const before = readFileSync(`${userDataDir}/data/document.json`)
    const { window } = await launchTree(userDataDir, { expectReady: false })

    await expect(window.getByRole('alert')).toContainText('Nodes cannot be nested deeper than 20 levels.')
    expect(readFileSync(`${userDataDir}/data/document.json`)).toEqual(before)
  })

  test('does not surface a save error during rapid edits', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const text = 'rapid '.repeat(100)

    await typeInto(node(window, 1), text)
    await expect.poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.text, { timeout: 15_000 }).toBe(text)
  })

  test('restores the document, current parent, and selected node after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await typeInto(node(first.window, 1), 'Projects')
    await first.window.keyboard.press('Meta+.')
    await first.window.keyboard.press('Enter')
    await typeInto(node(first.window, 1), 'Work')

    await closeApp(first.app)
    const persisted = readPersisted(userDataDir)
    expect(persisted.document.roots[0]?.text).toBe('Projects')
    const parentId = persisted.document.roots[0]!.id
    const childId = persisted.document.roots[0]!.children[0]!.id
    expect(persisted.document.roots[0]!.children[0]!.text).toBe('Work')
    expect(persisted.location).toEqual({ currentParentId: parentId, selectedNodeId: childId })

    const second = await launchTree(userDataDir)

    await expect(parent(second.window)).toHaveValue('Projects')
    await expect(node(second.window, 1)).toHaveValue('Work')
    await expect(node(second.window, 1)).toBeFocused()
  })

  test('restores the main window size and position after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)
    const requestedBounds = { x: 120, y: 140, width: 900, height: 600 }

    await setMainWindowBounds(first.app, requestedBounds)
    await expect.poll(() => tryReadWindowBounds(userDataDir)).toEqual(requestedBounds)

    await closeApp(first.app)
    const second = await launchTree(userDataDir)
    const restoredBounds = await readMainWindowBounds(second.app)

    expect(restoredBounds).toEqual(expect.objectContaining(requestedBounds))
  })

  test('restores an image attachment after restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await writeClipboardImage(first.app)
    await firePaste(node(first.window, 1))
    await expect(first.window.getByAltText('Attached image')).toBeVisible()
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(1)
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.attachment?.id)
      .toEqual(expect.any(String))
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

  test('retains an attachment referenced only by a generation across restart', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await typeInto(node(first.window, 1), 'Recover me')
    await writeClipboardImage(first.app)
    await firePaste(node(first.window, 1))
    await expect(first.window.getByAltText('Attached image')).toBeVisible()
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(1)
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.attachment?.id)
      .toEqual(expect.any(String))
    const attachmentId = readPersisted(userDataDir).document.roots[0]!.attachment!.id

    await node(first.window, 1).focus()
    await first.window.keyboard.press('Meta+Backspace')
    await expect(first.window.getByAltText('Attached image')).toHaveCount(0)

    await closeApp(first.app)
    expect(readPersisted(userDataDir).document.roots[0]?.attachment).toBeUndefined()
    const generation = documentGenerations(userDataDir).find((name) => {
      const state = JSON.parse(readFileSync(join(userDataDir, 'data', name), 'utf8')) as {
        document: { roots: { attachment?: { id: string } }[] }
      }
      return state.document.roots[0]?.attachment?.id === attachmentId
    })
    expect(generation).toBeDefined()
    expect(attachmentFiles(userDataDir)).toEqual([`${attachmentId}.png`])

    const second = await launchTree(userDataDir)
    await expect(second.window.getByAltText('Attached image')).toHaveCount(0)
    await expect.poll(() => attachmentFiles(userDataDir)).toEqual([`${attachmentId}.png`])
    await closeApp(second.app)
    expect(attachmentFiles(userDataDir)).toEqual([`${attachmentId}.png`])
  })

  test('recovers a generation document including its image after the primary is damaged', async ({ userDataDir }) => {
    const first = await launchTree(userDataDir)

    await typeInto(node(first.window, 1), 'Recover me')
    await writeClipboardImage(first.app)
    await firePaste(node(first.window, 1))
    await expect(first.window.getByAltText('Attached image')).toBeVisible()
    await expect.poll(() => attachmentFiles(userDataDir)).toHaveLength(1)
    await expect
      .poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.attachment?.id)
      .toEqual(expect.any(String))
    const attachmentId = readPersisted(userDataDir).document.roots[0]!.attachment!.id

    await node(first.window, 1).focus()
    await first.window.keyboard.press('Meta+Backspace')
    await expect(first.window.getByAltText('Attached image')).toHaveCount(0)
    await closeApp(first.app)

    const generation = documentGenerations(userDataDir).find((name) => {
      const state = JSON.parse(readFileSync(join(userDataDir, 'data', name), 'utf8')) as {
        document: { roots: { attachment?: { id: string } }[] }
      }
      return state.document.roots[0]?.attachment?.id === attachmentId
    })
    expect(generation).toBeDefined()

    writeFileSync(documentPath(userDataDir), '{ damaged')
    const second = await launchTree(userDataDir)

    await expect(node(second.window, 1)).toHaveValue('Recover me')
    await expect(second.window.getByAltText('Attached image')).toBeVisible()
    expect(attachmentFiles(userDataDir)).toEqual([`${attachmentId}.png`])
    await closeApp(second.app)
  })

  test('enters a level-20 leaf through its indicator and still rejects creating a child', async ({ userDataDir }) => {
    seedDocument(userDataDir, depthSeedWithLeaf(19))
    const before = readFileSync(documentPath(userDataDir))
    const { window } = await launchTree(userDataDir)
    allowRendererError(/^Operation failed: Nodes cannot be nested deeper than 20 levels\.$/)

    await window.getByRole('button', { name: 'Enter node 1' }).click()
    await expect(parent(window)).toHaveValue('Level 20')
    await expect(window.locator('[aria-label^="Node "]')).toHaveCount(0)

    await window.keyboard.press('Enter')
    await expect(window.getByRole('alert')).toHaveText(
      'Operation failed: Nodes cannot be nested deeper than 20 levels.',
    )
    expect(readFileSync(documentPath(userDataDir))).toEqual(before)
  })
})
