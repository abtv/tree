import { expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from './results'

test.describe('Vim selection at scale', () => {
  test('wide-1000 node Visual selection stays windowed', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(1_000))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await expect(input).toBeFocused()

    const start = performance.now()
    await window.keyboard.press('V')
    for (let index = 0; index < 40; index += 1) await window.keyboard.press('j')
    const selectionMs = performance.now() - start
    const mountedRows = await window.locator('.node-row').count()
    const highlightedRows = await window.locator('.node-row-visual-selected').count()

    recordPerfResult({
      kind: 'state',
      scenario: 'vim-visual-wide-1000',
      metrics: { selectionMs: round(selectionMs), mountedRows, highlightedRows },
    })

    expect(selectionMs).toBeLessThan(3_000)
    expect(mountedRows).toBeLessThan(100)
    expect(highlightedRows).toBeGreaterThan(0)
    expect(highlightedRows).toBeLessThanOrEqual(41)
  })
})
