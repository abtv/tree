// @editing-modes: independent
import { dayNumberOf } from '../../src/domain/calendar-date'
import { expect, launchTree, seedDocument, setAgendaToday, test } from './fixtures'

// @requirement PRODUCT.md §2.2
// @requirement PRODUCT.md §23.1
// @requirement PRODUCT.md §23.15
test('aligns Tree and Agenda location icons and preserves the focused-day path', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: { roots: [{ id: 'item', text: '2026-10-14 Review', children: [] }] },
    location: { currentParentId: null, selectedNodeId: 'item' },
  })
  const { window } = await launchTree(userDataDir)
  await setAgendaToday(window)
  const root = window.getByRole('button', { name: 'Top level', exact: true })
  const treeIcon = await root.locator('svg').boundingBox()
  await window.keyboard.press('Meta+p')
  const bar = window.locator('.agenda-location-bar')
  const agendaStart = await bar.evaluate((element) => element.firstElementChild!.getBoundingClientRect().left)
  expect(agendaStart).toBe(treeIcon!.x)
  const calendar = bar.getByRole('img', { name: 'Agenda', exact: true })
  await expect(calendar).toBeVisible()
  expect(await calendar.locator('svg').boundingBox()).toEqual(treeIcon)
  await expect(bar).toHaveText('')
  await expect(bar).toHaveScreenshot('agenda-location-timeline.png')
  const day = dayNumberOf({ year: 2026, month: 10, day: 14 })
  await window.locator(`[data-agenda-key="day:${day}"]`).click()
  await window.keyboard.press('Meta+.')
  await expect(bar).toHaveText('›Oct 14')
  await expect(calendar).toBeVisible()
  await expect(bar).toHaveScreenshot('agenda-location-focused.png')
  await window.keyboard.press('Meta+p')
  await expect(root).toBeVisible()
})
