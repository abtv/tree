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
      const probe = { paints: [] as number[], completed: [] as boolean[], inserted: [] as number[] }
      ;(window as unknown as { dateCompletionProbe: typeof probe }).dateCompletionProbe = probe
      // Key-to-DOM latency isolates the application's own work from the two
      // animation frames the paint metric waits for, so it does not depend on the
      // display refresh rate.
      let pendingKeyTime: number | null = null
      new MutationObserver(() => {
        if (pendingKeyTime === null || document.querySelector('[role="listbox"] [role="option"]') === null) return
        probe.inserted.push(performance.now() - pendingKeyTime)
        pendingKeyTime = null
      }).observe(document.body, { childList: true, subtree: true })
      globalThis.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'o') return
          pendingKeyTime = event.timeStamp
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
        (
          window as unknown as {
            dateCompletionProbe: { paints: number[]; completed: boolean[]; inserted: number[] }
          }
        ).dateCompletionProbe,
    )
    const sorted = probe.paints.toSorted((a, b) => a - b)
    const insertedSorted = probe.inserted.toSorted((a, b) => a - b)
    recordPerfResult({
      kind: 'typing',
      scenario: `relative-date-10000-${vimEnabled ? 'vim' : 'standard'}`,
      samples: sorted.length,
      metrics: {
        firstPopupPaintMs: round(probe.paints[0]!),
        popupPaintP95Ms: round(sorted[28]!),
        popupPaintMaxMs: round(sorted[29]!),
        popupInsertP95Ms: round(insertedSorted[28]!),
        popupInsertMaxMs: round(insertedSorted[29]!),
      },
    })
    expect(probe.completed.every(Boolean)).toBe(true)
    expect(probe.inserted).toHaveLength(30)
    // The paint metric waits two animation frames (about 33 ms at 60 Hz), so these
    // ceilings leave roughly a frame and a half of margin rather than a tenfold one.
    expect(sorted[28]).toBeLessThan(50)
    expect(sorted[29]).toBeLessThan(100)
    // Measured near 1 ms; the first, cold keystroke is about 5 ms.
    expect(insertedSorted[29]).toBeLessThan(10)
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
