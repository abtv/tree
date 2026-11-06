import { expect, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §22.1
test('line numbers keep Tree and Agenda navigation bounded at scale', async ({ userDataDir }) => {
  const today = new Date()
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 10000 }, (_, i) => ({ id: `n${i}`, text: `${date} Task ${i + 1}`, children: [] })),
    },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  })
  const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
  await window.evaluate(() => {
    const samples: number[] = []
    ;(window as unknown as { numberPaints: number[] }).numberPaints = samples
    globalThis.window.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'j' || event.key === 'k')
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
      },
      true,
    )
  })

  for (const view of ['tree', 'agenda']) {
    if (view === 'agenda') await window.keyboard.press('Meta+p')
    await window.locator(`[data-node-id="n0"] .node-input`).first().focus()

    for (const enabled of [false, true]) {
      if ((await window.evaluate(() => globalThis.window.treeApi.getLineNumbers())) !== enabled)
        await window.keyboard.press('Control+l')
      await window.evaluate(() => {
        ;(window as unknown as { numberPaints: number[] }).numberPaints.length = 0
      })
      for (let index = 0; index < 20; index++) await window.keyboard.press('j')
      for (let index = 0; index < 20; index++) await window.keyboard.press('k')
      await window.waitForFunction(() => (window as unknown as { numberPaints: number[] }).numberPaints.length === 40)
      const samples = await window.evaluate(() =>
        (window as unknown as { numberPaints: number[] }).numberPaints.toSorted((a, b) => a - b),
      )
      const mounted = await window.locator(view === 'tree' ? '.node-row' : '.agenda-row').count()

      recordPerfResult({
        kind: 'state',
        scenario: `${view}-10000-line-numbers-${enabled ? 'on' : 'off'}`,
        samples: samples.length,
        metrics: { motionP95Ms: round(samples[38]!), motionMaxMs: round(samples[39]!), mounted },
      })

      expect(samples[38]).toBeLessThan(50)
      expect(samples[39]).toBeLessThan(100)
      expect(mounted).toBeLessThan(150)
      await expect(window.locator(`[data-node-id="n0"] .node-input`).first()).toBeFocused()
    }
  }
})
