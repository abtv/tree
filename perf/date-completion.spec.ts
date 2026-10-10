import { calendarDateOf, dayNumberOf, formatCanonicalDate } from '../src/domain/calendar-date'
import { expect, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from './results'

for (const vimEnabled of [true, false]) {
  // @requirement PRODUCT.md §20.9
  // @requirement PRODUCT.md §22.1
  test(`relative date autocomplete stays responsive in a 10000-node Tree (${vimEnabled ? 'Vim' : 'standard'})`, async ({
    userDataDir,
  }) => {
    const prefix = 'Plan two days ag'
    const seed = wideSeed(10_000)
    const seededDocument = seed.document as { roots: { children: { text: string }[] }[] }
    seededDocument.roots[0]!.children[0]!.text = prefix
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { vimEnabled, initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    const heading = window.getByRole('textbox', { name: 'Current parent', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await expect(input).toHaveValue(prefix)
    if (vimEnabled) await window.keyboard.press('A')
    else await window.keyboard.press('Meta+ArrowRight')

    await window.evaluate(() => {
      const probe = { paints: [] as number[], completed: [] as boolean[] }
      ;(window as unknown as { dateCompletionProbe: typeof probe }).dateCompletionProbe = probe
      globalThis.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'o') return
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              probe.paints.push(performance.now() - event.timeStamp)
              probe.completed.push(document.querySelector('[role="listbox"] [role="option"]') !== null)
            }),
          )
        },
        { capture: true },
      )
    })
    const localDate = await window.evaluate(() => {
      const now = new Date()
      return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() }
    })
    const expectedDate = formatCanonicalDate(calendarDateOf(dayNumberOf(localDate) - 2))
    const popup = window.getByRole('listbox', { name: 'Date suggestions' })
    for (let index = 0; index < 30; index++) {
      await window.keyboard.press('o')
      await expect(popup.getByRole('option')).toHaveCount(1)
      await expect(popup.getByRole('option')).toContainText(expectedDate)
      await window.waitForFunction(
        (count) =>
          (window as unknown as { dateCompletionProbe: { paints: number[] } }).dateCompletionProbe.paints.length ===
          count,
        index + 1,
      )
      if (index < 29) await window.keyboard.press('Backspace')
    }
    const probe = await window.evaluate(
      () =>
        (window as unknown as { dateCompletionProbe: { paints: number[]; completed: boolean[] } }).dateCompletionProbe,
    )
    const sorted = probe.paints.toSorted((a, b) => a - b)
    recordPerfResult({
      kind: 'typing',
      scenario: `relative-date-10000-${vimEnabled ? 'vim' : 'standard'}`,
      samples: sorted.length,
      metrics: {
        firstPopupPaintMs: round(probe.paints[0]!),
        popupPaintP95Ms: round(sorted[28]!),
        popupPaintMaxMs: round(sorted[29]!),
      },
    })
    expect(probe.completed.every(Boolean)).toBe(true)
    expect(sorted[28]).toBeLessThan(100)
    expect(sorted[29]).toBeLessThan(250)
    await expect(input).toHaveValue(`${prefix}o`)
    await expect(input).toBeFocused()
    await expect(heading).toHaveValue('Root')
    await window.keyboard.press('Tab')
    await expect
      .poll(() =>
        input.evaluate((element) => (element instanceof HTMLTextAreaElement ? element.value : element.textContent)),
      )
      .toBe(`Plan ${expectedDate}`)
    await expect(popup).toHaveCount(0)
  })
}
