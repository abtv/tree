// @editing-modes: vim
import { dayNumberOf } from '../../src/domain/calendar-date'
import {
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setMainWindowContentSize,
  screenshotContentSize,
  test,
} from './fixtures'

const day = dayNumberOf({ year: 2026, month: 10, day: 14 })
const later = dayNumberOf({ year: 2026, month: 10, day: 20 })
const row = (value: number, id: string) => `[data-agenda-key="node:${value}:${id}"]`
const header = (value: number) => `[data-agenda-key="day:${value}"]`
function seed(directory: string): void {
  seedDocument(directory, {
    document: {
      roots: [
        {
          id: 'parent',
          text: 'apple apple context',
          children: [
            {
              id: 'child',
              text: 'apple 2026-10-14 2026-10-20 https://example.com/apple',
              children: [],
              links: [{ start: 28, end: 53, url: 'https://example.com/apple' }],
            },
          ],
        },
        { id: 'other', text: 'apple 2026-10-20', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'parent' },
  })
}

// @requirement PRODUCT.md §20.2.26
test('searches folded occurrences and moves the contextual caret within the same row', async ({
  userDataDir,
}, testInfo) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setMainWindowContentSize(app, screenshotContentSize)
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await window.locator(header(day)).click()
  await window.keyboard.press('Meta+e')
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await expect(prompt).toBeFocused()
  await prompt.pressSequentially('apple')
  await expect(window.locator('.search-count')).toHaveText('9')
  await expect(window.locator(row(day, 'child'))).toHaveCount(0)
  await window.keyboard.press('Enter')
  const context = window.locator(row(day, 'parent'))
  await expect(context).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('1 / 9')
  await window.keyboard.press('n')
  await expect(window.locator('.search-count')).toHaveText('2 / 9')
  await expect
    .poll(() =>
      context.evaluate((element) => {
        const caret = element.querySelector('.agenda-caret')!
        const range = document.createRange()
        range.selectNodeContents(element.querySelector('.agenda-text')!)
        range.setEndBefore(caret)
        return range.toString().length
      }),
    )
    .toBe(6)
  for (const appearance of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: appearance })
    await window.screenshot({ path: testInfo.outputPath(`agenda-search-context-${appearance}.png`) })
  }
  await window.keyboard.press('n')
  await expect(window.locator(`${row(day, 'child')} .node-input`)).toBeFocused()
  await window.keyboard.press('3')
  await window.keyboard.press('n')
  await expect(window.locator(row(later, 'parent'))).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('6 / 9')
  await window.keyboard.press('Escape')
  await expect(window.locator(row(day, 'parent'))).toHaveCount(0)
  await window.keyboard.press('Meta+p')
  await expect(window.locator('[data-node-id="child"]')).toHaveCount(0)
})

test('keeps the draft through folding and scroll, restores row focus, and recalls across focused days', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await window.locator(row(day, 'child')).click()
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.fill('apple')
  await window.locator(`${header(day)} .node-disclosure-triangle`).click()
  await expect(prompt).toBeFocused()
  await window.evaluate(() => {
    document.querySelector('.scroll-viewport')!.scrollTop = 300
  })
  await expect(prompt).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('9')
  await window.keyboard.press('Escape')
  await expect(window.locator(header(day))).toBeFocused()
  await window.keyboard.press('/')
  await prompt.fill('apple')
  await window.keyboard.press('Enter')
  await expect(window.locator(row(day, 'parent'))).toBeFocused()
  await window.keyboard.press('/')
  await prompt.fill('discarded')
  await window.locator(`${row(later, 'parent')} .agenda-text`).click()
  await expect(prompt).toHaveCount(0)
  await window.locator(header(later)).click()
  await window.keyboard.press('Meta+.')
  await expect(window.locator('.search-count')).toHaveCount(0)
  await window.keyboard.press('/')
  await expect(prompt).toHaveValue('apple')
  await expect(window.locator('.search-count')).toHaveText('5')
  await window.keyboard.press('Enter')
  await expect(window.locator(row(later, 'parent'))).toBeFocused()
  await window.keyboard.press('/')
  await window.keyboard.press('Meta+p')
  await expect(window.locator('.agenda-list')).toHaveCount(0)
  await window.keyboard.press('/')
  await expect(prompt).toHaveValue('apple')
})

