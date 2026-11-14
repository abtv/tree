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

const day = dayNumberOf({ year: 2026, month: 10, day: 9 })
const later = dayNumberOf({ year: 2026, month: 10, day: 11 })
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
              text: 'apple 2026-10-09 2026-10-11 https://example.com/apple',
              children: [],
              links: [{ start: 28, end: 53, url: 'https://example.com/apple' }],
            },
          ],
        },
        { id: 'other', text: 'apple 2026-10-11', children: [] },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'parent' },
  })
}

const caretOffset = async (input: import('@playwright/test').Locator): Promise<number> =>
  input.evaluate((element) => {
    const selection = document.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(element)
    range.setEnd(selection.anchorNode!, selection.anchorOffset)
    return range.toString().length
  })

// @requirement PRODUCT.md §20.2.26
test('searches folded direct matches and skips passive paths during same-node and cross-day jumps', async ({
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

  await prompt.pressSequentially('apple')

  await expect(window.locator('.search-count')).toHaveText('5')
  await expect(window.locator(row(day, 'child'))).toHaveCount(0)
  await expect(window.locator('.agenda-path-label .search-match')).toHaveCount(0)

  await window.keyboard.press('Enter')

  await expect(prompt).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('1 / 5')

  const input = window.locator(`${row(day, 'child')} .node-input`)
  await input.focus()

  await expect(input).toBeFocused()
  await window.keyboard.press('n')

  await expect(window.locator('.search-count')).toHaveText('2 / 5')
  await expect.poll(() => caretOffset(input)).toBe(48)

  await window.keyboard.type('2n')

  await expect(window.locator(`${row(later, 'child')} .node-input`)).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('4 / 5')

  for (const appearance of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: appearance })
    await window.screenshot({ path: testInfo.outputPath(`agenda-search-match-${appearance}.png`) })
  }
  await window.keyboard.press('Escape')

  await expect(window.locator(row(day, 'child'))).toHaveCount(0)
  await window.keyboard.press('Meta+p')
  await expect(window.locator('[data-node-id="child"]')).toHaveCount(0)
})

