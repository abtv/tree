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
  lockSystemClipboard,
  writeClipboardText,
  firePaste,
} from './fixtures'

describeForEachEditingMode('Date completion', ({ mode, screenshotName }) => {
  for (const view of ['Tree', 'Agenda'] as const) {
    // @requirement PRODUCT.md §20.9
    test(`accepts relative dates and named months in ${view}`, async ({ userDataDir }, testInfo) => {
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'n', text: '2026-10-08 Plan ', children: [] }] },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window } = await launchTree(userDataDir)
      await setAgendaToday(window)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input = window.getByRole('textbox', {
        name: view === 'Agenda' ? 'Agenda node n' : 'Node 1',
        exact: true,
      })
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      const popup = window.getByRole('listbox', { name: 'Date suggestions' })
      for (const [expression, date] of [
        ['two days ago', '2026-10-06'],
        ['in five days', '2026-10-13'],
        ['in twenty-five days', '2026-11-02'],
        ['in one hundred days', '2027-01-16'],
        ['in 3 weeks', '2026-10-29'],
        ['three weeks ago', '2026-09-17'],
        ['in October', '2026-10-15'],
        ['last October', '2026-10-01'],
        ['in the end of October', '2026-10-31'],
      ]) {
        await window.keyboard.press('Meta+a')
        await window.keyboard.type(`2026-10-08 Plan ${expression} at noon`)
        await setCursor(input, `2026-10-08 Plan ${expression}`.length)
        await window.keyboard.press('Backspace')
        await window.keyboard.type(expression!.slice(-1))
        await expect(popup.getByRole('option')).toHaveCount(1)
        await expect(popup.getByRole('option')).toContainText(date!)
        if (expression === 'in one hundred days') {
          await window.screenshot({ path: testInfo.outputPath('english-relative-date.png') })
        }
        if (expression === 'in October') {
          await window.screenshot({ path: testInfo.outputPath('current-month-date.png') })
        }
        if (expression === 'in the end of October') {
          await window.screenshot({ path: testInfo.outputPath('month-end-date.png') })
        }
        await window.keyboard.press('Tab')
        await expect
          .poll(() => input.evaluate((element) => element.textContent))
          .toBe(`2026-10-08 Plan ${date} at noon`)
        await expect(input).toBeFocused()
        await expect(popup).toHaveCount(0)
      }
    })

    // @requirement PRODUCT.md §20.9
    test(`preserves suffixes and ignores uncertain text and paste in ${view}`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'n', text: '2026-10-08 tomorrow morning', children: [] },
            { id: 'other', text: '2026-10-08 Other', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      await lockSystemClipboard()
      const { window, app } = await launchTree(userDataDir)
      await setAgendaToday(window)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input =
        view === 'Agenda'
          ? window.getByRole('textbox', { name: 'Agenda node n', exact: true })
          : window.getByRole('textbox', { name: 'Node 1', exact: true })
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      await setCursor(input, 19)
      const popup = window.getByRole('listbox', { name: 'Date suggestions' })
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Backspace')
      await window.keyboard.type('w')
      await expect(popup).toBeVisible()
      await window.keyboard.press('Tab')
      const text = async (): Promise<string> =>
        input.evaluate((element) =>
          element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
        )
      await expect.poll(text).toBe('2026-10-08 2026-10-09 morning')
      await window.evaluate(() =>
        document.addEventListener('keydown', (event) => {
          if (event.metaKey && event.key.toLowerCase() === 'z') event.preventDefault()
        }),
      )
      await window.keyboard.press('Meta+z')
      await expect.poll(text).toBe('2026-10-08 tomorrow morning')
      await expect(popup).toHaveCount(0)
      for (const fragment of ['t', 'to', 'mar', 'may', '2026-02-31']) {
        await window.keyboard.press('Meta+a')
        await window.keyboard.type(`2026-10-08 ${fragment}`)
        await expect(popup).toHaveCount(0)
      }
      await writeClipboardText(app, 'next Friday')
      await setCursor(input, (await text()).length)
      await window.keyboard.press('Meta+v')
      await expect.poll(text).toContain('next Friday')
      await expect(popup).toHaveCount(0)
      await writeClipboardText(app, ' tomorrow')
      await firePaste(input)
      await expect.poll(text).toContain(' tomorrow')
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Friday')
      await expect(popup).toBeVisible()
      const other =
        view === 'Agenda'
          ? window.locator('.agenda-row[data-node-id="other"]')
          : window.getByRole('textbox', { name: 'Node 2', exact: true })
      await other.click()
      await expect(popup).toHaveCount(0)
    })

    if (view === 'Agenda') {
      // @requirement PRODUCT.md §20.9
      test('does not offer completion inside hyperlink text', async ({ userDataDir }) => {
        const url = 'https://example.com/tomorrow'
        seedDocument(userDataDir, {
          document: {
            roots: [
              { id: 'n', text: `2026-10-08 ${url}`, links: [{ start: 11, end: 11 + url.length, url }], children: [] },
            ],
          },
          location: { currentParentId: null, selectedNodeId: 'n' },
        })
        const { window } = await launchTree(userDataDir)
        await setAgendaToday(window)
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
        const input = window.getByRole('textbox', { name: 'Agenda node n', exact: true })
        if (mode === 'vim') {
          await window.keyboard.press('Escape')
          await window.keyboard.press('i')
        }
        await setCursor(input, 11 + url.length)
        await window.keyboard.press('Backspace')
        await window.keyboard.type('w')
        await expect(input.locator('a')).toHaveCount(1)
        await expect(window.getByRole('listbox', { name: 'Date suggestions' })).toHaveCount(0)
      })
    }

    if (view === 'Tree') {
      // @requirement PRODUCT.md §20.9
      test('keeps the popup inside the window at the bottom and right edges', async ({ userDataDir }) => {
        const roots = Array.from({ length: 30 }, (_, index) => ({
          id: `r${index}`,
          text: index === 29 ? `${'a'.repeat(45)} ` : `Row ${index}`,
          children: [],
        }))
        seedDocument(userDataDir, {
          document: { roots },
          location: { currentParentId: null, selectedNodeId: 'r29' },
        })
        const { window, app } = await launchTree(userDataDir)
        await setAgendaToday(window)
        await setMainWindowContentSize(app, { width: 360, height: 240 })
        const input = window.getByRole('textbox', { name: 'Node 30', exact: true })
        if (mode === 'vim') {
          await window.keyboard.press('Escape')
          await window.keyboard.press('i')
        }
        await setCursor(input, 46)
        await window.keyboard.type('next week')
        const popup = window.locator('.date-popup')
        await expect(popup).toBeVisible()
        const geometry = await window.evaluate(() => {
          const box = document.querySelector('.date-popup')!.getBoundingClientRect()
          const row = Array.from(document.querySelectorAll('.node-row')).at(-1)!.getBoundingClientRect()
          return {
            box: { top: box.top, bottom: box.bottom, left: box.left, right: box.right },
            rowTop: row.top,
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          }
        })
        expect(geometry.box.left).toBeGreaterThanOrEqual(0)
        expect(geometry.box.right).toBeLessThanOrEqual(geometry.width)
        expect(geometry.box.top).toBeGreaterThanOrEqual(0)
        expect(geometry.box.bottom).toBeLessThanOrEqual(geometry.height)
        expect(geometry.box.bottom).toBeLessThanOrEqual(geometry.rowTop)
      })
    }

    // @requirement PRODUCT.md §20.9
    test(`accepts, cycles, cancels and undoes completion in ${view}`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'n', text: '2026-10-08 Plan ', children: [] },
            { id: 'other', text: '2026-10-09 Other', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window, app } = await launchTree(userDataDir)
      await setAgendaToday(window)
      await setMainWindowContentSize(app, screenshotContentSize)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input =
        view === 'Agenda'
          ? window.getByRole('textbox', { name: 'Agenda node n', exact: true })
          : window.getByRole('textbox', { name: 'Node 1', exact: true })
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      const assertText = async (text: string): Promise<void> => {
        // A Tree row that once held date-like text keeps its rich element, so read either kind.
        await expect
          .poll(() =>
            input.evaluate((element) =>
              element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
            ),
          )
          .toBe(text)
      }
      await setCursor(input, 16)
      await window.keyboard.type('tomor')
      const popup = window.getByRole('listbox', { name: 'Date suggestions' })
      await expect(popup).toBeVisible()
      await expect(popup.getByRole('option')).toHaveCount(1)
      await window.keyboard.type('row')
      await expect(input).toBeFocused()
      await window.keyboard.press('Tab')
      await assertText('2026-10-08 Plan 2026-10-09')
      await expect(popup).toHaveCount(0)
      await window.keyboard.type('!')
      await assertText('2026-10-08 Plan 2026-10-09!')
      await window.keyboard.press('Meta+z')
      await assertText('2026-10-08 Plan 2026-10-09')
      await window.keyboard.press('Meta+z')
      await assertText('2026-10-08 Plan tomorrow')
      await expect(popup).toHaveCount(0)
      await setCursor(input, 15)
      await window.keyboard.press('Delete')
      // Remove the expression with ordinary native selection in Insert.
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan Friday')
      await expect(popup.getByRole('option')).toHaveCount(2)
      await expect(popup.getByRole('option').first()).toContainText('2026-10-09')
      await window.keyboard.press('Control+n')
      await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('Control+p')
      await expect(popup.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      const geometry = await input.evaluate((element) => {
        const popup = document.querySelector('.date-popup')!.getBoundingClientRect()
        const row = (element.closest('.node-row, .agenda-row') ?? element).getBoundingClientRect()
        const style = getComputedStyle(element)
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')!
        context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
        const expectedLeft =
          element.getBoundingClientRect().left +
          parseFloat(style.paddingLeft) +
          context.measureText('2026-10-08 Plan ').width
        return { popupTop: popup.top, rowBottom: row.bottom, popupLeft: popup.left, expectedLeft }
      })
      expect(Math.abs(geometry.popupTop - geometry.rowBottom)).toBeLessThan(1)
      expect(Math.abs(geometry.popupLeft - geometry.expectedLeft)).toBeLessThan(2)
      {
        for (const appearance of ['light', 'dark'] as const) {
          await window.emulateMedia({ colorScheme: appearance })
          await window.mouse.move(600, 20)
          await expect(window).toHaveScreenshot(
            screenshotName(`date-popup-${view === 'Tree' ? 'tree-' : ''}${appearance}.png`),
          )
        }
      }
      await popup.getByRole('option').nth(1).click()
      await assertText('2026-10-08 Plan 2026-10-16')
      await expect(input).toBeFocused()
      await window.keyboard.type('!')
      await assertText('2026-10-08 Plan 2026-10-16!')
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan tomorrow')
      await expect(popup).toBeVisible()
      await window.keyboard.press('Escape')
      await expect(popup).toHaveCount(0)
      await assertText('2026-10-08 Plan tomorrow')
      if (mode === 'vim') {
        await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
        await window.keyboard.press('i')
      }
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan tomorrow')
      await expect(popup).toBeVisible()
      await setCursor(input, 0)
      await expect(popup).toHaveCount(0)
      await setCursor(input, '2026-10-08 Plan tomorrow'.length)
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Backspace')
      await expect(popup).toBeVisible()
      await window
        .getByRole('button', { name: mode === 'vim' ? 'Disable Vim editing' : 'Enable Vim editing', exact: true })
        .click()
      await expect(popup).toHaveCount(0)
    })
  }
})
