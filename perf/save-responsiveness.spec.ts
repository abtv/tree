import { expect, largeSeed, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from './results'

async function measureSaveResponsiveness(userDataDir: string, cpuRate: number): Promise<void> {
  seedDocument(userDataDir, largeSeed(100, 100))
  const { app, window } = await launchTree(userDataDir)
  const cpuSession = cpuRate === 1 ? undefined : await window.context().newCDPSession(window)
  if (cpuSession !== undefined) await cpuSession.send('Emulation.setCPUThrottlingRate', { rate: cpuRate })
  const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
  await input.focus()
  await expect(input).toBeFocused()
  await app.evaluate(() => {
    const control = globalThis as typeof globalThis & {
      __saveResponsiveness?: { started: boolean; completed: boolean }
    }
    control.__saveResponsiveness = { started: false, completed: false }
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      control.__saveResponsiveness!.started = true
      await new Promise((resolve) => setTimeout(resolve, 750))
      try {
        return await original(...args)
      } finally {
        control.__saveResponsiveness!.completed = true
      }
    })
  })
  await window.evaluate(() => {
    const paints: Record<string, number> = {}
    ;(window as unknown as { saveInputPaints: Record<string, number> }).saveInputPaints = paints
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'z' && event.key !== 'x') return
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            paints[event.key] = performance.now() - event.timeStamp
          })
        })
      },
      { capture: true },
    )
  })

  await window.keyboard.type('one two three four five six seven eight nine ')
  await window.keyboard.press('z')
  await expect
    .poll(() =>
      app.evaluate(
        () =>
          (globalThis as typeof globalThis & { __saveResponsiveness?: { started: boolean } }).__saveResponsiveness
            ?.started,
      ),
    )
    .toBe(true)
  const saveFinishedBeforeNextKey = await app.evaluate(
    () =>
      (globalThis as typeof globalThis & { __saveResponsiveness?: { completed: boolean } }).__saveResponsiveness
        ?.completed,
  )
  expect(saveFinishedBeforeNextKey).toBe(false)
  await window.keyboard.press('x')
  await window.waitForFunction(
    () => Object.keys((window as unknown as { saveInputPaints: object }).saveInputPaints).length === 2,
  )
  const paints = await window.evaluate(
    () => (window as unknown as { saveInputPaints: Record<string, number> }).saveInputPaints,
  )
  await expect
    .poll(() =>
      app.evaluate(
        () =>
          (globalThis as typeof globalThis & { __saveResponsiveness?: { completed: boolean } }).__saveResponsiveness
            ?.completed,
      ),
    )
    .toBe(true)
  await expect(input).toHaveValue(/nine zx/)

  recordPerfResult({
    kind: 'state',
    scenario: `typing-during-save-large-10000-cpu-${cpuRate}x`,
    metrics: { triggerPaintMs: round(paints['z']!), inFlightPaintMs: round(paints['x']!) },
  })
  expect(paints['z']).toBeLessThan(250)
  expect(paints['x']).toBeLessThan(250)
  await cpuSession?.detach()
}

test('typing remains responsive during automatic save', async ({ userDataDir }) => {
  await measureSaveResponsiveness(userDataDir, 1)
})

test('typing remains responsive during automatic save with four-times renderer CPU throttling', async ({
  userDataDir,
}) => {
  await measureSaveResponsiveness(userDataDir, 4)
})
