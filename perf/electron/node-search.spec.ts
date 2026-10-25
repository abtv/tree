import { expect, launchTree, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §20.14
test('complete-document search keeps rendered results bounded and accepts fresh input', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'parent',
          text: 'Parent',
          children: Array.from({ length: 10_000 }, (_, i) => ({
            id: `n${i}`,
            text: `Needle ${i} #work`,
            children: [],
          })),
        },
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'parent' },
  })
  const { window } = await launchTree(userDataDir)
  await window.keyboard.press('Meta+f')
  const input = window.getByRole('searchbox')
  await expect(input).toBeFocused()
  const start = performance.now()
  await input.fill('Needle')
  await expect(window.getByRole('option').first()).toContainText('Needle 0')
  const completeMs = performance.now() - start
  expect(await window.getByRole('option').count()).toBeLessThanOrEqual(40)
  await window.keyboard.press('ArrowUp')
  await expect(window.locator('[role="option"][aria-selected="true"]')).toContainText('Needle 9999')
  const paintMs = await input.evaluate(async (element) => {
    const start = performance.now()
    const input = element as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, 'missing')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return performance.now() - start
  })
  await expect(window.getByText('No results', { exact: true })).toBeVisible()
  await expect(window.locator('[data-node-id="parent"] .node-input')).toHaveValue('Parent')
  recordPerfResult({
    kind: 'node-search',
    scenario: 'wide-10000-results',
    samples: 1,
    metrics: { completeMs, paintMs },
  })
  expect(completeMs).toBeLessThan(2000)
  expect(paintMs).toBeLessThan(150)
})
