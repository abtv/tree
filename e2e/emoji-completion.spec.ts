// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  screenshotContentSize,
  setMainWindowContentSize,
  test,
} from './fixtures'
import catalog from '../src/domain/emoji-catalog.json'

describeForEachEditingMode('Emoji completion', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §20.12
  test('keeps all keyboard-selected suggestions visible in a small window', async ({ userDataDir }, testInfo) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'n', text: 'Plan ', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'n' },
    })
    const { window, app } = await launchTree(userDataDir)
    await setMainWindowContentSize(app, { width: 360, height: 240 })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await setCursor(input, 5)
    await window.keyboard.type(':ma')
    const popup = window.getByRole('listbox', { name: 'Emoji suggestions' })
    const matches = Object.keys(catalog).filter((shortcode) => shortcode.startsWith('ma'))
    await expect(popup.getByRole('option')).toHaveCount(matches.length)
    for (let index = 1; index <= matches.length; index++) {
      await window.keyboard.press('ArrowDown')
      const geometry = await window.evaluate(() => {
        const box = document.querySelector('.date-popup')!.getBoundingClientRect()
        const selected = document.querySelector('.date-popup [aria-selected="true"]')!.getBoundingClientRect()
        return {
          boxTop: box.top,
          boxBottom: box.bottom,
          selectedTop: selected.top,
          selectedBottom: selected.bottom,
          height: innerHeight,
        }
      })
      expect(geometry.selectedTop).toBeGreaterThanOrEqual(geometry.boxTop)
      expect(geometry.selectedBottom).toBeLessThanOrEqual(geometry.boxBottom)
      expect(geometry.boxBottom).toBeLessThanOrEqual(geometry.height)
    }
    await window.keyboard.press('Control+p')
    await window.screenshot({ path: testInfo.outputPath(screenshotName('emoji-scrolled-small-window.png')) })
    await window.keyboard.press('Tab')
    await expect(input).toBeFocused()
    await expect(input).not.toHaveValue('Plan :ma')
    await window.keyboard.press('Meta+a')
    await window.keyboard.type(':')
    await expect(popup.getByRole('option')).toHaveCount(Object.keys(catalog).length)
    await window.keyboard.press('ArrowUp')
    await expect(popup.getByRole('option').last()).toHaveAttribute('aria-selected', 'true')
    await window.keyboard.press('Tab')
    await expect(input).toHaveValue(catalog.zzz)
    await window.keyboard.press('Meta+a')
    await window.keyboard.type(':')
    await popup.getByRole('option').last().scrollIntoViewIfNeeded()
    await window.screenshot({ path: testInfo.outputPath(screenshotName('emoji-catalog-end.png')) })
    await popup.getByRole('option').last().click()
    await expect(input).toHaveValue(catalog.zzz)
    await expect(input).toBeFocused()
  })

  // @requirement PRODUCT.md §20.12
  test('accepts emoji in a plain textarea without consuming a suffix or opening on restored text', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'n', text: 'Plan :rocke suffix', children: [] }] },
      location: { currentParentId: null, selectedNodeId: 'n' },
    })
    const { window } = await launchTree(userDataDir)
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const popup = window.getByRole('listbox', { name: 'Emoji suggestions' })
    await expect(popup).toHaveCount(0)
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await setCursor(input, 11)
    await window.keyboard.press('Backspace')
    await window.keyboard.type('e')
    await expect(popup).toBeVisible()
    await window.keyboard.press('Tab')
    await expect(input).toHaveValue('Plan 🚀 suffix')
    await window.keyboard.type('!')
    await expect(input).toHaveValue('Plan 🚀! suffix')
    await expect(input).toBeFocused()
    await window.keyboard.press('Meta+z')
    await window.keyboard.press('Meta+z')
    await expect(input).toHaveValue('Plan :rocke suffix')
    await expect(popup).toHaveCount(0)
  })

  for (const view of ['Tree', 'Agenda'] as const) {
    // @requirement PRODUCT.md §20.12
    test(`accepts, selects, ignores and undoes emoji in ${view}`, async ({ userDataDir }, testInfo) => {
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'n', text: '2026-10-08 Plan ', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window, app } = await launchTree(userDataDir)
      await setAgendaToday(window)
      await setMainWindowContentSize(app, screenshotContentSize)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input = window.getByRole('textbox', { name: view === 'Agenda' ? 'Agenda node n' : 'Node 1', exact: true })
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      const readText = async (): Promise<string> =>
        input.evaluate((element) =>
          element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
        )
      const popup = window.getByRole('listbox', { name: 'Emoji suggestions' })
      await setCursor(input, 16)
      await window.keyboard.type(':')
      await expect(popup.getByRole('option')).toHaveCount(Object.keys(catalog).length)
      await window.keyboard.press('ArrowUp')
      await expect(popup.getByRole('option').last()).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('ArrowDown')
      await expect(popup.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`emoji-${view}-colon.png`)) })
      await window.keyboard.type('r')
      await expect(popup.getByRole('option')).toHaveCount(
        Object.keys(catalog).filter((shortcode) => shortcode.startsWith('r')).length,
      )
      await window.keyboard.type('oc')
      await expect(popup.getByRole('option')).toHaveCount(2)
      await expect(popup.getByRole('option').nth(1)).toContainText('🚀')
      await window.keyboard.down('Meta')
      await expect(popup).toBeVisible()
      await window.keyboard.up('Meta')
      await window.keyboard.press('ArrowDown')
      await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('ArrowUp')
      await expect(popup.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      await expect(input).toBeFocused()
      await window.keyboard.press('Control+n')
      await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('Control+p')
      await expect(popup.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('Control+n')
      const geometry = await input.evaluate((element) => {
        const box = document.querySelector('.date-popup')!.getBoundingClientRect()
        const row = element.closest('.node-row, .agenda-row')!.getBoundingClientRect()
        return { top: box.top, bottom: row.bottom, left: box.left, right: box.right, width: innerWidth }
      })
      expect(Math.abs(geometry.top - geometry.bottom)).toBeLessThan(1)
      expect(geometry.left).toBeGreaterThanOrEqual(0)
      expect(geometry.right).toBeLessThanOrEqual(geometry.width)
      for (const appearance of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme: appearance })
        await window.screenshot({ path: testInfo.outputPath(screenshotName(`emoji-${view}-${appearance}.png`)) })
      }
      await window.keyboard.press('Tab')
      await expect.poll(readText).toBe('2026-10-08 Plan 🚀')
      await expect(input).toBeFocused()
      await expect(popup).toHaveCount(0)
      await window.keyboard.type('!')
      await expect.poll(readText).toBe('2026-10-08 Plan 🚀!')
      await window.keyboard.press('Meta+z')
      await expect.poll(readText).toBe('2026-10-08 Plan 🚀')
      await window.keyboard.press('Meta+z')
      await expect.poll(readText).toBe('2026-10-08 Plan :roc')
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Meta+Shift+z')
      await expect.poll(readText).toBe('2026-10-08 Plan 🚀')
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan :woman_techn')
      await expect(popup.getByRole('option')).toHaveCount(1)
      await popup.getByRole('option').click()
      await expect.poll(readText).toBe('2026-10-08 Plan 👩‍💻')
      await expect(input).toBeFocused()
      await window.keyboard.type('!')
      await expect.poll(readText).toBe('2026-10-08 Plan 👩‍💻!')
      await window.keyboard.press('Backspace')
      await window.keyboard.press('Backspace')
      await expect.poll(readText).toBe('2026-10-08 Plan ')
      await window.keyboard.type(':roc ')
      await expect.poll(readText).toBe('2026-10-08 Plan :roc ')
      await expect(popup).toHaveCount(0)
      await window.keyboard.type(':rocke')
      await expect(popup).toBeVisible()
      await window.keyboard.press('Escape')
      await expect(popup).toHaveCount(0)
      await expect.poll(readText).toBe('2026-10-08 Plan :roc :rocke')
      if (mode === 'vim') {
        await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
        await expect(input).toBeFocused()
        await window.screenshot({ path: testInfo.outputPath(`emoji-${view}-dismissed-insert.png`) })
        await window.keyboard.press('Escape')
        await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
        await window.keyboard.press('i')
      }
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan :rocke')
      await expect(popup).toBeVisible()
      await setCursor(input, 0)
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan :no_such_emoji https://roc 12:roc')
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan :rocke')
      await expect(popup).toBeVisible()
      await window.keyboard.press('Enter')
      await expect(popup).toHaveCount(0)
      await expect(window.getByRole('listbox', { name: 'Date suggestions' })).toHaveCount(0)
    })
  }
})
