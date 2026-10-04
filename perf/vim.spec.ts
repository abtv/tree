import { expect, largeSeed, launchTree, round, seedDocument, test, wideSeed } from './fixtures'
import { recordPerfResult } from './results'
import { startRowDrag } from '../e2e/fixtures'

test.describe('Vim interactions at scale', () => {
  test('character Visual selection responds through repeated motions', async ({ userDataDir }) => {
    const children = Array.from({ length: 1_000 }, (_, index) => ({
      id: `c${index}`,
      text: index === 500 ? 'abcdefghijklmnopqrstuvwxyz'.repeat(4) : `Child ${index}`,
      children: [],
    }))
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Root', children }] },
      location: { currentParentId: 'root', selectedNodeId: 'c500' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 501', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { visualPaints: number[] }).visualPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (!['v', 'l', 'h', 'Escape'].includes(event.key)) return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    await window.keyboard.press('v')
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('l')
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('h')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL')
    await window.keyboard.press('Escape')
    await window.waitForFunction(() => (window as unknown as { visualPaints: number[] }).visualPaints.length === 42)
    const samples = await window.evaluate(() =>
      (window as unknown as { visualPaints: number[] }).visualPaints.slice().sort((a, b) => a - b),
    )
    await expect(input).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    const paintP95Ms = samples[Math.floor(samples.length * 0.95)]!
    const paintMaxMs = samples[samples.length - 1]!
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-character-visual-wide-1000',
      samples: samples.length,
      metrics: { paintP95Ms: round(paintP95Ms), paintMaxMs: round(paintMaxMs) },
    })
    expect(paintP95Ms).toBeLessThan(100)
    expect(paintMaxMs).toBeLessThan(250)
  })

  test('whole-node Visual selection responds through repeated motions', async ({ userDataDir }) => {
    const seed = wideSeed(1_000)
    seed.location = { currentParentId: 'root', selectedNodeId: 'c500' }
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 501', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { nodeVisualPaints: number[] }).nodeVisualPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (!['V', 'j', 'k', 'Escape'].includes(event.key)) return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    await window.keyboard.press('V')
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('j')
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('k')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.keyboard.press('Escape')
    await window.waitForFunction(
      () => (window as unknown as { nodeVisualPaints: number[] }).nodeVisualPaints.length === 42,
    )
    const samples = await window.evaluate(() =>
      (window as unknown as { nodeVisualPaints: number[] }).nodeVisualPaints.slice().sort((a, b) => a - b),
    )
    await expect(input).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    const paintP95Ms = samples[Math.floor(samples.length * 0.95)]!
    const paintMaxMs = samples[samples.length - 1]!
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-node-visual-wide-1000',
      samples: samples.length,
      metrics: { paintP95Ms: round(paintP95Ms), paintMaxMs: round(paintMaxMs) },
    })
    expect(paintP95Ms).toBeLessThan(100)
    expect(paintMaxMs).toBeLessThan(250)
  })

  for (const siblingCount of [1_000, 10_000]) {
    test(`standalone dd responds in a ${siblingCount}-sibling level`, async ({ userDataDir }) => {
      const middle = Math.floor(siblingCount / 2)
      const seed = wideSeed(siblingCount)
      seed.location = { currentParentId: 'root', selectedNodeId: `c${middle}` }
      seedDocument(userDataDir, seed)
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const input = window.getByRole('textbox', { name: `Node ${middle + 1}`, exact: true })
      await input.focus()
      await expect(input).toBeFocused()
      await window.evaluate(() => {
        const samples: number[] = []
        ;(window as unknown as { ddPaints: number[] }).ddPaints = samples
        document.addEventListener(
          'keydown',
          (event) => {
            if (event.key !== 'd') return
            requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
          },
          { capture: true },
        )
      })

      await window.keyboard.press('d')
      await window.keyboard.press('d')
      await window.waitForFunction(() => (window as unknown as { ddPaints: number[] }).ddPaints.length === 2)
      const deletePaintMs = await window.evaluate(() => (window as unknown as { ddPaints: number[] }).ddPaints[1]!)
      await expect(window.locator(`.node-row[data-node-id="c${middle}"]`)).toHaveCount(0)
      await expect(window.getByRole('textbox', { name: `Node ${middle + 1}`, exact: true })).toBeFocused()
      recordPerfResult({
        kind: 'state',
        scenario: `vim-dd-wide-${siblingCount}`,
        metrics: { deletePaintMs: round(deletePaintMs) },
      })
      expect(deletePaintMs).toBeLessThan(250)
    })
  }

  test('counted 100dd responds in a 10000-sibling level', async ({ userDataDir }) => {
    const seed = wideSeed(10_000)
    seed.location = { currentParentId: 'root', selectedNodeId: 'c100' }
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 101', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { countedPaints: number[] }).countedPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'd') return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    for (const key of ['1', '0', '0', 'd', 'd']) await window.keyboard.press(key)
    await window.waitForFunction(() => (window as unknown as { countedPaints: number[] }).countedPaints.length === 2)
    const deletePaintMs = await window.evaluate(
      () => (window as unknown as { countedPaints: number[] }).countedPaints[1]!,
    )
    await expect(window.locator('.node-row[data-node-id="c100"]')).toHaveCount(0)
    await expect(window.locator('.node-row[data-node-id="c199"]')).toHaveCount(0)
    await expect(window.getByRole('textbox', { name: 'Node 101', exact: true })).toHaveValue(/200/u)
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-counted-dd-wide-10000',
      metrics: { deletePaintMs: round(deletePaintMs) },
    })
    expect(deletePaintMs).toBeLessThan(250)
  })

  test('counted d100j responds in a 10000-sibling level', async ({ userDataDir }) => {
    const seed = wideSeed(10_000)
    seed.location = { currentParentId: 'root', selectedNodeId: 'c100' }
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 101', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { verticalPaints: number[] }).verticalPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'd' && event.key !== 'j') return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    for (const key of ['1', '0', '0', 'd', 'j']) await window.keyboard.press(key)
    await window.waitForFunction(() => (window as unknown as { verticalPaints: number[] }).verticalPaints.length === 2)
    const deletePaintMs = await window.evaluate(
      () => (window as unknown as { verticalPaints: number[] }).verticalPaints[1]!,
    )
    // The current node and the hundred siblings after it are gone: c100 through c200.
    await expect(window.locator('.node-row[data-node-id="c100"]')).toHaveCount(0)
    await expect(window.locator('.node-row[data-node-id="c200"]')).toHaveCount(0)
    await expect(window.getByRole('textbox', { name: 'Node 101', exact: true })).toHaveValue(/201/u)
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-vertical-operator-wide-10000',
      metrics: { deletePaintMs: round(deletePaintMs) },
    })
    expect(deletePaintMs).toBeLessThan(250)
  })

  test('counted 100J responds in a 10000-sibling level', async ({ userDataDir }) => {
    const seed = wideSeed(10_000)
    seed.location = { currentParentId: 'root', selectedNodeId: 'c100' }
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 101', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { joinPaints: number[] }).joinPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'J' && event.key !== '.') return
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    for (const key of ['1', '0', '0', 'J']) await window.keyboard.press(key)
    await window.waitForFunction(() => (window as unknown as { joinPaints: number[] }).joinPaints.length === 1)
    const joinPaintMs = await window.evaluate(() => (window as unknown as { joinPaints: number[] }).joinPaints[0]!)
    // The node and the ninety-nine siblings after it are one node: c100 absorbed c101 through c199.
    await expect(window.locator('.node-row[data-node-id="c101"]')).toHaveCount(0)
    await expect(window.locator('.node-row[data-node-id="c199"]')).toHaveCount(0)
    await expect(window.getByRole('textbox', { name: 'Node 101', exact: true })).toHaveValue(
      /^Child 100 Child 101 .* Child 199$/u,
    )
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-counted-join-wide-10000',
      metrics: { joinPaintMs: round(joinPaintMs) },
    })
    expect(joinPaintMs).toBeLessThan(250)
    await window.keyboard.press('u')
    await expect(input).toHaveValue('Child 100')
    await window.keyboard.press('.')
    await window.waitForFunction(() => (window as unknown as { joinPaints: number[] }).joinPaints.length === 2)
    const repeatPaintMs = await window.evaluate(() => (window as unknown as { joinPaints: number[] }).joinPaints[1]!)
    await expect(input).toHaveValue(/^Child 100 Child 101 .* Child 199$/u)
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-repeat-join-wide-10000',
      metrics: { originalPaintMs: round(joinPaintMs), repeatPaintMs: round(repeatPaintMs) },
    })
    // Replay uses the same atomic range transition, so it shares the measured original-command budget.
    expect(repeatPaintMs).toBeLessThan(250)
  })

  test('whole-node Visual J over a whole 10000-sibling level responds', async ({ userDataDir }) => {
    const seed = wideSeed(10_000)
    seedDocument(userDataDir, seed)
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await input.focus()
    await expect(input).toBeFocused()
    await window.keyboard.press('V')
    await window.keyboard.press('G')
    await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
    await window.evaluate(() => {
      const probe = window as unknown as { joinAllPaintMs?: number }
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key !== 'J') return
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              probe.joinAllPaintMs = performance.now() - event.timeStamp
            }),
          )
        },
        { capture: true },
      )
    })

    await window.keyboard.press('J')
    await window.waitForFunction(() => (window as unknown as { joinAllPaintMs?: number }).joinAllPaintMs !== undefined)
    const joinPaintMs = await window.evaluate(() => (window as unknown as { joinAllPaintMs: number }).joinAllPaintMs)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await expect(window.locator('.node-row[data-node-id="c9999"]')).toHaveCount(0)
    await expect(window.getByRole('textbox', { name: 'Node 1', exact: true })).toHaveValue(
      /^Child 0 Child 1 .* Child 9999$/u,
    )
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-visual-join-all-wide-10000',
      metrics: { joinPaintMs: round(joinPaintMs) },
    })
    // Three same-machine runs measured 811-819 ms, of which the join itself is about 4 ms; the rest is
    // laying out one node of about 108,000 characters, so the budget is that baseline plus headroom.
    expect(joinPaintMs).toBeLessThan(1_500)
  })

  for (const siblingCount of [1_000, 10_000]) {
    test(`whole-node Visual > and < respond in a ${siblingCount}-sibling level`, async ({ userDataDir }) => {
      const middle = Math.floor(siblingCount / 2)
      const seed = wideSeed(siblingCount)
      seed.location = { currentParentId: 'root', selectedNodeId: `c${middle}` }
      seedDocument(userDataDir, seed)
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const input = window.getByRole('textbox', { name: `Node ${middle + 1}`, exact: true })
      await input.focus()
      await expect(input).toBeFocused()
      await window.evaluate(() => {
        const samples: number[] = []
        ;(window as unknown as { shiftPaints: number[] }).shiftPaints = samples
        document.addEventListener(
          'keydown',
          (event) => {
            if (event.key !== '>' && event.key !== '<') return
            requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
          },
          { capture: true },
        )
      })

      await window.keyboard.press('V')
      await window.keyboard.press('>')
      await window.waitForFunction(() => (window as unknown as { shiftPaints: number[] }).shiftPaints.length === 1)
      await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
      await window.keyboard.press('<')
      await window.waitForFunction(() => (window as unknown as { shiftPaints: number[] }).shiftPaints.length === 2)
      const [indentPaintMs, outdentPaintMs] = await window.evaluate(
        () => (window as unknown as { shiftPaints: number[] }).shiftPaints,
      )
      await expect(window.getByLabel('Vim mode')).toHaveText('VISUAL NODE')
      await expect(window.locator('.node-row-visual-selected')).toHaveCount(1)
      recordPerfResult({
        kind: 'state',
        scenario: `vim-node-visual-shift-wide-${siblingCount}`,
        metrics: { indentPaintMs: round(indentPaintMs!), outdentPaintMs: round(outdentPaintMs!) },
      })
      expect(indentPaintMs).toBeLessThan(250)
      expect(outdentPaintMs).toBeLessThan(250)
    })
  }

  test('wide sibling movement responds after a completed drag', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(1_000))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const source = window.locator('.node-row[data-node-id="c0"]')
    const target = window.locator('.node-row[data-node-id="c1"]')
    await startRowDrag(window, source.getByRole('textbox'))
    const targetBox = await target.boundingBox()
    if (targetBox === null) throw new Error('The movement target was not rendered.')
    await window.mouse.move(targetBox.x + 8, targetBox.y + targetBox.height - 4, { steps: 5 })
    await expect(window.locator('.node-row-drop-before, .node-row-drop-after')).toHaveCount(1)
    await window.evaluate(() => {
      document.addEventListener(
        'pointerup',
        (event) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              ;(window as unknown as { movePaintMs: number }).movePaintMs = performance.now() - event.timeStamp
            })
          })
        },
        { capture: true, once: true },
      )
    })
    await window.mouse.up()
    await window.waitForFunction(() => (window as unknown as { movePaintMs?: number }).movePaintMs !== undefined)
    const movePaintMs = await window.evaluate(() => (window as unknown as { movePaintMs: number }).movePaintMs)
    await expect(window.locator('.node-row[data-node-id="c0"]')).toHaveAttribute('data-node-index', '1')
    recordPerfResult({
      kind: 'state',
      scenario: 'sibling-move-wide-1000',
      metrics: { movePaintMs: round(movePaintMs) },
    })
    expect(movePaintMs).toBeLessThan(250)
  })

  for (const targetKind of ['gap', 'row'] as const) {
    test(`cross-parent ${targetKind} drag resolves and paints over a thousand-row visible list`, async ({
      userDataDir,
    }) => {
      seedDocument(userDataDir, {
        document: {
          roots: [
            { id: 'source', text: 'Source', children: [] },
            {
              id: 'destination',
              text: 'Destination',
              children: Array.from({ length: 999 }, (_, index) => ({
                id: `destination-${index}`,
                text: `Destination child ${index}`,
                children: [],
              })),
            },
          ],
        },
        location: { currentParentId: null, selectedNodeId: 'source' },
        view: { expandedIds: ['destination'] },
      })
      const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const source = window.locator('.node-row[data-node-id="source"] .node-input')
      const receiver = window.locator(
        `.node-row[data-node-id="${targetKind === 'row' ? 'destination' : 'destination-0'}"]`,
      )
      const sourceBox = await source.boundingBox()
      const targetBox = await receiver.boundingBox()
      if (sourceBox === null || targetBox === null)
        throw new Error('The cross-parent performance rows were not rendered.')
      expect(await window.locator('.node-row').count()).toBeLessThan(100)

      await startRowDrag(window, source)
      await window.evaluate(() => {
        const state = window as unknown as { hoverPaintMs?: number; crossParentMovePaintMs?: number }
        document.addEventListener(
          'pointermove',
          () => {
            if (!document.body.classList.contains('node-drag-active')) return
            const start = performance.now()
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.hoverPaintMs = performance.now() - start
              }),
            )
          },
          { capture: true },
        )
        document.addEventListener(
          'pointerup',
          () => {
            const start = performance.now()
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                state.crossParentMovePaintMs = performance.now() - start
              }),
            )
          },
          { capture: true, once: true },
        )
      })
      await window.mouse.move(
        targetKind === 'row' ? targetBox.x + 30 : sourceBox.x + 28,
        targetBox.y + (targetKind === 'row' ? targetBox.height / 2 : 2),
        { steps: 5 },
      )
      await expect(receiver).toHaveClass(targetKind === 'row' ? /node-row-drop-on/ : /node-row-drop-before/)
      await window.waitForFunction(() => (window as unknown as { hoverPaintMs?: number }).hoverPaintMs !== undefined)
      await window.mouse.up()
      await window.waitForFunction(
        () => (window as unknown as { crossParentMovePaintMs?: number }).crossParentMovePaintMs !== undefined,
      )

      const metrics = await window.evaluate(() => {
        const state = window as unknown as { hoverPaintMs: number; crossParentMovePaintMs: number }
        return { hoverPaintMs: state.hoverPaintMs, crossParentMovePaintMs: state.crossParentMovePaintMs }
      })
      await expect(window.locator('.node-row[data-node-id="source"]')).toHaveAttribute('data-depth', '1')
      recordPerfResult({
        kind: 'state',
        scenario: targetKind === 'row' ? 'cross-parent-row-drag-windowed-1000' : 'cross-parent-drag-windowed-1000',
        metrics: {
          hoverToPaintMs: round(metrics.hoverPaintMs),
          moveToPaintMs: round(metrics.crossParentMovePaintMs),
        },
      })
      expect(metrics.hoverPaintMs).toBeLessThan(250)
      expect(metrics.crossParentMovePaintMs).toBeLessThan(250)
    })
  }

  test('common editing remains usable with four-times renderer CPU throttling', async ({ userDataDir }) => {
    const children = Array.from({ length: 1_000 }, (_, index) => ({
      id: `c${index}`,
      text: index === 500 ? 'abcdefghijklmnopqrstuvwxyz'.repeat(4) : `Child ${index}`,
      children: [],
    }))
    seedDocument(userDataDir, {
      document: { roots: [{ id: 'root', text: 'Root', children }] },
      location: { currentParentId: 'root', selectedNodeId: 'c500' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 501', exact: true })
    await input.focus()
    const session = await window.context().newCDPSession(window)
    await session.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await window.evaluate(() => {
      const samples: number[] = []
      ;(window as unknown as { throttledPaints: number[] }).throttledPaints = samples
      document.addEventListener(
        'keydown',
        (event) => {
          requestAnimationFrame(() => requestAnimationFrame(() => samples.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    for (let index = 0; index < 20; index += 1) {
      await window.keyboard.press('l')
      await window.keyboard.press('h')
    }
    await window.waitForFunction(
      () => (window as unknown as { throttledPaints: number[] }).throttledPaints.length === 40,
    )
    await window.keyboard.press('v')
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('l')
    for (let index = 0; index < 20; index += 1) await window.keyboard.press('h')
    await window.keyboard.press('Escape')
    await window.waitForFunction(
      () => (window as unknown as { throttledPaints: number[] }).throttledPaints.length === 82,
    )
    await window.keyboard.press('i')
    await window.keyboard.type('abcdefghijklmnopqrstuvwxyz')
    await window.waitForFunction(
      () => (window as unknown as { throttledPaints: number[] }).throttledPaints.length === 109,
    )
    const samples = await window.evaluate(() => (window as unknown as { throttledPaints: number[] }).throttledPaints)
    for (const [scenario, phase] of [
      ['normal', samples.slice(0, 40)],
      ['visual', samples.slice(40, 82)],
      ['insert', samples.slice(82)],
    ] as const) {
      const sorted = phase.slice().sort((a, b) => a - b)
      const paintP95Ms = sorted[Math.floor(sorted.length * 0.95)]!
      const paintMaxMs = sorted[sorted.length - 1]!
      recordPerfResult({
        kind: 'state',
        scenario: `vim-throttled-${scenario}-1000`,
        samples: sorted.length,
        metrics: {
          paintP95Ms: round(paintP95Ms),
          paintMaxMs: round(paintMaxMs),
        },
      })
      expect(paintP95Ms).toBeLessThan(100)
      expect(paintMaxMs).toBeLessThan(250)
    }
    await expect(window.getByLabel('Vim mode')).toHaveText('INSERT')
    await expect(input).toBeFocused()
    await window.keyboard.press('Escape')
    await window.keyboard.press('d')
    await window.keyboard.press('d')
    await window.waitForFunction(
      () => (window as unknown as { throttledPaints: number[] }).throttledPaints.length === 112,
    )
    const deletePaintMs = await window.evaluate(
      () => (window as unknown as { throttledPaints: number[] }).throttledPaints[111]!,
    )
    await expect(window.locator('.node-row[data-node-id="c500"]')).toHaveCount(0)
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-throttled-dd-wide-1000',
      metrics: { deletePaintMs: round(deletePaintMs) },
    })
    expect(deletePaintMs).toBeLessThan(250)
    await session.detach()
  })

  // @requirement PRODUCT.md §22.2
  test('ordinary Vim editing keeps repeated key-to-paint latency low', async ({ userDataDir }) => {
    seedDocument(userDataDir, wideSeed(100))
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    const input = window.getByRole('textbox', { name: 'Node 51', exact: true })
    await input.focus()
    await expect(input).toBeFocused()

    await window.evaluate(() => {
      const paints: number[] = []
      ;(window as unknown as { vimEditingPaints: number[] }).vimEditingPaints = paints
      document.addEventListener(
        'keydown',
        (event) => {
          if (!['l', 'h', 'j', 'k', 'i', 'Escape'].includes(event.key)) return
          requestAnimationFrame(() => requestAnimationFrame(() => paints.push(performance.now() - event.timeStamp)))
        },
        { capture: true },
      )
    })

    for (let index = 0; index < 20; index += 1) {
      for (const key of ['l', 'h', 'j', 'k', 'i', 'Escape']) await window.keyboard.press(key)
    }
    await window.waitForFunction(
      () => (window as unknown as { vimEditingPaints: number[] }).vimEditingPaints.length === 120,
    )
    const paints = await window.evaluate(() =>
      (window as unknown as { vimEditingPaints: number[] }).vimEditingPaints.slice().sort((a, b) => a - b),
    )
    const paintP95Ms = paints[Math.floor(paints.length * 0.95)]!
    const paintMaxMs = paints[paints.length - 1]!

    await expect(input).toBeFocused()
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    recordPerfResult({
      kind: 'state',
      scenario: 'vim-ordinary-100',
      samples: paints.length,
      metrics: { paintP95Ms: round(paintP95Ms), paintMaxMs: round(paintMaxMs) },
    })
    expect(paintP95Ms).toBeLessThan(100)
    expect(paintMaxMs).toBeLessThan(250)
  })

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
