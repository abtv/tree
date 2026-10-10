// @editing-modes: both
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  allowRendererError,
  closeApp,
  describeForEachEditingMode,
  exactMessage,
  expect,
  launchTree,
  node,
  nodeTexts,
  seedDocument,
  attachmentPath,
  startRowDrag,
  test,
} from './fixtures'
import { MAX_DOCUMENT_DEPTH } from '../src/domain/document'

function seedAttachmentImage(userDataDir: string, attachmentId: string): void {
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(
    attachmentPath(userDataDir, attachmentId),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAMgAAACWCAYAAACb3McZAAABmklEQVR4nO3TMRHAIADAQOSgqYpxBQZ6WWH44fcsGfNbG/g3bgfAywwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAMAsEgEAwCwSAQDALBIBAOQJHaVsxH0sYAAAAASUVORK5CYII=',
      'base64',
    ),
  )
}

function hierarchySeed(): { document: unknown; location: unknown } {
  return {
    document: {
      roots: [
        {
          id: 'a',
          text: 'Alpha',
          children: [
            { id: 'a1', text: 'Alpha child one', children: [] },
            { id: 'a2', text: 'Alpha child two', children: [] },
          ],
        },
        { id: 'b', text: 'Bravo', children: [] },
        { id: 'c', text: 'Charlie', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'b' },
  }
}

async function openAlpha(window: Parameters<typeof node>[0]): Promise<void> {
  if ((await window.getByRole('button', { name: 'Collapse node 1' }).count()) === 0)
    await window.getByRole('button', { name: 'Expand node 1' }).click()
}

async function dragToGap(
  window: Parameters<typeof node>[0],
  sourceId: string,
  targetId: string,
  edge: 'top' | 'bottom',
  horizontalSteps: number,
): Promise<void> {
  const source = window.locator(`.node-row[data-node-id="${sourceId}"] .node-input`)
  const sourceBox = await source.boundingBox()
  const targetBox = await window.locator(`.node-row[data-node-id="${targetId}"]`).boundingBox()
  if (sourceBox === null || targetBox === null) throw new Error('A drag row was not rendered.')
  const pressX = sourceBox.x + 8
  await startRowDrag(window, source, { xOffset: 8 })
  const clientY = edge === 'top' ? targetBox.y + 2 : targetBox.y + targetBox.height - 2
  await window.mouse.move(pressX + horizontalSteps * 20, clientY, { steps: 5 })
}

async function dragOntoRow(window: Parameters<typeof node>[0], sourceId: string, targetId: string): Promise<void> {
  const source = window.locator(`.node-row[data-node-id="${sourceId}"] .node-input`)
  const box = await window.locator(`.node-row[data-node-id="${targetId}"]`).boundingBox()
  if (box === null) throw new Error('The receiving row was not rendered.')
  await startRowDrag(window, source)
  await window.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 5 })
}

/**
 * Waits until a pointer held in the bottom auto-scroll zone has scrolled the viewport to its end.
 *
 * A held pointer inside the edge margin scrolls the list frame by frame (PRODUCT.md §20.1), moving rows
 * under it. The 21-row depth fixtures overflow the default window by a few pixels, so a target near the
 * bottom edge shifts at a frame whose timing the test does not control. Settle the scroll first, then
 * aim at the target's final position, which lies outside the zone.
 */
async function settleAtViewportEnd(window: Parameters<typeof node>[0]): Promise<void> {
  await expect
    .poll(() =>
      window.evaluate(() => {
        const viewport = document.querySelector('.scroll-viewport') as HTMLElement
        return Math.abs(viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop) <= 1
      }),
    )
    .toBe(true)
}

function breadcrumbSeed(expanded = false): { version: number; document: unknown; location: unknown; view: unknown } {
  return {
    version: 3,
    document: {
      roots: [
        {
          id: 'r',
          text: 'Ancestor',
          children: [
            {
              id: 'p',
              text: 'Parent',
              children: [{ id: 'x', text: 'Moved', children: [{ id: 'leaf', text: 'Subtree', children: [] }] }],
            },
            { id: 's', text: 'Sibling', children: [] },
          ],
        },
        { id: 'tail', text: 'Last root', children: [] },
      ],
    },
    location: { currentParentId: 'p', selectedNodeId: 'x' },
    view: { expandedIds: expanded ? ['r', 'p'] : [] },
  }
}

