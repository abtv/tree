import { agendaSeed, expect, launchTree, seedDocument, test } from './fixtures'
import { recordPerfResult } from './results'

for (const view of ['Tree', 'Agenda'] as const) {
  // @requirement PRODUCT.md §22.2
  test(`${view} Normal mode stays idle without a selectionchange loop`, async ({ userDataDir }) => {
    seedDocument(userDataDir, agendaSeed(100))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    if (view === 'Agenda') {
      await window.keyboard.press('Meta+p')
      await window.locator('.agenda-row[data-node-id="dated-0"]').first().click()
    }
    const input = window.getByRole('textbox', {
      name: view === 'Agenda' ? 'Agenda node dated-0' : 'Node 1',
      exact: true,
    })
    await input.focus()
    await expect(input).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    // Settle focus and the Normal block projection before counting only idle events.
    await window.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    await expect(input).toHaveAttribute('contenteditable', 'true')
    expect(await input.evaluate(() => globalThis.getSelection()?.toString().length)).toBe(1)
    const events = await window.evaluate(async () => {
      let count = 0
      const onSelection = (): void => {
        count += 1
      }
      document.addEventListener('selectionchange', onSelection)
      await new Promise<void>((resolve) => setTimeout(resolve, 1000))
      document.removeEventListener('selectionchange', onSelection)
      return count
    })
    recordPerfResult({
      kind: 'state',
      scenario: `${view.toLowerCase()}-normal-idle-selection`,
      samples: 1,
      metrics: { selectionchangeEvents: events },
    })
    expect(events).toBeLessThan(10)
    await expect(input).toBeFocused()
  })
}
