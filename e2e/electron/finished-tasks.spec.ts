// @editing-modes: both
import type { Page } from '@playwright/test'
import {
  closeApp,
  describeForEachEditingMode,
  expect,
  launchTree,
  node,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
} from './fixtures'

async function toggle(window: Page): Promise<void> {
  await window.keyboard.press('Meta+Shift+p')
  await window.getByRole('combobox', { name: 'Command' }).fill('toggle-finished-tasks')
  await window.keyboard.press('Enter')
}

describeForEachEditingMode('finished-task visibility', () => {
  // @requirement PRODUCT.md §23.3
  test('keeps the live caret when completion removes an Overdue task', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: ['a', 'b'].map((id) => ({ id, text: `2026-10-01 Task ${id}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await toggle(window)
    await expect.poll(() => window.evaluate(() => globalThis.window.treeApi.getHideFinishedTasks?.())).toBe(true)
    const first = window.locator('.agenda-row[data-node-id="a"]')
    await first.click()
    await setCursor(first.locator('.node-input'), 8)

    await window.keyboard.press('Meta+Enter')

    const next = window.locator('.agenda-row[data-node-id="b"] .node-input')
    await expect(next).toBeFocused()
    await expect
      .poll(() =>
        next.evaluate((element) => {
          const range = document.createRange()
          range.selectNodeContents(element)
          const selection = getSelection()!
          range.setEnd(selection.anchorNode!, selection.anchorOffset)
          return range.toString().length
        }),
      )
      .toBe(8)
  })

  // @requirement PRODUCT.md §2.5
  test('uses one finished-task preference in Tree, both searches and Agenda across relaunch', async ({
    userDataDir,
  }, info) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'done', text: '2026-10-08 Completed draft', children: [] },
          { id: 'next', text: '2026-10-08 Pending draft', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'done' },
    })
    const { app, window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await node(window, 1).focus()
    await window.keyboard.press('Meta+Enter')
    await window.keyboard.press('Meta+.')
    await expect(window.getByRole('textbox', { name: 'Current parent' })).toBeFocused()

    await toggle(window)

    await expect(window.getByRole('textbox', { name: 'Current parent' })).toHaveCount(0)
    await expect(window.locator('.node-row[data-node-id="done"]')).toHaveCount(0)
    await expect(node(window, 1)).toBeFocused()
    await window.screenshot({ path: info.outputPath('finished-tasks-tree.png') })

    await window.keyboard.press('Meta+f')
    await window.getByRole('textbox', { name: 'Search', exact: true }).fill('draft')
    await expect(window.locator('.search-count')).toHaveText('1')
    await window.keyboard.press('Escape')
    await window.keyboard.press('Meta+;')
    await window.getByRole('searchbox', { name: 'Search query' }).fill('draft')
    await expect(window.getByRole('listbox', { name: 'Search results' }).getByRole('option')).toHaveText([
      '2026-10-08 Pending draft',
    ])
    await window.keyboard.press('Escape')

    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-row[data-node-id="next"]')).toBeVisible()
    await expect(window.locator('.agenda-row[data-node-id="done"]')).toHaveCount(0)
    await window.locator('.agenda-row-day.agenda-today').click()
    await window.keyboard.press('Meta+.')
    await expect(window.locator('.agenda-focused-heading')).toBeFocused()
    await expect(window.locator('.agenda-row[data-node-id="next"]')).toBeVisible()
    await expect(window.locator('.agenda-row[data-node-id="done"]')).toHaveCount(0)
    await window.screenshot({ path: info.outputPath('finished-tasks-agenda.png') })

    await closeApp(app)
    const restarted = await launchTree(userDataDir)
    await expect(restarted.window.locator('.node-row[data-node-id="next"]')).toBeVisible()
    await expect(restarted.window.locator('.node-row[data-node-id="done"]')).toHaveCount(0)

    await toggle(restarted.window)
    await expect(restarted.window.locator('.node-row[data-node-id="done"]')).toBeVisible()
  })
})
