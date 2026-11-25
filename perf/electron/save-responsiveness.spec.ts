import { SAVE_IDLE_MILLISECONDS } from '../../src/application/save-policy'
import { expect, largeSeed, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

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

  expect(paints['z']).toBeLessThan(100)
  expect(paints['x']).toBeLessThan(100)

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

// @requirement PRODUCT.md §22.1
test('global search refinements remain responsive while a 50000-node save finishes', async ({ userDataDir }) => {
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: 500 }, (_, group) => ({
        id: `group-${group}`,
        text: `Group ${group}`,
        children: Array.from({ length: 100 }, (_, row) => {
          const index = 100 * group + row
          return {
            id: `row-${index}`,
            text: `Unique row ${index}. ${'synthetic release details '.repeat(9)}`,
            children: [],
          }
        }),
      })),
    },
    location: { currentParentId: 'group-0', selectedNodeId: 'row-0' },
  })
  const { app, window } = await launchTree(userDataDir, { vimEnabled: false })
  const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
  const input = window.getByRole('searchbox')
  const list = window.getByRole('listbox', { name: 'Search results' })
  const saves = await app.evaluateHandle(() => {
    const completed: number[] = []
    globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
      const result = await original(...args)
      completed.push(Date.now())
      return result
    })
    return completed
  })

  await window.evaluate((idleMs) => {
    const probe = { delay: 0, paints: [] as number[] }
    ;(globalThis as unknown as { searchSaveProbe: typeof probe }).searchSaveProbe = probe
    const renderer = globalThis as unknown as Window
    const schedule = renderer.setTimeout.bind(renderer)
    // Align the real idle save with the input burst, or deliberately place it after the control burst.
    renderer.setTimeout = (handler, timeout, ...args) =>
      schedule(handler, timeout === idleMs && probe.delay > 0 ? probe.delay : timeout, ...args)
    document.addEventListener(
      'input',
      (event) => {
        if (!(event.target instanceof HTMLInputElement) || event.target.type !== 'search') return
        requestAnimationFrame(() => requestAnimationFrame(() => probe.paints.push(performance.now() - event.timeStamp)))
      },
      true,
    )
  }, SAVE_IDLE_MILLISECONDS)

  const burst = async () => {
    for (let step = 0; step < 10; step += 1) {
      await window.keyboard.press('Meta+;')
      await input.fill('release')
      await input.fill(`absent probe ${step}`)
      await input.fill('Unique row 49999')
      if (step !== 9) await input.press('Escape')
    }
    await expect(list).toHaveAttribute('aria-busy', 'false')
    await expect(list.getByRole('option', { selected: true })).toContainText('Unique row 49999.')
    await expect(input).toBeFocused()
    await input.press('Escape')
    await expect(editor).toBeFocused()
  }

  const p95: number[] = []
  try {
    await expect(editor).toBeFocused()
    await burst()
    for (const [index, delay] of [95, 2500, 2500, 95].entries()) {
      await window.evaluate((delay) => {
        const probe = (globalThis as unknown as { searchSaveProbe: { delay: number; paints: number[] } })
          .searchSaveProbe
        probe.delay = delay
        probe.paints.length = 0
      }, delay)
      await editor.evaluate((element: HTMLTextAreaElement) => {
        element.setSelectionRange(element.value.length, element.value.length)
      })
      await window.keyboard.insertText(String(index))
      const start = Date.now()
      await burst()
      const end = Date.now()

      await expect.poll(() => saves.evaluate((completed, index) => completed[index], index)).toBeTruthy()
      const savedAt = await saves.evaluate((completed, index) => completed[index]!, index)
      expect(savedAt).toBeGreaterThan(start)
      expect(savedAt < end).toBe(delay === 95)
      const paints = await window.evaluate(
        () => (globalThis as unknown as { searchSaveProbe: { paints: number[] } }).searchSaveProbe.paints,
      )
      expect(paints).toHaveLength(30)
      p95.push(paints.toSorted((a, b) => a - b)[28]!)
    }
    await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Group 0')
  } finally {
    await saves.dispose()
  }

  const overlapP95 = Math.max(p95[0]!, p95[3]!)
  const controlP95 = Math.max(p95[1]!, p95[2]!)
  recordPerfResult({
    kind: 'state',
    scenario: 'global-search-refinement-during-save-50000',
    metrics: { overlapP95Ms: round(overlapP95), controlP95Ms: round(controlP95) },
  })
  // Detect an extra 60 Hz frame over the same-run control, with slack for faster displays.
  expect(overlapP95).toBeLessThanOrEqual(Math.max(45, controlP95 + 12))
})
