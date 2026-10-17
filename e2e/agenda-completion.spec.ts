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
  unlockSystemClipboard,
  writeClipboardText,
  firePaste,
  clickApplicationMenuItem,
} from './fixtures'

describeForEachEditingMode('Date completion', ({ mode, screenshotName }) => {
  // @requirement PRODUCT.md §20.9
  test('keeps plain-editor arrows in the popup until dismissal, then resumes node navigation', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'n', text: 'Plan ', children: [] },
          { id: 'other', text: 'Other', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'n' },
    })
    const { window } = await launchTree(userDataDir)
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    if (mode === 'vim') {
      await window.keyboard.press('Escape')
      await window.keyboard.press('i')
    }
    await setCursor(input, 5)
    await window.keyboard.type('next wee')
    const popup = window.getByRole('listbox', { name: 'Date suggestions' })
    await expect(popup.getByRole('option')).toHaveCount(7)
    await window.keyboard.down('Meta')
    await expect(popup).toBeVisible()
    await window.keyboard.up('Meta')
    await window.keyboard.press('ArrowDown')
    await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('Plan next wee')
    await expect(input).toHaveJSProperty('selectionStart', 13)
    await expect(input).toHaveJSProperty('selectionEnd', 13)
    await window.keyboard.press('Escape')
    await expect(popup).toHaveCount(0)
    if (mode === 'vim') {
      await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
      await expect(input).toHaveJSProperty('selectionStart', 13)
      await expect(input).toHaveJSProperty('selectionEnd', 13)
      await window.keyboard.press('Escape')
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      await window.keyboard.press('ArrowDown')
      await expect(input).toBeFocused()
      await window.keyboard.press('i')
    }
    await window.keyboard.press('ArrowDown')
    await expect(window.getByRole('textbox', { name: 'Node 2', exact: true })).toBeFocused()
  })

  for (const view of ['Tree', 'Agenda'] as const) {
    // @requirement PRODUCT.md §20.9
    test(`preserves prepositions while refining weekday and month-day prefixes in ${view}`, async ({
      userDataDir,
    }, testInfo) => {
      const initial = `2026-10-08 Plan ${view === 'Tree' ? 'on  at noon' : 'by Sep 15 at noon'}`
      seedDocument(userDataDir, {
        document: { roots: [{ id: 'n', text: initial, children: [] }] },
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
      await setCursor(input, view === 'Tree' ? 19 : 22)
      const popup = window.getByRole('listbox', { name: 'Date suggestions' })
      if (view === 'Tree') {
        await window.keyboard.type('fr')
        await expect(popup).toHaveCount(0)
      }
      await window.keyboard.type(view === 'Tree' ? 'i' : 't')
      await expect(popup.getByRole('option')).toHaveCount(2)
      await window.keyboard.press('ArrowDown')
      const selectedDate = view === 'Tree' ? '2026-10-16' : '2026-09-15'
      const selected = popup.getByRole('option', { selected: true })
      await expect(selected).toContainText(selectedDate)
      await expect(selected).toContainText(view === 'Tree' ? 'friday' : 'september 15')
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`preposition-date-${view}.png`)) })
      await window.keyboard.type(view === 'Tree' ? 'day' : 'ember')
      await expect(selected).toContainText(selectedDate)
      await window.keyboard.press('Enter')
      const text = (): Promise<string> =>
        input.evaluate((element) =>
          element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
        )
      await expect.poll(text).toBe(`2026-10-08 Plan ${view === 'Tree' ? 'on' : 'by'} ${selectedDate} at noon`)
      await expect(input).toBeFocused()
      await expect(popup).toHaveCount(0)
      await window.evaluate(() =>
        document.addEventListener('keydown', (event) => {
          if (event.metaKey && event.key.toLowerCase() === 'z') event.preventDefault()
        }),
      )
      await window.keyboard.press('Meta+z')
      await expect.poll(text).toBe(`2026-10-08 Plan ${view === 'Tree' ? 'on friday' : 'by September 15'} at noon`)
      await expect(popup).toHaveCount(0)
    })

    // @requirement PRODUCT.md §20.9
    test(`refines qualified date prefixes without losing selection in ${view}`, async ({ userDataDir }, testInfo) => {
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
      await setCursor(input, 16)
      const popup = window.getByRole('listbox', { name: 'Date suggestions' })
      const fragment = view === 'Tree' ? 'in se' : 'next fr'
      await window.keyboard.type(fragment)
      await expect(popup).toHaveCount(0)
      await window.keyboard.type(view === 'Tree' ? 'p' : 'i')
      await expect(popup).toBeVisible()
      if (view === 'Tree') {
        await expect(popup.getByRole('option').first()).toContainText('2026-09-01')
        await expect(popup.getByRole('option').last()).toContainText('2027-09-01')
        await expect(popup.getByRole('option').last()).toHaveAttribute('aria-selected', 'true')
        const visible = await popup.getByRole('option', { selected: true }).evaluate((element) => {
          const selected = element.getBoundingClientRect()
          const container = element.closest('.date-popup')!.getBoundingClientRect()
          return selected.top >= container.top && selected.bottom <= container.bottom
        })
        expect(visible).toBe(true)
        await window.screenshot({ path: testInfo.outputPath(screenshotName('chronological-date-preferred.png')) })
        await window.keyboard.press('ArrowUp')
      }
      const selectedDate = view === 'Tree' ? '2026-09-01' : '2026-10-16'
      const selected = popup.getByRole('option', { selected: true })
      await expect(selected).toContainText(selectedDate)
      await expect(selected).toContainText(view === 'Tree' ? 'in september' : 'next friday')
      await window.keyboard.type(view === 'Tree' ? 't' : 'd')
      await expect(selected).toContainText(selectedDate)
      await window.screenshot({ path: testInfo.outputPath(screenshotName(`qualified-date-${view}.png`)) })
      await window.keyboard.type(view === 'Tree' ? 'ember' : 'ay')
      await expect(selected).toContainText(selectedDate)
      await window.keyboard.press('Enter')
      const text = (): Promise<string> =>
        input.evaluate((element) =>
          element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
        )
      await expect.poll(text).toBe(`2026-10-08 Plan ${selectedDate}`)
      await expect(input).toBeFocused()
      await expect(popup).toHaveCount(0)
      await window.evaluate(() =>
        document.addEventListener('keydown', (event) => {
          if (event.metaKey && event.key.toLowerCase() === 'z') event.preventDefault()
        }),
      )
      await window.keyboard.press('Meta+z')
      await expect.poll(text).toBe(`2026-10-08 Plan ${view === 'Tree' ? 'in september' : 'next friday'}`)
      await expect(popup).toHaveCount(0)
      await setCursor(input, (await text()).length)
      await window.keyboard.press('Backspace')
      await expect(popup).toBeVisible()
      const beforeDismissal = await text()
      await window.keyboard.press('Escape')
      await expect(popup).toHaveCount(0)
      await expect.poll(text).toBe(beforeDismissal)
      if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    })

    // Expression tables live in natural-date.test.ts; retain the real edit/accept/Undo path here.
    // @requirement PRODUCT.md §20.9
    test(`preserves suffixes and ignores uncertain text and paste in ${view}`, async ({ userDataDir }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'n', text: '2026-10-08 in one hundred days morning', children: [] },
            { id: 'other', text: '2026-10-08 Other', children: [] },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
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
      await setCursor(input, 30)
      const popup = window.getByRole('listbox', { name: 'Date suggestions' })
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Backspace')
      await window.keyboard.type('s')
      await expect(popup).toBeVisible()
      await window.keyboard.press('Enter')
      const text = async (): Promise<string> =>
        input.evaluate((element) =>
          element instanceof HTMLTextAreaElement ? element.value : (element.textContent ?? ''),
        )
      await expect.poll(text).toBe('2026-10-08 2027-01-16 morning')
      await window.evaluate(() =>
        document.addEventListener('keydown', (event) => {
          if (event.metaKey && event.key.toLowerCase() === 'z') event.preventDefault()
        }),
      )
      await window.keyboard.press('Meta+z')
      await expect.poll(text).toBe('2026-10-08 in one hundred days morning')
      await expect(popup).toHaveCount(0)
      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 to')
      await expect(popup).toHaveCount(0)
      await writeClipboardText(app, 'next Friday')
      await setCursor(input, (await text()).length)
      await window.keyboard.press('Meta+v')
      await expect.poll(text).toContain('next Friday')
      await expect(popup).toHaveCount(0)
      await writeClipboardText(app, ' tomorrow')
      await firePaste(input)
      await expect.poll(text).toContain(' tomorrow')
      unlockSystemClipboard()
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
      test('keeps the popup inside the window at the bottom and right edges', async ({ userDataDir }, testInfo) => {
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
        const rows = await popup.getByRole('option').evaluateAll((options) =>
          options.map((option) => {
            const spans = Array.from(option.querySelectorAll('span'))
            return spans.map((span) => {
              const range = document.createRange()
              range.selectNodeContents(span)
              return range.getClientRects().length
            })
          }),
        )
        expect(rows).toEqual(Array.from({ length: 7 }, () => [1, 1]))
        await window.screenshot({ path: testInfo.outputPath(screenshotName('date-popup-content-width.png')) })
      })
    }

    // @requirement PRODUCT.md §20.9
    test(`accepts, cycles, cancels and undoes completion in ${view}`, async ({ userDataDir }, testInfo) => {
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
      await window.keyboard.press('Enter')
      await assertText('2026-10-08 Plan 2026-10-09')
      await expect(popup).toHaveCount(0)
      await window.keyboard.type('!')
      await assertText('2026-10-08 Plan 2026-10-09!')
      await window.keyboard.press('Meta+z')
      await assertText('2026-10-08 Plan 2026-10-09')
      await window.keyboard.press('Meta+z')
      await assertText('2026-10-08 Plan tomorrow')
      await expect(popup).toHaveCount(0)

      await window.keyboard.press('Meta+a')
      await window.keyboard.type('2026-10-08 Plan next wee')
      await expect(popup.getByRole('option')).toHaveCount(7)
      const selection = await input.evaluate(() => {
        const range = getSelection()?.getRangeAt(0)
        return { start: range?.startOffset, end: range?.endOffset }
      })
      // Remappers can send a Command keydown before a plain arrow.
      await window.keyboard.down('Meta')
      await expect(popup).toBeVisible()
      await window.keyboard.up('Meta')
      await window.keyboard.press('ArrowDown')
      await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('ArrowUp')
      await expect(popup.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('ArrowUp')
      await expect(popup.getByRole('option').last()).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('ArrowDown')
      await expect(popup.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
      await expect(input).toBeFocused()
      expect(
        await input.evaluate(() => {
          const range = getSelection()?.getRangeAt(0)
          return { start: range?.startOffset, end: range?.endOffset }
        }),
      ).toEqual(selection)
      await window.keyboard.press('Control+n')
      await window.keyboard.type('k')
      await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
      await window.keyboard.press('Enter')
      await assertText('2026-10-08 Plan 2026-10-13')
      await expect(input).toBeFocused()

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
        await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
        await expect(input).toBeFocused()
        await window.screenshot({ path: testInfo.outputPath(`date-${view}-dismissed-insert.png`) })
        await window.keyboard.press('Escape')
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
      await clickApplicationMenuItem(app, 'Edit', 'Vim Editing')
      await expect(popup).toHaveCount(0)
    })
  }
})