test('keeps move and date-removal messages beside search and updates mirrors after editing', async ({
  userDataDir,
}, testInfo) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setMainWindowContentSize(app, screenshotContentSize)
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await window.locator(row(day, 'child')).click()
  await window.keyboard.press('d')
  await window.keyboard.press('d')
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.fill('apple')
  await expect(window.locator('.search-status-message')).toContainText('Moving 1 item')
  const positions = await window.evaluate(() =>
    ['.search-input-line', '.search-status-message', '.search-count'].map((selector) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect()
      return { left: rect.left, right: rect.right }
    }),
  )
  expect(positions[0]!.right).toBeLessThanOrEqual(positions[1]!.left)
  expect(positions[1]!.right).toBeLessThanOrEqual(positions[2]!.left)
  await window.screenshot({ path: testInfo.outputPath('agenda-search-moving.png') })
  await window.keyboard.press('Enter')
  await expect(window.locator('.search-status-message')).toContainText('Moving 1 item')
  await window.keyboard.press('Escape')
  await expect(window.locator('.status-bar')).not.toContainText('Moving')
  await window.locator(row(day, 'child')).click()
  await window.keyboard.press('/')
  await prompt.fill('apple')
  await window.keyboard.press('Enter')
  await window.locator(`${row(day, 'child')} .node-input`).click()
  await window.keyboard.press('0')
  await window.keyboard.press('i')
  await window.keyboard.type('apple ')
  await expect(window.locator(`${row(later, 'child')} .agenda-text`)).toContainText('apple apple')
  await expect(window.locator('.search-count')).toHaveText('11')
  await window.keyboard.press('Escape')
  await window.locator(`${row(later, 'other')} .node-input`).click()
  await window.keyboard.press('0')
  await window.keyboard.press('C')
  await window.keyboard.type('apple')
  await expect(window.locator('.search-status-message')).toHaveText('Add a date to keep this item in Agenda')
  await window.keyboard.press('Escape')
  await window.keyboard.press('/')
  for (const appearance of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: appearance })
    await window.screenshot({ path: testInfo.outputPath(`agenda-search-pinned-${appearance}.png`) })
  }
  await window.keyboard.press('Enter')
  await expect(window.locator(row(later, 'other'))).toHaveCount(0)
  await expect(window.locator('.search-count')).toHaveText('10')
})

test('uses gap position for search and cancels a pending jump on a newer synthetic selection', async ({
  userDataDir,
}) => {
  seed(userDataDir)
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await window.locator('.agenda-row-gap').first().click()
  await window.keyboard.press('/')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('apple')
  await window.keyboard.press('Enter')
  await expect(window.locator(row(later, 'parent'))).toBeFocused()
  await window.clock.install()
  await window.clock.pauseAt(new Date())
  await window.keyboard.press('n')
  await window.locator(header(day)).click()
  await window.clock.runFor(1000)
  await expect(window.locator(header(day))).toBeFocused()
})

test('reveals the matching line of a long contextual row after returning from a focused day', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'context',
          text: `${'context '.repeat(500)}needle`,
          children: [{ id: 'child', text: '2026-10-14 child', children: [] }],
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'context' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await window.locator(header(day)).click()
  await window.keyboard.press('Meta+.')
  await window.keyboard.press('Meta+,')
  await window.keyboard.press('/')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('needle')
  await window.keyboard.press('Enter')
  const context = window.locator(row(day, 'context'))
  await expect(context).toBeFocused()
  await expect
    .poll(() =>
      context.locator('.agenda-caret').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const viewport = document.querySelector('.scroll-viewport')!.getBoundingClientRect()
        return rect.top >= viewport.top && rect.bottom <= viewport.bottom
      }),
    )
    .toBe(true)
  await window.screenshot({ path: testInfo.outputPath('agenda-search-wrapped-context.png') })
})
