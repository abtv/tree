import { expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'
import catalog from '../../src/domain/emoji-catalog.json'

// @requirement PRODUCT.md §20.12
// @requirement PRODUCT.md §22.1
test('emoji catalog browsing stays responsive in a 10000-node Tree', async ({ userDataDir }) => {
  const seed = wideSeed(10_000)
  const seededDocument = seed.document as { roots: { children: { text: string }[] }[] }
  seededDocument.roots[0]!.children[0]!.text = 'Plan '
  seedDocument(userDataDir, seed)
  const { window } = await launchTree(userDataDir, { vimEnabled: false })
  const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
  await input.focus()

  await expect(input).toBeFocused()

  await window.keyboard.press('Meta+ArrowRight')
  await window.evaluate(() => {
    const samples: number[] = []
    ;(window as unknown as { emojiPaints: number[] }).emojiPaints = samples
    globalThis.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== ':' && event.key !== 'ArrowDown' && event.key !== 't') return
        requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
      },
      { capture: true },
    )
  })
  const popup = window.getByRole('listbox', { name: 'Emoji suggestions' })
  for (let index = 0; index < 20; index++) {
    await window.keyboard.type(':')

    await expect(popup).toBeVisible()
    await expect(popup.getByRole('option')).toHaveCount(Object.keys(catalog).length)

    await window.waitForFunction(
      (count) => (window as unknown as { emojiPaints: number[] }).emojiPaints.length === count,
      index * 3 + 1,
    )

    await window.keyboard.press('ArrowDown')
    await window.waitForFunction(
      (count) => (window as unknown as { emojiPaints: number[] }).emojiPaints.length === count,
      index * 3 + 2,
    )

    await window.keyboard.type('rkt')

    await expect(popup.getByRole('option').filter({ hasText: ':rocket:' })).toBeVisible()

    await window.waitForFunction(
      (count) => (window as unknown as { emojiPaints: number[] }).emojiPaints.length === count,
      index * 3 + 3,
    )
    for (let key = 0; key < 4; key++) await window.keyboard.press('Backspace')

    await expect(popup).toHaveCount(0)
  }
  const samples = await window.evaluate(() => (window as unknown as { emojiPaints: number[] }).emojiPaints)
  const sorted = samples.toSorted((a, b) => a - b)

  recordPerfResult({
    kind: 'typing',
    scenario: 'emoji-catalog-10000-standard',
    samples: samples.length,
    metrics: {
      firstPopupPaintMs: round(samples[0]!),
      paintP95Ms: round(sorted[Math.floor(sorted.length * 0.95)]!),
      paintMaxMs: round(sorted.at(-1)!),
    },
  })

  expect(sorted[Math.floor(sorted.length * 0.95)]).toBeLessThan(50)
  expect(sorted.at(-1)).toBeLessThan(100)
  await expect(input).toHaveValue('Plan ')
  await expect(input).toBeFocused()
  await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Root')
})
