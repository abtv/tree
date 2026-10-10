import { expect, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from './results'

// @requirement PRODUCT.md §20.11
// @requirement PRODUCT.md §22.1
test('typing in a large dated Tree stays responsive with bounded mounted rows', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: Array.from({ length: 10_000 }, (_, index) => ({
            id: `c${index}`,
            text: `Child ${index} 2026-10-14`,
            children: [],
          })),
        },
      ],
    },
    location: { currentParentId: 'root', selectedNodeId: 'c0' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
  const heading = window.getByRole('textbox', { name: 'Current parent', exact: true })
  await input.focus()
  await expect(input).toBeFocused()
  await expect(input).toHaveText('Child 0 2026-10-14')
  await window.keyboard.press('A')
  await window.evaluate(() => {
    const samples: number[] = []
    ;(window as unknown as { treeDateTyping: number[] }).treeDateTyping = samples
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'a')
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
      },
      { capture: true },
    )
  })
  for (let index = 0; index < 30; index += 1) await window.keyboard.press('a')
  await window.waitForFunction(() => (window as unknown as { treeDateTyping: number[] }).treeDateTyping.length === 30)
  const samples = await window.evaluate(() =>
    (window as unknown as { treeDateTyping: number[] }).treeDateTyping.toSorted((a, b) => a - b),
  )
  const mountedRows = await window.locator('.node-row').count()
  recordPerfResult({
    kind: 'state',
    scenario: 'tree-10000-dated-typing',
    samples: samples.length,
    metrics: { typingP95Ms: round(samples[28]!), typingMaxMs: round(samples[29]!), mountedRows },
  })
  expect(samples[28]).toBeLessThan(100)
  expect(samples[29]).toBeLessThan(250)
  expect(mountedRows).toBeLessThan(100)
  await expect(input).toHaveText(`Child 0 2026-10-14${'a'.repeat(30)}`)
  await expect(input).toBeFocused()
  await expect(heading).toHaveValue('Root')
})