async function hoverBreadcrumb(window: Parameters<typeof node>[0], selector: string): Promise<void> {
  const segment = await window.locator(selector).boundingBox()
  const toolbar = await window.locator('.location-bar').boundingBox()
  if (segment === null || toolbar === null) throw new Error('The breadcrumb was not rendered.')
  await window.mouse.move(segment.x + segment.width / 2, toolbar.y + toolbar.height / 2, { steps: 5 })
}

// @requirement PRODUCT.md §2.2
// @requirement PRODUCT.md §10
// @requirement PRODUCT.md §11
describeForEachEditingMode('breadcrumb drag and drop', ({ mode }) => {
  for (const focused of [false, true]) {
    test(`moves an image-only subtree from a ${focused ? 'focused' : 'unfocused'} row onto a breadcrumb`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            {
              id: 'p',
              text: 'Parent',
              children: [
                { id: 'x', text: '', attachment: { id: 'image', mimeType: 'image/png' }, children: [] },
                { id: 'other', text: 'Other', children: [] },
              ],
            },
          ],
        },
        location: { currentParentId: 'p', selectedNodeId: focused ? 'x' : 'other' },
      })
      seedAttachmentImage(userDataDir, 'image')
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const row = window.locator('.node-row[data-node-id="x"]')
      await startRowDrag(window, focused ? row.locator('.node-input') : row, { xOffset: focused ? 8 : 1 })
      await hoverBreadcrumb(window, '.location-root')
      await expect(window.locator('.location-root')).toHaveClass(/location-drop-target/)
      await window.mouse.up()
      const input = row.locator('.node-input')
      await expect(input).toBeFocused()
      await expect(window.getByAltText('Attached image')).toBeVisible()
      await expect(window.locator('.location-current')).toHaveCount(0)
      if (mode === 'vim') await expect(input).toHaveClass(/node-input-image-caret/)
      await window.keyboard.press('Meta+z')
      await expect(input).toBeFocused()
      await expect(window.locator('.location-current')).toHaveText('Parent')
    })
  }

  test('finds the moved node after unrelated navigation, including Vim undo keys', async ({ userDataDir }) => {
    seedDocument(userDataDir, breadcrumbSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const source = window.locator('.node-row[data-node-id="x"] .node-input')
    await startRowDrag(window, source)
    await hoverBreadcrumb(window, '.location-root')
    await window.mouse.up()
    await window.locator('.node-row[data-node-id="tail"] .node-enter-control').click()
    await expect(window.locator('.location-current')).toHaveText('Last root')
    await window.keyboard.press(mode === 'vim' ? 'u' : 'Meta+z')
    await expect(window.locator('.location-current')).toHaveText('Parent')
    await expect(source).toBeFocused()
    await window.keyboard.press(mode === 'vim' ? 'Control+r' : 'Meta+Shift+z')
    await expect(window.locator('.location-current')).toHaveCount(0)
    await expect(source).toBeFocused()
    await startRowDrag(window, source)
    await hoverBreadcrumb(window, '.location-root')
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    await expect(window.locator('.location-drop-target')).toHaveCount(0)
    await window.mouse.up()
    await expect(window.locator('.node-row').last()).toHaveAttribute('data-node-id', 'x')
  })
  for (const destination of ['ancestor', 'root']) {
    for (const expanded of [false, true]) {
      test(`appends to ${destination} and undo ${expanded ? 'keeps the visible level' : 'navigates to the hidden node'}`, async ({
        userDataDir,
      }) => {
        seedDocument(userDataDir, breadcrumbSeed(expanded))
        const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
        const source = window.locator('.node-row[data-node-id="x"] .node-input')
        await startRowDrag(window, source)
        const selector = destination === 'root' ? '.location-root' : '.location-segment[data-breadcrumb-id="r"]'
        await hoverBreadcrumb(window, selector)
        await expect(window.locator('.location-drop-target')).toHaveCount(1)
        await expect(window.locator('.node-row-drop-before, .node-row-drop-after, .node-row-drop-on')).toHaveCount(0)
        await window.mouse.up()
        await expect(source).toBeFocused()
        await expect(window.locator('.node-row').last()).toHaveAttribute('data-node-id', 'x')
        await expect(window.locator('.location-current')).toHaveText(destination === 'root' ? [] : 'Ancestor')
        await window.keyboard.press('Meta+z')
        await expect(source).toBeFocused()
        if (expanded) {
          await expect(window.locator('.location-current')).toHaveText(destination === 'root' ? [] : 'Ancestor')
          await expect(window.locator('.node-row[data-node-id="x"]')).toHaveAttribute(
            'data-depth',
            destination === 'root' ? '2' : '1',
          )
        } else await expect(window.locator('.location-current')).toHaveText('Parent')
        expect(await source.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
        await window.keyboard.press('Meta+Shift+z')
        await expect(source).toBeFocused()
        // A redone root is hidden from the old parent's location; a visible ancestor location stays.
        await expect(window.locator('.location-current')).toHaveText(destination === 'root' ? [] : 'Ancestor')
        await expect(window.locator('.location-drop-target')).toHaveCount(0)
      })
    }
  }

  test('rejects the current parent and toolbar whitespace, and clears cancelled breadcrumb highlights', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, breadcrumbSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const source = window.locator('.node-row[data-node-id="x"] .node-input')
    await startRowDrag(window, source)
    await hoverBreadcrumb(window, '.location-segment[data-breadcrumb-id="p"]')
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    await expect(window.locator('.location-drop-target')).toHaveCount(0)
    await window.mouse.up()
    await expect(window.locator('.location-current')).toHaveText('Parent')
    await startRowDrag(window, source)
    await hoverBreadcrumb(window, '.location-root')
    await expect(window.locator('.location-drop-target')).toHaveCount(1)
    const toolbar = await window.locator('.location-bar').boundingBox()
    if (toolbar === null) throw new Error('The toolbar was not rendered.')
    await window.mouse.move(toolbar.x + toolbar.width - 2, toolbar.y + toolbar.height / 2)
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    await expect(window.locator('.location-drop-target')).toHaveCount(0)
    await hoverBreadcrumb(window, '.location-root')
    await window.keyboard.press('Escape')
    await expect(window.locator('.location-drop-target')).toHaveCount(0)
    await window.mouse.up()
    await expect(source).toBeFocused()
    await expect(window.locator('.location-current')).toHaveText('Parent')
  })

  test('highlights the full ancestor hit region in both appearances without shifting layout', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, breadcrumbSeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const toolbar = window.locator('.location-bar')
    const ancestor = window.locator('.location-segment[data-breadcrumb-id="r"]')
    const before = await ancestor.boundingBox()
    await startRowDrag(window, window.locator('.node-row[data-node-id="x"] .node-input'))
    await hoverBreadcrumb(window, '.location-segment[data-breadcrumb-id="r"]')
    await expect(ancestor).toHaveClass(/location-drop-target/)
    expect(await ancestor.boundingBox()).toEqual(before)
    const geometry = await ancestor.evaluate((element) => {
      const bar = element.closest('.location-bar')!.getBoundingClientRect()
      const segment = element.getBoundingClientRect()
      return { top: segment.top - bar.top, bottom: bar.bottom - segment.bottom }
    })
    expect(geometry.top).toBe(0)
    expect(geometry.bottom).toBeLessThanOrEqual(1)
    await expect(toolbar).toHaveScreenshot(`breadcrumb-target-${mode}-light.png`)
    await window.emulateMedia({ colorScheme: 'dark' })
    await expect(toolbar).toHaveScreenshot(`breadcrumb-target-${mode}-dark.png`)
    await window.keyboard.press('Escape')
    await window.mouse.up()
  })

  for (const state of mode === 'vim' ? ['normal', 'insert', 'replace', 'visual', 'visual-node'] : ['insert']) {
    test(`resolves ${state} mode and its caret after a breadcrumb drop`, async ({ userDataDir }) => {
      seedDocument(userDataDir, breadcrumbSeed())
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const source = window.locator('.node-row[data-node-id="x"] .node-input')
      await source.focus()
      if (mode === 'vim') {
        if (state === 'insert') await window.keyboard.press('i')
        if (state === 'replace') await window.keyboard.press('R')
        if (state === 'visual') await window.keyboard.press('v')
        if (state === 'visual-node') await window.keyboard.press('V')
      }
      if (state === 'replace' || state === 'insert') await window.keyboard.type('x')
      await startRowDrag(window, source)
      const cursor = await source.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)
      await hoverBreadcrumb(window, '.location-root')
      await window.mouse.up()
      await expect(source).toBeFocused()
      expect(await source.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(cursor)
      if (mode === 'vim')
        await expect(window.getByLabel('Vim mode')).toHaveText(
          state === 'insert' ? 'INSERT' : state === 'visual' ? 'VISUAL' : 'NORMAL',
        )
      await expect(window.locator('.location-current')).toHaveCount(0)
    })
  }
})