// @requirement PRODUCT.md §20.2.26
test('keeps draft origin through folding and scroll and recalls the query across focused days', async ({
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
  await window.evaluate(() => {
    document.querySelector('.scroll-viewport')!.scrollTop = 300
  })

  await expect(prompt).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('5')

  await window.keyboard.press('Escape')
  await expect(window.locator(header(day))).toBeFocused()
  await window.keyboard.press('/')
  await prompt.fill('apple')
  await window.keyboard.press('Enter')
  await window.locator(row(day, 'child')).click()
  await window.keyboard.press('/')
  await prompt.fill('discarded')
  await window.locator(row(later, 'other')).click()

  await expect(prompt).toHaveCount(0)

  await window.locator(header(later)).click()
  await window.keyboard.press('Meta+.')
  await window.keyboard.press('/')

  await expect(prompt).toHaveValue('apple')
  await expect(window.locator('.search-count')).toHaveText('3')
  await window.keyboard.press('Enter')
  await expect(window.locator('.search-count')).toHaveText('1 / 3')
  await window.keyboard.press('Escape')
  await expect(window.locator(`${row(later, 'child')} .node-input`)).toBeFocused()
  await window.keyboard.press('/')
  await window.keyboard.press('Meta+p')
  await expect(window.locator('.agenda-list')).toHaveCount(0)
  await window.keyboard.press('/')
  await expect(prompt).toHaveValue('apple')
})

// @requirement PRODUCT.md §20.2.26
// @requirement PRODUCT.md §23.7
test('keeps the invalid-date hint beside search and updates matches across mirrors and history', async ({
  userDataDir,
}, testInfo) => {
  seed(userDataDir)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setMainWindowContentSize(app, screenshotContentSize)
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await window.locator(row(day, 'child')).click()
  await window.keyboard.press('/')
  const prompt = window.getByRole('textbox', { name: 'Search', exact: true })
  await prompt.fill('apple')
  await window.keyboard.press('Enter')
  await window.locator(`${row(day, 'child')} .node-input`).focus()
  await window.keyboard.press('0')
  await window.keyboard.press('i')
  await window.keyboard.type('apple ')

  await expect(window.locator(`${row(later, 'child')} .agenda-text`)).toContainText('apple apple')
  await expect(window.locator('.search-count')).toHaveText('7')

  await window.keyboard.press('Escape')
  await window.locator(`${row(later, 'other')} .node-input`).click()
  await window.keyboard.type('0wD')

  await expect(window.locator('.status-bar')).toContainText('Add a date to keep this item in Agenda')
  await window.keyboard.press('/')
  await expect(window.locator('.search-status-message')).toContainText('Add a date')

  const positions = await window.evaluate(() =>
    ['.search-input-line', '.search-status-message', '.search-count'].map((selector) => {
      const rect = document.querySelector(selector)!.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }),
  )
  expect(positions[0]!.right).toBeLessThanOrEqual(positions[2]!.left)
  expect(positions[0]!.bottom).toBeLessThan(positions[1]!.top)

  for (const appearance of ['light', 'dark'] as const) {
    await window.emulateMedia({ colorScheme: appearance })
    await window.screenshot({ path: testInfo.outputPath(`agenda-search-pinned-${appearance}.png`) })
  }
  await window.keyboard.press('Enter')

  await expect(window.locator(row(later, 'other'))).toHaveCount(0)
  await expect(window.locator('.search-count')).toHaveText('6')

  await window.locator(header(day)).focus()
  await window.keyboard.press('u')
  await expect(window.locator(row(later, 'other'))).toHaveCount(1)
  await expect(window.locator('.search-count')).toHaveText('7')
  await window.keyboard.press('Control+r')
  await window.locator(header(day)).click()
  await expect(window.locator(row(later, 'other'))).toHaveCount(0)
  await expect(window.locator('.search-count')).toHaveText('6')
})

// @requirement PRODUCT.md §20.2.26
test('uses the day origin for search and cancels a pending jump on a newer day selection', async ({ userDataDir }) => {
  seed(userDataDir)
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setAgendaToday(window)
  await window.keyboard.press('Meta+p')
  await window.locator(header(later)).click()
  await window.keyboard.press('/')
  await window.getByRole('textbox', { name: 'Search', exact: true }).fill('apple')
  await window.keyboard.press('Enter')
  await expect(window.locator('.search-count')).toHaveText('3 / 5')
  await window.keyboard.press('Escape')
  await expect(window.locator(`${row(later, 'child')} .node-input`)).toBeFocused()

  await window.clock.install()
  await window.clock.pauseAt(Date.now() + 1000)
  await window.keyboard.press('n')
  await window.locator(header(day)).click()
  await window.clock.runFor(1000)

  await expect(window.locator(header(day))).toBeFocused()
})

// @requirement PRODUCT.md §20.2.26
test('reveals the matching line of a long direct match after returning from a focused day', async ({
  userDataDir,
}, testInfo) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'context',
          text: 'needle path context',
          children: [{ id: 'child', text: `2026-10-09 ${'content '.repeat(500)}needle`, children: [] }],
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

  await expect(window.getByRole('textbox', { name: 'Search', exact: true })).toBeFocused()
  await expect(window.locator('.search-count')).toHaveText('1 / 1')
  await expect
    .poll(() =>
      window.locator(`${row(day, 'child')} .search-match`).evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const viewport = document.querySelector('.scroll-viewport')!.getBoundingClientRect()
        return rect.top >= viewport.top && rect.bottom <= viewport.bottom
      }),
    )
    .toBe(true)
  await window.screenshot({ path: testInfo.outputPath('agenda-search-wrapped-match.png') })
})
