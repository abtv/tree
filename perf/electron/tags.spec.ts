import { expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'

for (const vimEnabled of [false, true]) {
  // @requirement PRODUCT.md §20.13
  // @requirement PRODUCT.md §22.1
  test(`tag completion stays responsive with 10000 distinct tags (${vimEnabled ? 'Vim' : 'standard'})`, async ({
    userDataDir,
  }) => {
    const seed = wideSeed(10_000)
    const children = (seed.document as { roots: { children: { text: string }[] }[] }).roots[0]!.children
    children.forEach((node, index) => {
      node.text = `#project_${index}`
    })
    children[0]!.text = 'Plan #Uniqu'
    children[1]!.text = '#Unique'
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { vimEnabled, initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    if (vimEnabled) await window.keyboard.press('A')
    else await window.keyboard.press('Meta+ArrowRight')

    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { tagPaints: number[] }).tagPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'e') return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        true,
      )
    })
    const popup = window.getByRole('listbox', { name: 'Tag suggestions' })
    for (let index = 0; index < 30; index++) {
      await window.keyboard.press('e')

      await expect(popup.getByRole('option')).toHaveText(['#Unique'])
      await window.waitForFunction(
        (count) => (window as unknown as { tagPaints: number[] }).tagPaints.length === count,
        index + 1,
      )

      if (index < 29) {
        await window.keyboard.press('Backspace')
        await window.keyboard.press('Escape')
      }
    }
    const samples = await window.evaluate(() => (window as unknown as { tagPaints: number[] }).tagPaints)
    const sorted = samples.toSorted((a, b) => a - b)
    recordPerfResult({
      kind: 'typing',
      scenario: `tags-10000-${vimEnabled ? 'vim' : 'standard'}`,
      samples: samples.length,
      metrics: {
        firstPopupPaintMs: round(samples[0]!),
        popupPaintP95Ms: round(sorted[28]!),
        popupPaintMaxMs: round(sorted[29]!),
      },
    })

    expect(sorted[28]).toBeLessThan(50)
    expect(sorted[29]).toBeLessThan(100)
    await expect(input).toHaveText('Plan #Unique')
    await expect(input).toBeFocused()
  })
}
