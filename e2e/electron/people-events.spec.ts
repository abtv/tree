// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  test,
} from './fixtures'

describeForEachEditingMode('People and events', ({ mode, screenshotName }) => {
  for (const view of ['Tree', 'Agenda'] as const) {
    // @requirement PRODUCT.md §20.13
    // @requirement PRODUCT.md §20.14
    test(`completes and searches independent people and events in ${view}`, async ({ userDataDir }, testInfo) => {
      const prefix = view === 'Tree' ? '' : '2026-10-08 '
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'n', text: prefix, children: [] },
            {
              id: 'catalog',
              text: '#Anna_Smith @Anna_Smith &weekly-review',
              children: [{ id: 'hidden', text: '@anna-smith &workshop', children: [] }],
            },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'n' },
      })
      const { window } = await launchTree(userDataDir)
      await setAgendaToday(window)
      if (view === 'Agenda') {
        await window.keyboard.press('Meta+p')
        await window.locator('.agenda-row[data-node-id="n"]').click()
      }
      const input = window.getByRole('textbox', { name: view === 'Tree' ? 'Node 1' : 'Agenda node n', exact: true })
      const text = () =>
        input.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value : element.textContent))
      if (mode === 'vim') {
        await window.keyboard.press('Escape')
        await window.keyboard.press('i')
      }
      await setCursor(input, prefix.length)
      await window.keyboard.type('@')
      const people = window.getByRole('listbox', { name: 'People suggestions' })

      await expect(people.getByRole('option')).toHaveText(['@Anna_Smith', '@anna-smith'])
      await expect(input).toBeFocused()

      await window.keyboard.type('AS')

      await expect(people.getByRole('option')).toHaveText(['@Anna_Smith', '@anna-smith'])

      await window.keyboard.press('Tab')

      await expect.poll(text).toBe(`${prefix}@Anna_Smith`)
      await expect(input).toBeFocused()

      await window.keyboard.press('Meta+z')

      await expect.poll(text).toBe(`${prefix}@as`)
      await expect(people).toHaveCount(0)

      await setCursor(input, prefix.length + 3)
      await window.keyboard.type(' &w')
      const events = window.getByRole('listbox', { name: 'Events suggestions' })

      await expect.poll(text).toBe(`${prefix}@as &w`)
      await expect(events.getByRole('option')).toHaveText(['&weekly-review', '&workshop'])

      await window.keyboard.press('ArrowDown')
      await window.keyboard.press('Enter')
      await window.keyboard.type(' #topic')

      await expect.poll(text).toBe(`${prefix}@as &workshop #topic`)
      await expect(input.locator('.tag-text')).toHaveText(['@as', '&workshop', '#topic'])
      if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')

      for (const appearance of ['light', 'dark'] as const) {
        await window.emulateMedia({ colorScheme: appearance })
        await expect(input.locator('.person-text')).toHaveCSS(
          'color',
          appearance === 'light' ? 'rgb(48, 107, 116)' : 'rgb(140, 208, 211)',
        )
        await expect(input.locator('.event-text')).toHaveCSS(
          'color',
          appearance === 'light' ? 'rgb(138, 82, 46)' : 'rgb(223, 175, 143)',
        )
        await expect(input.locator('.tag-text:not(.person-text):not(.event-text)')).toHaveCSS(
          'color',
          appearance === 'light' ? 'rgb(118, 81, 125)' : 'rgb(211, 175, 215)',
        )
        await window.screenshot({ path: testInfo.outputPath(screenshotName(`markers-${view}-${appearance}.png`)) })
      }

      await window.keyboard.type(' &wee')

      await expect(events).toBeVisible()

      await window.keyboard.press('Escape')

      await expect(events).toHaveCount(0)
      await expect(input).toBeFocused()
      if (mode === 'vim') await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')

      await window.keyboard.press('Meta+;')
      const query = window.getByRole('searchbox', { name: 'Search query' })
      const results = window.getByRole('listbox', { name: 'Search results' })
      await query.fill('@Ann')

      await expect(window.getByRole('listbox', { name: 'People', exact: true }).getByRole('option')).toHaveText([
        '@Anna_Smith',
        '@anna-smith',
      ])

      await query.press('Enter')

      await expect(query).toHaveValue('@Anna_Smith')
      await expect(query).toBeFocused()
      await expect(results.getByRole('option')).toHaveCount(1)
      await expect(results.locator('.recent-node-text .node-search-match')).toHaveText('@Anna_Smith')

      await query.fill('&week')

      await expect(window.getByRole('listbox', { name: 'Events', exact: true }).getByRole('option')).toHaveText([
        '&weekly-review',
      ])

      await query.press('Tab')

      await expect(query).toHaveValue('&weekly-review')
      await expect(results.getByRole('option')).toHaveCount(1)
      await expect(results.locator('.recent-node-text .node-search-match')).toHaveText('&weekly-review')

      await window.screenshot({ path: testInfo.outputPath(screenshotName(`event-search-${view}.png`)) })
      await query.press('Enter')

      await expect(window.getByRole('dialog', { name: 'Search', exact: true })).toHaveCount(0)
      const destination = window.getByRole('textbox', { name: 'Node 2', exact: true })
      await expect(destination).toBeFocused()

      if (view === 'Tree') {
        if (mode === 'vim') {
          await window.keyboard.press('Escape')
          await window.keyboard.press('V')
          for (const appearance of ['light', 'dark'] as const) {
            await window.emulateMedia({ colorScheme: appearance })
            const foreground = await destination.evaluate((element) => getComputedStyle(element).color)
            for (const marker of await destination.locator('.tag-text').all())
              await expect(marker).toHaveCSS('color', foreground)
            await window.screenshot({ path: testInfo.outputPath(screenshotName(`markers-selected-${appearance}.png`)) })
          }
          await window.keyboard.press('Escape')
        }
        await window.keyboard.press('Meta+Enter')
        for (const appearance of ['light', 'dark'] as const) {
          await window.emulateMedia({ colorScheme: appearance })
          await expect(destination).toHaveClass(/node-input-struck/)
          const foreground = await destination.evaluate((element) => getComputedStyle(element).color)
          for (const marker of await destination.locator('.tag-text').all())
            await expect(marker).toHaveCSS('color', foreground)
          await window.screenshot({ path: testInfo.outputPath(screenshotName(`markers-struck-${appearance}.png`)) })
        }
      }
    })
  }
})
