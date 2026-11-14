import { expect, launchTree, seedDocument, test, round } from './fixtures'
import { recordPerfResult } from '../results'

interface SwitchProbe {
  switches: number
  repeatedSwitches: number
  mounts: number
  ages: number[]
  paints: number[]
  positions: string[]
  releaseDelay: number | null
}

for (const scenario of [
  { hz: 60, agenda: false },
  { hz: 120, agenda: true },
]) {
  // @requirement PRODUCT.md §23.1
  // @requirement PRODUCT.md §22.2
  test(`held navigation after ten seconds of ${scenario.hz} Hz view switching into ${scenario.agenda ? 'Agenda' : 'Tree'}`, async ({
    userDataDir,
  }, testInfo) => {
    const date = new Date()
    const canonical = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 100000 }, (_, index) => ({
          id: `switch-${index}`,
          text: `${canonical} Node ${index} ${index % 4 === 0 ? 'Short line.' : 'Navigation text with wrapped lines. '.repeat(8)}`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'switch-0' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.evaluate(() => {
      const probe: SwitchProbe = {
        switches: 0,
        repeatedSwitches: 0,
        mounts: 0,
        ages: [],
        paints: [],
        positions: [],
        releaseDelay: null,
      }
      ;(window as unknown as { switchProbe: SwitchProbe }).switchProbe = probe
      globalThis.addEventListener(
        'keydown',
        (event) => {
          if (event.metaKey && event.key.toLowerCase() === 'p') {
            probe.switches++
            if (event.repeat) probe.repeatedSwitches++
          } else if (!event.metaKey && ['j', 'k'].includes(event.key)) {
            probe.ages.push(performance.now() - event.timeStamp)
            requestAnimationFrame(() =>
              requestAnimationFrame(() => probe.paints.push(performance.now() - event.timeStamp)),
            )
          }
        },
        true,
      )
      globalThis.addEventListener(
        'keyup',
        (event) => {
          if (event.key.toLowerCase() === 'p' && probe.releaseDelay === null)
            probe.releaseDelay = performance.now() - event.timeStamp
        },
        true,
      )
      globalThis.addEventListener('keydown', (event) => {
        if (event.metaKey || !['j', 'k'].includes(event.key)) return
        const element = document.activeElement as HTMLElement | null
        const row = element?.closest<HTMLElement>('[data-node-id],[data-agenda-key]')
        const cursor =
          element instanceof HTMLTextAreaElement ? element.selectionStart : document.getSelection()?.focusOffset
        probe.positions.push(`${row?.dataset.nodeId ?? row?.dataset.agendaKey}:${cursor}`)
      })
      new MutationObserver((records) => {
        for (const record of records)
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.matches('.agenda-list,.node-list')) probe.mounts++
          }
      }).observe(document.querySelector('main.tree-app')!, { childList: true, subtree: true })
    })

    const switches = await app.evaluate(async ({ BrowserWindow }, scenario) => {
      const target = BrowserWindow.getAllWindows().find((win) =>
        win.webContents.getURL().includes('index.html'),
      )!.webContents
      let switches = 1
      target.sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta'] })
      const timer = setInterval(() => {
        target.sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta', 'isautorepeat'] })
        switches++
      }, 1000 / scenario.hz)
      await new Promise((resolve) => setTimeout(resolve, 10000))
      clearInterval(timer)
      target.sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] })
      return switches
    }, scenario)
    await window.waitForFunction(
      () => (globalThis as unknown as { switchProbe: SwitchProbe }).switchProbe.releaseDelay !== null,
    )
    const releaseDelay = await window.evaluate(
      () => (globalThis as unknown as { switchProbe: SwitchProbe }).switchProbe.releaseDelay!,
    )
    expect(releaseDelay).toBeLessThan(50)
    const correctDestination = (await window.locator('.agenda-list').count()) > 0 !== scenario.agenda
    const navigation = await app.evaluate(
      async ({ BrowserWindow }, { scenario, correctDestination }) => {
        const target = BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().includes('index.html'),
        )!.webContents
        // Select the destination with a distinct press, then feed navigation without waiting for
        // that view to settle. The release-delay assertion above also detects a preexisting backlog.
        if (correctDestination) {
          target.sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta'] })
          target.sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] })
        }

        let navigation = 0
        for (const keyCode of ['J', 'K']) {
          target.sendInputEvent({ type: 'keyDown', keyCode })
          navigation++
          const held = setInterval(() => {
            target.sendInputEvent({ type: 'keyDown', keyCode, modifiers: ['isautorepeat'] })
            navigation++
          }, 1000 / scenario.hz)
          await new Promise((resolve) => setTimeout(resolve, 2000))
          clearInterval(held)
          target.sendInputEvent({ type: 'keyUp', keyCode })
        }
        return navigation
      },
      { scenario, correctDestination },
    )
    const sent = { switches: switches + (correctDestination ? 1 : 0), navigation }
    await window.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    const probe = await window.evaluate(() => (window as unknown as { switchProbe: SwitchProbe }).switchProbe)
    const metrics = {
      sentSwitches: sent.switches,
      receivedSwitches: probe.switches,
      viewMounts: probe.mounts,
      sentNavigation: sent.navigation,
      receivedNavigation: probe.ages.length,
      maxInputAgeMs: round(Math.max(...probe.ages)),
      maxPaintCallbackMs: round(Math.max(...probe.paints)),
      releaseInputAgeMs: round(releaseDelay),
    }
    recordPerfResult({
      kind: 'state',
      scenario: `agenda-switching-100000-${scenario.hz}hz-${scenario.agenda ? 'agenda' : 'tree'}`,
      samples: probe.ages.length,
      metrics,
    })

    expect(probe.switches).toBe(sent.switches)
    expect(probe.repeatedSwitches).toBe(switches - 1)
    expect(probe.mounts).toBeGreaterThan(10)
    expect(probe.mounts).toBeLessThanOrEqual(sent.switches)
    expect(probe.ages).toHaveLength(sent.navigation)
    expect(probe.paints).toHaveLength(sent.navigation)
    expect(new Set(probe.positions).size).toBeGreaterThan(10)
    expect(metrics.maxInputAgeMs).toBeLessThan(50)
    expect(metrics.maxPaintCallbackMs).toBeLessThan(100)
    await expect(window.locator('.agenda-list')).toHaveCount(scenario.agenda ? 1 : 0)
    await window.screenshot({ path: testInfo.outputPath('after-repeated-switching.png') })
  })
}
