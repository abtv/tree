// @editing-modes: independent
import { expect, launchTree, seedDocument, test } from './fixtures'

// @requirement PRODUCT.md §2.5
test('keeps completion after toggling a node and searching for its person marker', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'team',
          text: '#team-a',
          children: [
            {
              id: 'standup',
              text: '#standup',
              children: [{ id: 'done', text: '@me show a demo of my API! 2026-11-16', children: [] }],
            },
            {
              id: 'alignment',
              text: '#alignment',
              children: [{ id: 'open', text: '@me show a demo of my API 2026-11-16', children: [] }],
            },
          ],
        },
      ],
    },
    location: { currentParentId: 'standup', selectedNodeId: 'done' },
  })
  const { window } = await launchTree(userDataDir)
  const editor = window.locator('[data-node-id="done"] .node-input')
  await editor.focus()
  await window.keyboard.press('Meta+Enter')
  await expect(editor).toHaveClass(/node-input-struck/)

  await window.keyboard.press('Meta+;')
  await window.getByRole('searchbox').fill('@me')
  const title = window.locator('[data-result-id="done"] .recent-node-text')

  await expect(title).toHaveCSS('text-decoration-line', 'line-through')
  await expect(window.locator('[data-result-id="open"] .recent-node-text')).toHaveCSS('text-decoration-line', 'none')
  // Striking the only child leaves its parent, and the parent's path label, normal.
  await expect(window.locator('[data-result-id="done"] .recent-node-path')).toContainText('#standup')
  await expect(window.locator('[data-result-id="done"] .recent-node-path .node-text-struck')).toHaveCount(0)
  for (const appearance of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: appearance })
    await window.screenshot({ path: testInfo.outputPath(`person-search-${appearance}.png`) })
  }
})

// @requirement PRODUCT.md §2.5
test('shows completion in breadcrumbs, starred Search entries and searched parent paths', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'root',
          text: 'Open project',
          children: [
            {
              id: 'done',
              text: 'Done branch',
              struckThrough: true,
              children: [{ id: 'leaf', text: 'Finished task', struckThrough: true, starred: true, children: [] }],
            },
            { id: 'other', text: 'Unfinished task', starred: true, children: [] },
          ],
        },
      ],
    },
    location: { currentParentId: 'done', selectedNodeId: 'leaf' },
  })
  const { window } = await launchTree(userDataDir)
  await expect(window.locator('.location-current')).toHaveText('Done branch')

  for (const appearance of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: appearance })
    const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const muted = await editor.evaluate((element) => getComputedStyle(element).color)
    await expect(window.locator('.location-current')).toHaveCSS('text-decoration-line', 'line-through')
    await expect(window.locator('.location-current')).toHaveCSS('color', muted)
    await expect(window.locator('.location-link')).toHaveCSS('text-decoration-line', 'none')
    await window.screenshot({ path: testInfo.outputPath(`breadcrumbs-${appearance}.png`) })

    await window.keyboard.press('Meta+;')
    const title = window.locator('[data-result-id="leaf"] .recent-node-text')
    await expect(title).toHaveCSS('text-decoration-line', 'line-through')
    await expect(title).toHaveCSS('color', muted)
    await expect(window.locator('[data-result-id="other"] .recent-node-text')).toHaveCSS('text-decoration-line', 'none')
    await window.screenshot({ path: testInfo.outputPath(`initial-${appearance}.png`) })

    await window.getByRole('searchbox').fill('task')
    await expect(title).toHaveCSS('text-decoration-line', 'line-through')
    const path = window.locator('[data-result-id="leaf"] .recent-node-path')
    await expect(path.locator('.node-text-struck')).toHaveText('Done branch')
    await expect(path).toHaveCSS('text-decoration-line', 'none')
    await window.screenshot({ path: testInfo.outputPath(`search-${appearance}.png`) })
    await window.keyboard.press('Escape')
  }
})
