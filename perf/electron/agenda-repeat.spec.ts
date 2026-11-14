import { agendaSeed, expect, launchTree, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

for (const vimEnabled of [true, false]) {
  for (const destination of ['tree', 'agenda'] as const) {
    // @requirement PRODUCT.md §23.1
    test(`fast Agenda repeat leaves ${destination} navigation responsive (${vimEnabled ? 'vim' : 'standard'})`, async ({
      userDataDir,
    }, info) => {
      seedDocument(userDataDir, agendaSeed(100))
      const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', vimEnabled })
      await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toBeFocused()

      await window.evaluate(() => {
        const motions: { delay: number; feedback: number; row?: string | undefined }[] = []
        const release = { delay: null as number | null }
        Object.assign(window, { repeatRecovery: motions, repeatRelease: release })
        globalThis.addEventListener(
          'keyup',
          (event) => {
            if (event.key.toLowerCase() === 'p' && release.delay === null)
              release.delay = performance.now() - event.timeStamp
          },
          true,
        )
        document.addEventListener(
          'keydown',
          (event) => {
            if (!['j', 'k', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
            const sample: (typeof motions)[number] = { delay: performance.now() - event.timeStamp, feedback: 0 }
            motions.push(sample)
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                sample.feedback = performance.now() - event.timeStamp
                const row = document.activeElement?.closest<HTMLElement>('.node-row,.agenda-row')
                sample.row = row?.dataset.agendaKey ?? row?.dataset.nodeId
              }),
            )
          },
          true,
        )
      })

      // Main-process delivery keeps feeding the renderer even when it falls behind. Waiting for
      // each key's renderer acknowledgment would conceal the backlog this regression guards.
      const switches = await app.evaluate(async ({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows()[0]!.webContents
        const started = Date.now()
        let switches = 0
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            contents.sendInputEvent({
              type: 'keyDown',
              keyCode: 'P',
              modifiers: switches === 0 ? ['meta'] : ['meta', 'isautorepeat'],
            })
            switches++
            if (Date.now() - started >= 10000) {
              clearInterval(timer)
              resolve()
            }
          }, 3)
        })
        contents.sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] })
        return switches
      })
      await window.waitForFunction(
        () => (globalThis as unknown as { repeatRelease: { delay: number | null } }).repeatRelease.delay !== null,
      )
      const releaseDelay = await window.evaluate(
        () => (globalThis as unknown as { repeatRelease: { delay: number } }).repeatRelease.delay,
      )
      // Checking the release delay retains the backlog guard before choosing a destination.
      // Autorepeat merging makes native-input parity independent of the final view.
      expect(releaseDelay).toBeLessThan(250)
      const correctDestination = (await window.locator('.agenda-list').count()) > 0 !== (destination === 'agenda')
      const motions = await app.evaluate(
        async ({ BrowserWindow }, { correctDestination, vimEnabled }) => {
          const contents = BrowserWindow.getAllWindows()[0]!.webContents
          if (correctDestination) {
            contents.sendInputEvent({ type: 'keyDown', keyCode: 'P', modifiers: ['meta'] })
            contents.sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] })
          }
          let motions = 0
          await new Promise<void>((resolve) => {
            const timer = setInterval(() => {
              const down = Math.floor(motions / 10) % 2 === 0
              const keyCode = vimEnabled ? (down ? 'J' : 'K') : down ? 'Down' : 'Up'
              contents.sendInputEvent({ type: 'keyDown', keyCode })
              contents.sendInputEvent({ type: 'keyUp', keyCode })
              if (++motions === 100) {
                clearInterval(timer)
                resolve()
              }
            }, 10)
          })
          return motions
        },
        { correctDestination, vimEnabled },
      )
      const sent = { switches, motions }

      await window.waitForFunction((count) => {
        const samples = (window as unknown as { repeatRecovery: { feedback: number }[] }).repeatRecovery
        return samples.length === count && samples.every((sample) => sample.feedback > 0)
      }, sent.motions)
      const samples = await window.evaluate(
        () =>
          (window as unknown as { repeatRecovery: { delay: number; feedback: number; row?: string }[] }).repeatRecovery,
      )
      const maxDelay = Math.max(...samples.map((sample) => sample.delay))
      const maxFeedback = Math.max(...samples.map((sample) => sample.feedback))

      recordPerfResult({
        kind: 'state',
        scenario: `agenda-repeat-${destination}-${vimEnabled ? 'vim' : 'standard'}`,
        samples: samples.length,
        metrics: {
          switches: sent.switches,
          maxReleaseInputDelayMs: releaseDelay,
          maxInputDelayMs: maxDelay,
          maxTwoRafMs: maxFeedback,
        },
      })

      // A slow producer can conceal a renderer backlog instead of exercising it.
      expect(sent.switches).toBeGreaterThanOrEqual(2500)
      expect(maxDelay).toBeLessThan(250)
      expect(maxFeedback).toBeLessThan(300)
      expect(new Set(samples.map((sample) => sample.row).filter(Boolean)).size).toBeGreaterThan(1)
      await expect(window.locator('.agenda-list')).toHaveCount(destination === 'agenda' ? 1 : 0)
      expect(await window.evaluate(() => document.activeElement?.matches('.node-input,.agenda-row'))).toBe(true)
      await window.screenshot({ path: info.outputPath('recovery.png') })
    })
  }
}