// @requirement PRODUCT.md §2.4
// @requirement PRODUCT.md §11
// @requirement PRODUCT.md §20.2.8
describeForEachEditingMode('hierarchy drag and drop', ({ mode }) => {
  const states = mode === 'vim' ? ['normal', 'insert', 'replace', 'visual', 'visual-node'] : ['insert']
  for (const state of states) {
    test(`keeps the caret and resolves ${state} editing when dropping onto a row`, async ({ userDataDir }) => {
      seedDocument(userDataDir, hierarchySeed())
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const source = window.locator('.node-row[data-node-id="b"] .node-input')
      await source.focus()
      if (mode === 'vim') {
        if (state === 'insert') await window.keyboard.press('i')
        if (state === 'replace') await window.keyboard.press('R')
        if (state === 'visual') await window.keyboard.press('v')
        if (state === 'visual-node') await window.keyboard.press('V')
      }
      if (state === 'replace' || state === 'insert') await window.keyboard.type('x')
      await startRowDrag(window, source)
      const frozenCursor = await source.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)
      const parent = await window.locator('.node-row[data-node-id="a"]').boundingBox()
      if (parent === null) throw new Error('The target row was not rendered.')
      await window.mouse.move(parent.x + 30, parent.y + parent.height / 2)
      await expect(window.locator('.node-row-drop-on')).toHaveCount(1)
      await window.mouse.up()
      await expect(source).toBeFocused()
      await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
      await expect(source).toHaveValue(state === 'replace' ? 'xravo' : state === 'insert' ? 'xBravo' : 'Bravo')
      expect(await source.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(frozenCursor)
      if (mode === 'vim') {
        const expectedMode = state === 'insert' ? 'INSERT' : state === 'visual' ? 'VISUAL' : 'NORMAL'
        await expect(window.getByLabel('Vim mode')).toHaveText(expectedMode)
      }
    })
  }

  test('selects a source dragged from its unfocused gutter and starts its caret', async ({ userDataDir }) => {
    const seed = hierarchySeed()
    seed.location = { currentParentId: null, selectedNodeId: 'c' }
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await startRowDrag(window, window.locator('.node-row[data-node-id="b"]'), { xOffset: 1 })
    const parent = await window.locator('.node-row[data-node-id="a"]').boundingBox()
    if (parent === null) throw new Error('The target row was not rendered.')
    await window.mouse.move(parent.x + 30, parent.y + parent.height / 2)
    await window.mouse.up()
    const source = window.locator('.node-row[data-node-id="b"] .node-input')
    await expect(source).toBeFocused()
    expect(await source.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(0)
    await expect(window.locator('.node-row[data-node-id="b"] .node-focus-marker')).toHaveCount(1)
  })

  for (const expanded of [false, true]) {
    test(`appends onto ${expanded ? 'an expanded' : 'a collapsed'} node, opens its fold, and supports undo and redo`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, hierarchySeed())
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      if (expanded) await openAlpha(window)
      await dragOntoRow(window, 'b', 'a')
      const parent = window.locator('.node-row[data-node-id="a"]')
      await expect(parent).toHaveClass(/node-row-drop-on/)
      await window.mouse.up()
      await expect
        .poll(() => nodeTexts(window))
        .toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Bravo', 'Charlie'])
      const moved = window.locator('.node-row[data-node-id="b"]')
      await expect(moved).toHaveAttribute('data-depth', '1')
      await expect(moved.locator('.node-input')).toBeFocused()
      await expect(parent.locator('.node-disclosure-triangle')).toHaveAttribute('aria-expanded', 'true')
      await window.keyboard.press('Meta+z')
      await expect(moved).toHaveAttribute('data-depth', '0')
      await window.keyboard.press('Meta+Shift+z')
      await expect(moved).toHaveAttribute('data-depth', '1')
    })
  }

  test('outlines only the receiving row in both appearances and keeps the edge band as a gap', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const target = window.locator('.node-row[data-node-id="c"]')
    const before = await target.boundingBox()
    if (before === null) throw new Error('The leaf row was not rendered.')
    if (mode === 'vim') await window.keyboard.press('V')
    await dragOntoRow(window, 'b', 'c')
    await expect(target).toHaveClass(/node-row-drop-on/)
    await expect(window.locator('.node-row-drop-on')).toHaveCount(1)
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(0)
    expect(await target.boundingBox()).toEqual(before)
    const captureNodeList = async (appearance: 'light' | 'dark') => {
      const bounds = await window.locator('.node-list').boundingBox()
      if (bounds === null) throw new Error('The node list was not visible for its screenshot.')
      await expect(window).toHaveScreenshot(`hierarchy-row-target-${mode}-${appearance}.png`, { clip: bounds })
    }
    await captureNodeList('light')
    await window.emulateMedia({ colorScheme: 'dark' })
    const darkBox = await target.boundingBox()
    if (darkBox === null) throw new Error('The dark receiving row was not rendered.')
    await window.mouse.move(darkBox.x + 30, darkBox.y + darkBox.height / 2)
    await expect(target).toHaveClass(/node-row-drop-on/)
    await captureNodeList('dark')
    await expect(target).toHaveClass(/node-row-drop-on/)
    await window.emulateMedia({ colorScheme: 'light' })

    const edgeBox = await target.boundingBox()
    if (edgeBox === null) throw new Error('The receiving row was not rendered after appearance switching.')
    await window.mouse.move(edgeBox.x + 30, edgeBox.y + 2)
    await expect(target).toHaveClass(/node-row-drop-before/)
    await expect(window.locator('.node-row-drop-on')).toHaveCount(0)
    await window.mouse.move(edgeBox.x + 30, edgeBox.y + edgeBox.height / 2)
    await expect(target).toHaveClass(/node-row-drop-on/)
    await window.mouse.up()
    await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
    await expect.poll(() => nodeTexts(window)).toEqual(['Alpha', 'Charlie', 'Bravo'])
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('prohibits the source and its descendant row middles and cancels an accepting row with Escape', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)
    const before = await nodeTexts(window)
    await startRowDrag(window, window.locator('.node-row[data-node-id="a"] .node-input'))
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    const child = await window.locator('.node-row[data-node-id="a1"]').boundingBox()
    if (child === null) throw new Error('The descendant row was not rendered.')
    await window.mouse.move(child.x + 30, child.y + child.height / 2)
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    await expect(window.locator('.node-row-drop-on')).toHaveCount(0)
    await window.mouse.up()
    expect(await nodeTexts(window)).toEqual(before)

    await dragOntoRow(window, 'b', 'a')
    await expect(window.locator('.node-row[data-node-id="a"]')).toHaveClass(/node-row-drop-on/)
    await window.keyboard.press('Escape')
    await expect(window.locator('.node-row-drop-on')).toHaveCount(0)
    await window.mouse.up()
    expect(await nodeTexts(window)).toEqual(before)
    await expect(window.locator('.node-row[data-node-id="b"] .node-input')).toBeFocused()
  })

  test('offers an over-depth row target and reports the operation error without moving', async ({ userDataDir }) => {
    const branch = (depth: number): { id: string; text: string; children: unknown[] } => ({
      id: `depth-${depth}`,
      text: `Depth ${depth}`,
      children: depth === MAX_DOCUMENT_DEPTH ? [] : [branch(depth + 1)],
    })
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'source', text: 'Source', children: [] }, branch(1)] },
      location: { currentParentId: null, selectedNodeId: 'source' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    for (let depth = 1; depth < MAX_DOCUMENT_DEPTH; depth += 1) {
      await window.locator(`.node-row[data-node-id="depth-${depth}"] .node-disclosure-triangle`).click()
    }
    const message = `Operation failed: Nodes cannot be nested deeper than ${MAX_DOCUMENT_DEPTH} levels.`
    allowRendererError(exactMessage(message))
    const target = window.locator(`.node-row[data-node-id="depth-${MAX_DOCUMENT_DEPTH}"]`)
    await dragOntoRow(window, 'source', `depth-${MAX_DOCUMENT_DEPTH}`)
    await settleAtViewportEnd(window)
    const settled = await target.boundingBox()
    if (settled === null) throw new Error('The receiving row was not rendered after auto-scroll.')
    await window.mouse.move(settled.x + 30, settled.y + settled.height / 2)
    await expect(target).toHaveClass(/node-row-drop-on/)
    await expect(window.locator('.node-row-drop-on')).toHaveCount(1)
    await window.mouse.up()
    await expect(window.getByRole('alert')).toHaveText(message)
    await expect(window.locator('.node-row[data-node-id="source"]')).toHaveAttribute('data-depth', '0')
  })

  test('nests at the selected gap level, supports undo and redo, and survives restart', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await node(window, 4).focus()
    if (mode === 'vim') await window.keyboard.press('V')
    await dragToGap(window, 'b', 'b', 'top', 1)
    const movedRow = window.locator('.node-row[data-node-id="b"]')
    await expect(movedRow).toHaveClass(/node-row-drop-before/)
    const captureNodeList = async (appearance: 'light' | 'dark') => {
      const bounds = await window.locator('.node-list').boundingBox()
      if (bounds === null) throw new Error('The node list was not visible for its screenshot.')
      await expect(window).toHaveScreenshot(`hierarchy-level-marker-${mode}-${appearance}.png`, { clip: bounds })
    }
    await captureNodeList('light')

    const geometry = await movedRow.evaluate((row) => {
      const listBox = row.closest('.node-list')!.getBoundingClientRect()
      const rowBox = row.getBoundingClientRect()
      const left = Number.parseFloat(getComputedStyle(row, '::before').left)
      return { listLeft: listBox.left, rowLeft: rowBox.left, markerLeft: left }
    })
    expect(geometry.rowLeft + geometry.markerLeft).toBeCloseTo(geometry.listLeft + 48, 0)
    await window.emulateMedia({ colorScheme: 'dark' })
    await captureNodeList('dark')
    await window.emulateMedia({ colorScheme: 'light' })
    await window.mouse.up()

    await expect(movedRow).toHaveAttribute('data-depth', '1')
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('Meta+z')
    await expect(movedRow).toHaveAttribute('data-depth', '0')
    await window.keyboard.press('Meta+Shift+z')
    await expect(movedRow).toHaveAttribute('data-depth', '1')

    await closeApp(app)
    const reopened = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(reopened.window)
    await expect(reopened.window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '1')
  })

  test('outdents a visible child to the root at the selected gap level', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await dragToGap(window, 'a1', 'c', 'bottom', -1)
    await window.mouse.up()

    await expect
      .poll(() => nodeTexts(window))
      .toEqual(['Alpha', 'Alpha child two', 'Bravo', 'Charlie', 'Alpha child one'])
    await expect(window.locator('.node-row[data-node-id="a1"]')).toHaveAttribute('data-depth', '0')
  })

  test('moves a distant root node into the expanded branch after its hidden sibling block', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await dragToGap(window, 'c', 'b', 'top', 1)
    await window.mouse.up()

    await expect
      .poll(() => nodeTexts(window))
      .toEqual(['Alpha', 'Alpha child one', 'Alpha child two', 'Charlie', 'Bravo'])
    await expect(window.locator('.node-row[data-node-id="c"]')).toHaveAttribute('data-depth', '1')
  })

  test('shows a prohibiting cursor over a gap inside the dragged subtree and changes nothing', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)
    const before = await nodeTexts(window)

    await dragToGap(window, 'a', 'a1', 'top', 0)
    await expect(window.locator('body')).toHaveClass(/node-drag-invalid/)
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(0)
    await window.mouse.up()

    expect(await nodeTexts(window)).toEqual(before)
    await expect(window.locator('.node-row-dragging')).toHaveCount(0)
  })

  test('Escape cancels a gap move without changing hierarchy', async ({ userDataDir }) => {
    seedDocument(userDataDir, hierarchySeed())
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await openAlpha(window)

    await dragToGap(window, 'b', 'b', 'top', 1)
    await expect(window.locator('.node-row[data-node-id="b"]')).toHaveClass(/node-row-drop-before/)
    await window.keyboard.press('Escape')
    await window.mouse.up()

    await expect(window.locator('.node-row[data-node-id="b"]')).toHaveAttribute('data-depth', '0')
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
  })

  test('preserves whole-node Visual mode for a same-parent reorder', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'Alpha', children: [] },
          { id: 'b', text: 'Bravo', children: [] },
          { id: 'c', text: 'Charlie', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'b' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    if (mode === 'vim') {
      await node(window, 2).focus()
      await window.keyboard.press('V')
      await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    }

    await dragToGap(window, 'b', 'a', 'top', 0)
    await window.mouse.up()

    await expect.poll(() => nodeTexts(window)).toEqual(['Bravo', 'Alpha', 'Charlie'])
    if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
  })
})

