import type { Locator } from '@playwright/test'
import { expect, launchTree, round, seedDocument, setCalendarDate, test, wideSeed } from './fixtures'
import { recordPerfResult } from '../results'

async function caretOffset(input: Locator): Promise<number> {
  return input.evaluate((element) => {
    const selection = getSelection()!
    const before = document.createRange()
    before.selectNodeContents(element)
    before.setEnd(selection.anchorNode!, selection.anchorOffset)
    return before.toString().length
  })
}

// @requirement PRODUCT.md §22.2
test('vertical Vim motion stays responsive throughout a long row in Tree and Agenda', async ({ userDataDir }, info) => {
  const text = `2026-11-15 ${'Synthetic pasted content with ordinary words. '.repeat(1200).slice(0, 50_000)}`
  const seed = wideSeed(100)
  const children = (seed.document as { roots: { children: { text: string }[] }[] }).roots[0]!.children
  children[0]!.text = text
  children[1]!.text = '2026-11-15 Short neighbor'
  seedDocument(userDataDir, seed)
  const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await setCalendarDate(window, new Date(2026, 10, 15, 12))

  for (const view of ['tree', 'agenda']) {
    if (view === 'agenda') {
      await window.keyboard.press('Meta+p')
      await window.locator('.agenda-row[data-node-id="c0"]').first().click()
    }
    const input = window.getByRole('textbox', { name: view === 'tree' ? 'Node 1' : 'Agenda node c0', exact: true })
    await input.focus()
    await expect(input).toBeFocused()

    for (const position of ['start', 'middle', 'end']) {
      await window.keyboard.press('0')
      if (position === 'middle') await window.keyboard.type('25000l')
      if (position === 'end') await window.keyboard.press('$')
      const initial = position === 'start' ? 0 : position === 'middle' ? 25_000 : text.length - 1
      expect(await caretOffset(input)).toBe(initial)
      await window.evaluate(() => {
        const probe = globalThis as unknown as {
          longRowMotion: number[]
          longRowListener?: (event: KeyboardEvent) => void
        }
        if (probe.longRowListener) document.removeEventListener('keydown', probe.longRowListener, true)
        probe.longRowMotion = []
        probe.longRowListener = (event) => {
          if (!['j', 'k'].includes(event.key)) return
          requestAnimationFrame(() =>
            requestAnimationFrame(() => probe.longRowMotion.push(performance.now() - event.timeStamp)),
          )
        }
        document.addEventListener('keydown', probe.longRowListener, true)
      })

      // Native main-process delivery keeps feeding keys even when the renderer falls behind.
      await app.evaluate(async ({ BrowserWindow }, position) => {
        const contents = BrowserWindow.getAllWindows()[0]!.webContents
        for (let index = 0; index < 40; index++) {
          const keyCode = index % 2 === (position === 'end' ? 1 : 0) ? 'J' : 'K'
          contents.sendInputEvent({ type: 'keyDown', keyCode })
          contents.sendInputEvent({ type: 'keyUp', keyCode })
          await new Promise((resolve) => setTimeout(resolve, 16))
        }
      }, position)
      await window.waitForFunction(
        () => (globalThis as unknown as { longRowMotion: number[] }).longRowMotion.length === 40,
      )
      const samples = await window.evaluate(() =>
        (globalThis as unknown as { longRowMotion: number[] }).longRowMotion.toSorted((a, b) => a - b),
      )

      await expect(input).toHaveText(text)
      await expect(input).toBeFocused()
      expect(await caretOffset(input)).toBe(initial)
      const metrics = { twoRafP95Ms: round(samples[38]!), twoRafMaxMs: round(samples[39]!) }
      recordPerfResult({
        kind: 'state',
        scenario: `long-row-50000-${view}-${position}`,
        samples: samples.length,
        metrics,
      })

      // Two frames are a scheduling proxy. The original linear lookup backlogged >1 s at the start.
      expect(metrics.twoRafP95Ms).toBeLessThan(50)
      expect(metrics.twoRafMaxMs).toBeLessThan(100)
    }
    await window.screenshot({ path: info.outputPath(`long-row-${view}.png`) })
  }
})
