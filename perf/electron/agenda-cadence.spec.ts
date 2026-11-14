import { expect, launchTree, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

interface RepeatProbe {
  inputs: number
  frames: number
  commits: { frame: number; view: string; focusCorrect: boolean }[]
  released: boolean
  afterRelease: number
}

for (const vimEnabled of [true, false]) {
  // @requirement PRODUCT.md §23.1
  test(`native Agenda autorepeat leaves rendering opportunities (${vimEnabled ? 'vim' : 'standard'})`, async ({
    userDataDir,
  }) => {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 15 }, (_, index) => ({
          id: `repeat-${index}`,
          text: `${date} Item ${index + 1}`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'repeat-0' },
    })
    const { app, window } = await launchTree(userDataDir, { initialMode: 'normal', vimEnabled })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.focus())
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toBeFocused()

    await window.evaluate(() => {
      const probe: RepeatProbe = { inputs: 0, frames: 0, commits: [], released: false, afterRelease: 0 }
      Object.assign(globalThis, { agendaRepeatProbe: probe })
      const frame = (): void => {
        probe.frames++
        if (!probe.released) requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
      globalThis.addEventListener(
        'keydown',
        (event) => {
          if (event.isTrusted && event.metaKey && event.key.toLowerCase() === 'p') probe.inputs++
        },
        true,
      )
      globalThis.addEventListener(
        'keyup',
        (event) => {
          if (event.key.toLowerCase() === 'p') probe.released = true
        },
        true,
      )
      new MutationObserver(() => {
        const agenda = document.querySelector('.agenda-list')
        const selected = agenda?.querySelector('[aria-selected="true"]')
        const active = document.activeElement
        probe.commits.push({
          frame: probe.frames,
          view: agenda ? 'agenda' : 'tree',
          focusCorrect: agenda
            ? selected === active || selected?.contains(active) === true
            : active?.matches('.node-input') === true,
        })
        if (probe.released) probe.afterRelease++
      }).observe(document.querySelector('.editor-shell')!, {
        childList: true,
        attributes: true,
        attributeFilter: ['class'],
      })
    })

    // Native input keeps arriving independently of renderer progress. Frame indices are scheduling
    // evidence, not a physical presentation timestamp or a machine-specific frame-rate budget.
    const sent = await app.evaluate(async ({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]!.webContents
      const started = Date.now()
      let inputs = 0
      await new Promise<void>((done) => {
        const timer = setInterval(() => {
          contents.sendInputEvent({
            type: 'keyDown',
            keyCode: 'P',
            modifiers: inputs ? ['meta', 'isautorepeat'] : ['meta'],
          })
          if (++inputs >= 100 && Date.now() - started >= 1000) {
            clearInterval(timer)
            done()
          }
        }, 3)
      })
      contents.sendInputEvent({ type: 'keyUp', keyCode: 'P', modifiers: ['meta'] })
      return inputs
    })
    await expect
      .poll(() =>
        window.evaluate(() => (globalThis as unknown as { agendaRepeatProbe: RepeatProbe }).agendaRepeatProbe.released),
      )
      .toBe(true)
    const probe = await window.evaluate(
      () => (globalThis as unknown as { agendaRepeatProbe: RepeatProbe }).agendaRepeatProbe,
    )
    const minFramesBetweenSwitches = Math.min(
      ...probe.commits.slice(1).map((commit, index) => commit.frame - probe.commits[index]!.frame),
    )
    recordPerfResult({
      kind: 'state',
      scenario: `agenda-repeat-cadence-${vimEnabled ? 'vim' : 'standard'}`,
      samples: probe.inputs,
      metrics: { inputs: probe.inputs, viewSwitches: probe.commits.length, minFramesBetweenSwitches },
    })

    expect(probe.inputs).toBe(sent)
    expect(probe.commits.length).toBeGreaterThan(5)
    expect(probe.commits.length).toBeLessThan(probe.inputs)
    expect(probe.commits.every((commit) => commit.focusCorrect)).toBe(true)
    expect(minFramesBetweenSwitches).toBeGreaterThanOrEqual(2)

    await window.waitForTimeout(100)
    const settled = await window.evaluate(
      () => (globalThis as unknown as { agendaRepeatProbe: RepeatProbe }).agendaRepeatProbe,
    )
    expect(settled.afterRelease).toBe(0)
    expect(settled.commits).toHaveLength(probe.commits.length)
    if (probe.commits.at(-1)?.view === 'agenda') await expect(window.locator('.agenda-today')).toBeFocused()
    else await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toBeFocused()
  })
}
