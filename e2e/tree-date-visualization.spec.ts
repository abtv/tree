// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setCursor,
  screenshotContentSize,
  setMainWindowContentSize,
  test,
} from './fixtures'

describeForEachEditingMode('Tree date visualization', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §20.11
  test('styles heading and row dates like Agenda and preserves selection colors', async ({ userDataDir }) => {
    const url = 'https://example.com/2026-10-12'
    seedDocument(userDataDir, {
      document: {
        roots: [
          {
            id: 'p',
            text: 'Plan 2026-10-08',
            children: [
              { id: 'a', text: 'Release 2026-10-09 and 2026-10-10', children: [] },
              { id: 'b', text: 'Review 2026-10-11', children: [] },
              {
                id: 'c',
                text: url,
                links: [{ start: 0, end: url.length, url }],
                children: [],
              },
            ],
          },
        ],
      },
      location: { currentParentId: 'p', selectedNodeId: 'a' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, screenshotContentSize)
    const heading = window.getByRole('textbox', { name: 'Current parent', exact: true })
    const first = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const second = window.getByRole('textbox', { name: 'Node 2', exact: true })
    await expect(heading.locator('.agenda-date-active')).toHaveText('2026-10-08')
    await expect(first.locator('.agenda-date-active')).toHaveCount(2)
    await expect(
      window.getByRole('textbox', { name: 'Node 3', exact: true }).locator('.agenda-date-active'),
    ).toHaveCount(0)
    for (const appearance of ['light', 'dark'] as const) {
      await window.emulateMedia({ colorScheme: appearance })
      await first.click()
      if (mode === 'vim') await window.keyboard.press('Escape')
      await setCursor(first, 0)
      await expect(first.locator('.agenda-date-active').first()).toHaveCSS('font-weight', '600')
      await window.mouse.move(600, 20)
      await expect(window).toHaveScreenshot(screenshotName(`tree-dates-${appearance}.png`))
      await second.click()
      await expect(second).toBeFocused()
      await expect(first.locator('.agenda-date-active')).toHaveCount(2)
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('V')
        await expect(second.locator('.agenda-date-active')).toHaveCSS(
          'color',
          await second.evaluate((el) => getComputedStyle(el).color),
        )
        await expect(window).toHaveScreenshot(screenshotName(`tree-dates-selected-${appearance}.png`))
        await window.keyboard.press('Escape')
      }
    }
  })

  // @requirement PRODUCT.md §20.11
  test('updates date styling while typing and keeps focus through undo and date removal', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'n', text: 'Due ', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'n' },
    })
    const { window } = await launchTree(userDataDir)
    let input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.click()
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('A')
    }
    await setCursor(input, 4)
    await window.keyboard.type('2026-10-14')
    input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await expect(input).toHaveText('Due 2026-10-14')
    await expect(input).toBeFocused()
    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-14')
    await window.keyboard.type('!')
    await expect(input).toHaveText('Due 2026-10-14!')
    await window.keyboard.press('Backspace')
    await window.keyboard.press('Backspace')
    await expect(input).toHaveText('Due 2026-10-1')
    await expect(input.locator('.agenda-date-active')).toHaveCount(0)
    await expect(input).toBeFocused()
    await window.keyboard.type('4')
    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-14')
    await window.keyboard.press('Meta+a')
    await window.keyboard.type('Plain text')
    await expect(input).toHaveText('Plain text')
    await expect(input).toBeFocused()
    await expect(input.locator('.agenda-date-active')).toHaveCount(0)
    await window.keyboard.press('Meta+z')
    await expect(input.locator('.agenda-date-active')).toHaveText('2026-10-14')
    await expect(input).toBeFocused()
  })
})
