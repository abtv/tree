// @editing-modes: pending
import {
  allowRendererError,
  attachmentFiles,
  closeApp,
  configureHiddenParallelTests,
  documentGenerations,
  documentPath,
  exactMessage,
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
import type { Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function rowsSeed(count: number, suffix = '') {
  return {
    document: {
      roots: Array.from({ length: count }, (_, index) => ({
        id: `r${index}`,
        text: `Row ${index + 1} ${suffix}`.trim(),
        children: [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'r0' },
  }
}

/** Scrolls with the mouse wheel, as a user does, in steps the windowed list can follow. */
async function wheelBy(page: Page, distance: number): Promise<void> {
  const box = page.viewportSize() ?? { width: 800, height: 600 }
  await page.mouse.move(box.width / 2, box.height / 2)
  for (let moved = 0; moved < distance; moved += 1_000) {
    await page.mouse.wheel(0, Math.min(1_000, distance - moved))
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
}

/** The label of a node row wholly inside the lower two thirds of the window, or '' when none is. */
function rowInViewport(page: Page): Promise<string> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll<HTMLTextAreaElement>('.node-list textarea')]
    const row = rows.find((input) => {
      const { top, bottom } = input.getBoundingClientRect()
      return top > window.innerHeight / 3 && bottom < window.innerHeight
    })
    return row?.getAttribute('aria-label') ?? ''
  })
}

function viewportTop(locator: ReturnType<Page['getByRole']>): Promise<number> {
  return locator.evaluate((element) => {
    const row = element.closest<HTMLElement>('[data-node-id]') ?? element
    return Math.round(row.getBoundingClientRect().top)
  })
}

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

// Level 18 with two level-19 children, each holding a level-20 leaf: yanking the second subtree and
// putting it after the first subtree's leaf would place its child at level 21.
function overDepthPasteSeed() {
  type BuiltNode = { id: string; text: string; children: BuiltNode[] }
  const root: BuiltNode = { id: 'n0', text: 'Level 1', children: [] }
  let current = root
  for (let index = 1; index < 18; index += 1) {
    const child: BuiltNode = { id: `n${index}`, text: `Level ${index + 1}`, children: [] }
    current.children.push(child)
    current = child
  }
  const target: BuiltNode = {
    id: 'n18',
    text: 'Level 19',
    children: [{ id: 'n19', text: 'Level 20', children: [] }],
  }
  const source: BuiltNode = {
    id: 'm18',
    text: 'Source level 19',
    children: [{ id: 'm19', text: 'Source level 20', children: [] }],
  }
  current.children.push(target, source)
  return {
    document: { roots: [root] },
    location: { currentParentId: current.id, selectedNodeId: target.id },
  }
}

test.describe('persistence', () => {
  configureHiddenParallelTests()

  // @requirement PRODUCT.md §2.3
  test('rejects a child below level 20 without changing the editor or persisted bytes', async ({ userDataDir }) => {
    seedDocument(userDataDir, depthSeed(20))
    const before = readFileSync(`${userDataDir}/data/document.json`)
    const { app, window } = await launchTree(userDataDir)
    allowRendererError(exactMessage('Operation failed: Nodes cannot be nested deeper than 20 levels.'))

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
    allowRendererError(exactMessage('Operation failed: Nodes cannot be nested deeper than 20 levels.'))
    const { window } = await launchTree(userDataDir, { expectReady: false })

    await expect(window.getByRole('alert')).toContainText('Nodes cannot be nested deeper than 20 levels.')
    expect(readFileSync(`${userDataDir}/data/document.json`)).toEqual(before)
  })

  test('rejects unsafe persisted attachment ids and link destinations before writing', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const before = readFileSync(documentPath(userDataDir))
    const invalidStates = [
      {
        version: 2,
        document: {
          roots: [{ id: 'root', text: '', attachment: { id: '../escape', mimeType: 'image/png' }, children: [] }],
        },
        location: { currentParentId: null, selectedNodeId: 'root' },
      },
      {
        version: 2,
        document: {
          roots: [
            { id: 'root', text: 'unsafe', links: [{ start: 0, end: 6, url: 'javascript:alert(1)' }], children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'root' },
      },
    ]

    for (const state of invalidStates) {
      const result = await window.evaluate(async (payload) => {
        try {
          await (globalThis as typeof globalThis & { treeApi: { save(value: unknown): Promise<void> } }).treeApi.save(
            payload,
          )
          return 'resolved'
        } catch {
          return 'rejected'
        }
      }, state)
      expect(result).toBe('rejected')
      expect(readFileSync(documentPath(userDataDir))).toEqual(before)
    }
  })

  test('does not surface a save error during rapid edits', async ({ userDataDir }) => {
    const { window } = await launchTree(userDataDir)
    const text = 'rapid '.repeat(100)

    await typeInto(node(window, 1), text)
    await expect.poll(() => tryReadPersisted(userDataDir)?.document.roots[0]?.text, { timeout: 15_000 }).toBe(text)
  })

  // @requirement PRODUCT.md §16
  // @requirement PRODUCT.md §16.1
  // @requirement PRODUCT.md §18
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

  for (const { name, seed, distance } of [
    { name: 'a short list', seed: () => rowsSeed(120), distance: 1_200 },
    { name: 'a windowed list', seed: () => rowsSeed(1_000), distance: 20_000 },
    // Wrapped rows are much taller than the windowed list's row estimate, so after a relaunch the
    // page offset of the saved view differs from the one it was saved at.
    {
      name: 'a windowed list of wrapped rows',
      seed: () => rowsSeed(700, 'wrapped words '.repeat(40)),
      distance: 30_000,
    },
  ]) {
    test(`restores where the selected row sat in the window after two relaunches in ${name}`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, seed())
      const first = await launchTree(userDataDir)
      await wheelBy(first.window, distance)

      // Select a row inside the viewport so focusing it does not move the page. A windowed list mounts
      // the rows for the new offset only after its scroll handler runs.
      await expect.poll(() => rowInViewport(first.window)).not.toBe('')
      const label = await rowInViewport(first.window)
      const selected = (page: Page) => page.getByRole('textbox', { name: label, exact: true })
      await selected(first.window).click()
      await expect(selected(first.window)).toBeFocused()
      const savedTop = await viewportTop(selected(first.window))

      await closeApp(first.app)
      expect(readPersisted(userDataDir).view?.selectedRowTop).toBe(savedTop)

      // Relaunch twice without touching the page: the view must survive both. Normal mode starts
      // without the Insert keypress, which as user input would end the restore early.
      for (let relaunch = 0; relaunch < 2; relaunch += 1) {
        const next = await launchTree(userDataDir, { initialMode: 'normal' })
        await expect(selected(next.window)).toBeFocused()
        await expect.poll(() => viewportTop(selected(next.window))).toBe(savedTop)
        await closeApp(next.app)
        expect(readPersisted(userDataDir).view?.selectedRowTop).toBe(savedTop)
      }
    })
  }

  test('shows the selected row at the window edge when scrolling had moved it off-screen', async ({ userDataDir }) => {
    seedDocument(userDataDir, rowsSeed(120))
    const first = await launchTree(userDataDir)
    const firstRow = (page: Page) => page.getByRole('textbox', { name: 'Node 1', exact: true })
    await expect(firstRow(first.window)).toBeFocused()

    await wheelBy(first.window, 2_000)
    await expect(firstRow(first.window)).not.toBeInViewport()
    const contentTop = await first.window.evaluate(
      () => document.querySelector('.scroll-viewport')?.getBoundingClientRect().top ?? 0,
    )
    await closeApp(first.app)
    // The nearest edge is the top of the content area, directly below the toolbar.
    expect(contentTop).toBeGreaterThan(0)
    expect(readPersisted(userDataDir).view?.selectedRowTop).toBe(contentTop)

    const second = await launchTree(userDataDir)
    await expect(firstRow(second.window)).toBeFocused()
    await expect(firstRow(second.window)).toBeInViewport()
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

  test('rejects an over-depth paste without changing the persisted bytes or showing a save error', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, overDepthPasteSeed())
    const before = readFileSync(documentPath(userDataDir))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    allowRendererError(exactMessage('Operation failed: Nodes cannot be nested deeper than 20 levels.'))

    // Yank the level-19 sibling subtree, enter the target's parent, and put the register after the
    // level-20 node: the copied child would land at level 21, so the paste must reject in full.
    await node(window, 2).focus()
    await window.keyboard.press('y')
    await window.keyboard.press('y')
    await window.getByRole('button', { name: 'Enter node 1' }).click()
    await expect(parent(window)).toHaveValue('Level 19')

    await window.keyboard.press('p')
    await expect(window.getByRole('alert')).toHaveText(
      'Operation failed: Nodes cannot be nested deeper than 20 levels.',
    )
    await expect(window.locator('.save-error[role="status"]')).toHaveCount(0)
    await expect(window.locator('.persistence-locked')).toHaveCount(0)
    expect(readFileSync(documentPath(userDataDir))).toEqual(before)
  })
})