// @requirement PRODUCT.md §2.3
// @requirement PRODUCT.md §11
test.describe('hierarchy drag depth limit', () => {
  test('reports an over-depth gap drop and preserves the document', async ({ userDataDir }) => {
    const branch = (depth: number): { id: string; text: string; children: unknown[] } => ({
      id: `level-${depth}`,
      text: `Level ${depth}`,
      children: depth === 20 ? [] : [branch(depth + 1)],
    })
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'source', text: 'Source', children: [] }, branch(1)] },
      location: { currentParentId: null, selectedNodeId: 'source' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    for (let depth = 1; depth < 20; depth += 1) {
      await window.locator(`.node-row[data-node-id="level-${depth}"] .node-disclosure-triangle`).click()
    }
    allowRendererError(exactMessage('Operation failed: Nodes cannot be nested deeper than 20 levels.'))

    const last = window.locator('.node-row[data-node-id="level-20"]')
    const source = window.locator('.node-row[data-node-id="source"] .node-input')
    const sourceBox = await source.boundingBox()
    const lastBox = await last.boundingBox()
    if (sourceBox === null || lastBox === null) throw new Error('The depth-limit drag rows were not rendered.')
    await startRowDrag(window, source, { xOffset: 8 })
    await window.mouse.move(sourceBox.x + 8 + 20 * 20, lastBox.y + lastBox.height - 2, { steps: 5 })
    await settleAtViewportEnd(window)
    const settledBox = await last.boundingBox()
    if (settledBox === null) throw new Error('The last depth-limit row was not rendered after auto-scroll.')
    await window.mouse.move(sourceBox.x + 8 + 20 * 20, settledBox.y + settledBox.height - 2)
    await expect(window.locator('.node-row-drop-after')).toHaveCount(1)
    await window.mouse.up()

    await expect(window.getByRole('alert')).toHaveText(
      'Operation failed: Nodes cannot be nested deeper than 20 levels.',
    )
    await expect(source).toHaveValue('Source')
    await expect(window.locator('.node-row[data-node-id="source"]')).toHaveAttribute('data-depth', '0')
  })
})
