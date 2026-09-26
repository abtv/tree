import { expect, largeSeed, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from './results'

test.describe('Vim interactions at scale', () => {
  test('large-10000 cross-parent subtree relocation with dd and P', async ({ userDataDir }) => {
    seedDocument(userDataDir, largeSeed(100, 100))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const source = window.locator('.node-row[data-node-id="r0"]').getByRole('textbox')
    await source.focus()
    await expect(source).toBeFocused()

    await window.evaluate(() => {
      const probe = window as unknown as { subtreePastePaintMs?: number }
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'P') return
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              probe.subtreePastePaintMs = performance.now() - event.timeStamp
            })
          })
        },
        { capture: true },
      )
    })

    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await window.keyboard.press('P')
    await window.waitForFunction(
      () => (window as unknown as { subtreePastePaintMs?: number }).subtreePastePaintMs !== undefined,
    )
    const pastePaintMs = await window.evaluate(
      () => (window as unknown as { subtreePastePaintMs: number }).subtreePastePaintMs,
    )

    const destinationChildren = window.locator('.node-row')
    await expect(destinationChildren).toHaveCount(101)
    await expect(destinationChildren.first().getByRole('textbox')).toHaveValue('Root 0')
    await window.keyboard.press('g')
    await window.keyboard.press('d')
    await expect(window.locator('.node-row').first().getByRole('textbox')).toHaveValue('Node 0.0')
    await expect(window.locator('.node-row').first().getByRole('textbox')).toBeFocused()
    await expect(window.locator('.node-row')).toHaveCount(100)
    await window.keyboard.press('Control+o')
    await window.keyboard.press('Control+o')
    await expect(window.locator('.node-row')).toHaveCount(99)
    await expect(source).toHaveCount(0)

    recordPerfResult({
      kind: 'state',
      scenario: 'vim-cross-parent-subtree-relocation-10000',
      metrics: { pastePaintMs: round(pastePaintMs) },
    })
  })

  test('wide-1000 node Visual selection stays windowed', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(1_000))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await expect(input).toBeFocused()

    const start = performance.now()
    await window.keyboard.press('V')
    for (let index = 0; index < 40; index += 1) await window.keyboard.press('j')
    const selectionMs = performance.now() - start
    const mountedRows = await window.locator('.node-row').count()
    const highlightedRows = await window.locator('.node-row-visual-selected').count()

    recordPerfResult({
      kind: 'state',
      scenario: 'vim-visual-wide-1000',
      metrics: { selectionMs: round(selectionMs), mountedRows, highlightedRows },
    })

    expect(selectionMs).toBeLessThan(3_000)
    expect(mountedRows).toBeLessThan(100)
    expect(highlightedRows).toBeGreaterThan(0)
    expect(highlightedRows).toBeLessThanOrEqual(41)
  })

  for (const siblingCount of [1_000, 30_000]) {
    test(`wide-${siblingCount} Normal navigation stays windowed`, async ({ userDataDir }) => {
      const middle = Math.floor(siblingCount / 2)
      const seed = wideSeed(siblingCount)
      seed.location = { currentParentId: 'root', selectedNodeId: `c${middle}` }
      seedDocument(userDataDir, seed)
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const middleInput = window.getByRole('textbox', { name: `Node ${middle + 1}`, exact: true })
      await middleInput.focus()
      await expect(middleInput).toBeFocused()

      await window.evaluate(() => {
        const samples: number[] = []
        ;(window as unknown as { vimNavigationPaints: number[] }).vimNavigationPaints = samples
        document.addEventListener(
          'keydown',
          (event) => {
            if (event.key !== 'j' && event.key !== 'k') return
            const start = event.timeStamp
            requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - start)))
          },
          { capture: true },
        )
      })

      const start = performance.now()
      await window.keyboard.press('4')
      await window.keyboard.press('0')
      await window.keyboard.press('j')
      await window.keyboard.press('4')
      await window.keyboard.press('0')
      await window.keyboard.press('k')
      const navigationMs = performance.now() - start
      await window.waitForFunction(
        () => (window as unknown as { vimNavigationPaints: number[] }).vimNavigationPaints.length === 2,
      )
      const paints = await window.evaluate(() =>
        (window as unknown as { vimNavigationPaints: number[] }).vimNavigationPaints.slice().sort((a, b) => a - b),
      )
      const paintP95Ms = paints[Math.floor(paints.length * 0.95)]!
      const paintMaxMs = paints[paints.length - 1]!
      const mountedRows = await window.locator('.node-row').count()

      await expect(middleInput).toBeFocused()
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      recordPerfResult({
        kind: 'state',
        scenario: `vim-normal-wide-${siblingCount}`,
        metrics: {
          navigationMs: round(navigationMs),
          paintP95Ms: round(paintP95Ms),
          paintMaxMs: round(paintMaxMs),
          mountedRows,
        },
      })

      expect(navigationMs).toBeLessThan(2_000)
      expect(paintP95Ms).toBeLessThan(100)
      expect(paintMaxMs).toBeLessThan(250)
      expect(mountedRows).toBeLessThan(100)

      if (siblingCount !== 30_000) return

      await window.keyboard.press('i')
      await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
      await window.keyboard.press('Escape')
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      const modeStart = performance.now()
      for (let index = 0; index < 20; index += 1) {
        await window.keyboard.press('i')
        await window.keyboard.press('Escape')
      }
      const modeSwitchMs = performance.now() - modeStart
      await expect(middleInput).toBeFocused()
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      recordPerfResult({
        kind: 'state',
        scenario: 'vim-mode-wide-30000',
        metrics: { modeSwitchMs: round(modeSwitchMs) },
      })
      expect(modeSwitchMs).toBeLessThan(1_000)

      await window.keyboard.press('x')
      await expect(middleInput).toHaveValue(`hild ${middle}`)
      const repeatStart = performance.now()
      for (let index = 1; index <= 20; index += 1) {
        await window.keyboard.press('j')
        await window.keyboard.press('.')
      }
      const repeatMs = performance.now() - repeatStart
      const finalInput = window.getByRole('textbox', { name: `Node ${middle + 21}`, exact: true })
      await expect(finalInput).toBeFocused()
      await expect(finalInput).toHaveValue(`hild ${middle + 20}`)
      await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
      const repeatMountedRows = await window.locator('.node-row').count()
      recordPerfResult({
        kind: 'state',
        scenario: 'vim-repeat-wide-30000',
        metrics: { repeatMs: round(repeatMs), mountedRows: repeatMountedRows },
      })
      expect(repeatMs).toBeLessThan(1_000)
      expect(repeatMountedRows).toBeLessThan(100)

      for (let index = 0; index < 10; index += 1) await window.keyboard.press('k')
      await expect(window.getByRole('textbox', { name: `Node ${middle + 11}`, exact: true })).toHaveValue(
        `hild ${middle + 10}`,
      )
      for (let index = 0; index < 10; index += 1) await window.keyboard.press('k')
      await expect(middleInput).toHaveValue(`hild ${middle}`)

      const boundaryStart = performance.now()
      await window.keyboard.press('G')
      await expect(window.getByRole('textbox', { name: `Node ${siblingCount}`, exact: true })).toBeFocused()
      await window.keyboard.press('g')
      await window.keyboard.press('g')
      await expect(window.getByRole('textbox', { name: 'Current parent' })).toBeFocused()
      const boundaryMs = performance.now() - boundaryStart
      const boundaryMountedRows = await window.locator('.node-row').count()
      recordPerfResult({
        kind: 'state',
        scenario: 'vim-boundary-wide-30000',
        metrics: { boundaryMs: round(boundaryMs), mountedRows: boundaryMountedRows },
      })
      expect(boundaryMs).toBeLessThan(1_000)
      expect(boundaryMountedRows).toBeLessThan(100)
    })
  }
})
