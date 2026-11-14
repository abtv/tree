// @editing-modes: both
import { describeForEachEditingMode, expect, launchTree, seedDocument, setAgendaToday, test } from './fixtures'

describeForEachEditingMode('Weekly Agenda', ({ mode }) => {
  // @requirement PRODUCT.md §23.1
  // @requirement PRODUCT.md §23.3
  // @requirement PRODUCT.md §23.4
  // @requirement PRODUCT.md §20.2.26
  test('switches weeks from headings and editors, limits search and reopens Today', async ({
    userDataDir,
  }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'current', text: '2026-10-08 needle current', children: [] },
          { id: 'next', text: '2026-10-15 needle next', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'current' },
    })
    const { window } = await launchTree(userDataDir)
    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')

    await expect(window.locator('.agenda-row-day .agenda-label')).toHaveText([
      'Mon Oct 5',
      'Tue Oct 6',
      'Wed Oct 7',
      'Thu Oct 8',
      'Fri Oct 9',
      'Sat Oct 10',
      'Sun Oct 11',
    ])
    await expect(window.locator('.agenda-today')).toBeFocused()
    await expect(window.locator('.agenda-row[data-node-id="next"]')).toHaveCount(0)

    await window.keyboard.press('Meta+f')
    const search = window.getByRole('textbox', { name: 'Search', exact: true })
    await search.fill('needle')
    await expect(window.locator('.search-count')).toHaveText('1')
    await window.keyboard.press('Escape')
    await window.locator('.agenda-today').click()
    await window.keyboard.press('Meta+Shift+]')

    const selected = window.locator('.agenda-row[aria-selected="true"]')
    await expect(selected).toContainText('Thu Oct 15')
    await expect(selected).toBeFocused()
    await expect(window.locator('.agenda-row[data-node-id="current"]')).toHaveCount(0)
    await window.keyboard.press('ArrowDown')
    const editor = window.getByRole('textbox', { name: 'Agenda node next' })
    await expect(editor).toBeFocused()
    if (mode === 'vim') await window.keyboard.press('A')
    else await window.keyboard.press('End')
    await window.keyboard.type(' edited')
    await window.keyboard.press('Meta+Shift+]')

    await expect(selected).toContainText('Thu Oct 22')
    await expect(selected).toBeFocused()
    await expect(window.locator('.agenda-row-day')).toHaveCount(7)
    await expect(window.locator('.agenda-row[data-node-id]')).toHaveCount(0)
    await window.keyboard.press('Meta+Shift+[')
    await expect(window.locator('.agenda-row[data-node-id="next"]')).toContainText('edited')
    await window.keyboard.press('Meta+[')
    await expect(window.locator('.agenda-today')).toBeFocused()
    await window.screenshot({ path: testInfo.outputPath('agenda-week.png') })

    await window.keyboard.press('Meta+]')
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Meta+p')
    await expect(window.locator('.agenda-today')).toBeFocused()
    await expect(window.locator('.agenda-row[data-node-id="current"]')).toHaveCount(1)

    await window.keyboard.press('Meta+.')
    await expect(window.locator('.agenda-focused-heading')).toHaveCount(1)
    await window.keyboard.press('Meta+Shift+]')
    await expect(selected).toContainText('Thu Oct 15')
    await expect(window.locator('.agenda-focused-heading')).toHaveCount(1)
    await window.keyboard.press('Meta+,')
    await expect(window.locator('.agenda-row-day')).toHaveCount(7)
    await expect(window.locator('.agenda-today')).toBeFocused()
  })
})
