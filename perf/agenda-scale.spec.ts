import { expect, launchTree, round, seedDocument, test, type Seed } from './fixtures'
import { recordPerfResult } from './results'

interface Node {
  id: string
  text: string
  children: Node[]
}

/** Exactly 100,000 nodes; sparse dates retain undated ancestors in the projection. */
function scaleSeed(shape: 'wide' | 'deep' | 'mixed', dense: boolean): Seed {
  const today = new Date()
  const later = new Date(today)
  later.setDate(today.getDate() + 6)
  const canonical = (date: Date): string =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  let count = 0
  const node = (): Node => {
    const index = count++
    const dated = dense || index % 20 === 19
    return {
      id: `scale-${index}`,
      text: dated ? `${canonical(today)} Item ${index} ${canonical(later)} ` : `Context ${index}`,
      children: [],
    }
  }
  const roots: Node[] = []
  while (count < 100_000) {
    const root = node()
    roots.push(root)
    if (shape === 'wide') continue
    let parent = root
    for (let level = 2; level <= 20 && count < 100_000; level += 1) {
      const child = node()
      parent.children.push(child)
      parent = child
    }
    if (shape === 'mixed') {
      // Wide branches and maximum-depth chains coexist under the same roots.
      for (let sibling = 0; sibling < 80 && count < 100_000; sibling += 1) root.children.push(node())
    }
  }
  return { document: { roots }, location: { currentParentId: null, selectedNodeId: roots[0]!.id } }
}

for (const shape of ['wide', 'deep', 'mixed'] as const) {
  for (const dense of [false, true]) {
    const scenario = `agenda-${shape}-100000-${dense ? 'dense' : 'sparse'}`
    // @requirement PRODUCT.md §22.1
    // @requirement PRODUCT.md §23.13
    test(`${scenario}: open, navigate, edit dates, move and undo`, async ({ userDataDir }, testInfo) => {
      seedDocument(userDataDir, scaleSeed(shape, dense))
      const { app, window } = await launchTree(userDataDir, { initialMode: 'normal' })
      const profiler = process.env.AGENDA_CPU_PROFILE === '1' ? await window.context().newCDPSession(window) : undefined
      if (profiler !== undefined) {
        await profiler.send('Profiler.enable')
        await profiler.send('Profiler.start')
      }
      await app.evaluate(() => {
        const control = globalThis as typeof globalThis & { scaleSaves: number }
        control.scaleSaves = 0
        globalThis.__treeIpc.wrap('tree:save', async (original, ...args) => {
          const result = await original(...args)
          control.scaleSaves += 1
          return result
        })
      })
      await window.evaluate(() => {
        const samples: Record<string, number[]> = {}
        ;(window as unknown as { scaleSamples: typeof samples }).scaleSamples = samples
        document.addEventListener(
          'keydown',
          (event) => {
            const key = event.metaKey && event.key === 'p' ? 'open' : event.key
            if (!['open', 'j', 'k', 'a', '5', 'p', 'u'].includes(key)) return
            requestAnimationFrame(() =>
              requestAnimationFrame(() => (samples[key] ??= []).push(performance.now() - event.timeStamp)),
            )
          },
          { capture: true },
        )
      })
      await window.keyboard.press('Meta+p')
      await expect(window.getByRole('grid', { name: 'Agenda timeline' })).toBeVisible()
      if (profiler !== undefined) {
        const { profile } = await profiler.send('Profiler.stop')
        const counts = new Map<string, number>()
        const nodes = new Map(
          profile.nodes.map((node) => [
            node.id,
            node.callFrame.functionName || `anonymous:${node.callFrame.lineNumber}:${node.callFrame.columnNumber}`,
          ]),
        )
        for (const id of profile.samples ?? []) {
          const name = nodes.get(id) ?? ''
          counts.set(name, (counts.get(name) ?? 0) + 1)
        }
        console.log('AGENDA_OPEN_CPU', JSON.stringify([...counts].toSorted((a, b) => b[1] - a[1]).slice(0, 25)))
        await profiler.send('Profiler.start')
      }
      const scrollMs = await window.evaluate(async () => {
        const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
        const start = performance.now()
        viewport.scrollTop = viewport.scrollHeight / 2
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        const elapsed = performance.now() - start
        viewport.scrollTop = 0
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
        return elapsed
      })
      for (let index = 0; index < 20; index += 1) await window.keyboard.press('j')
      for (let index = 0; index < 20; index += 1) await window.keyboard.press('k')
      const navigationSaves = await app.evaluate(
        () => (globalThis as typeof globalThis & { scaleSaves: number }).scaleSaves,
      )
      expect(navigationSaves).toBe(0)
      // The first dated node is visible even with nineteen contextual ancestors.
      const targetId = dense ? 'scale-0' : 'scale-19'
      await window.locator(`.agenda-row[data-node-id="${targetId}"]`).first().click()
      const input = window.getByRole('textbox', { name: `Agenda node ${targetId}`, exact: true })
      await expect(input).toBeFocused()
      await window.keyboard.press('A')
      for (let index = 0; index < 30; index += 1) await window.keyboard.press('a')
      await expect(input).toContainText('a'.repeat(30))
      for (let index = 0; index < 15; index += 1) {
        await window.keyboard.type(' 2099-01-05')
        for (let character = 0; character < 11; character += 1) await window.keyboard.press('Backspace')
      }
      await expect(input).toBeFocused()
      await window.keyboard.press('Escape')
      await window.keyboard.type('100dd')
      await expect(window.locator('.agenda-row-pending').first()).toBeVisible()
      await window.keyboard.press('G')
      await window.keyboard.press('p')
      await expect(window.locator('.agenda-row-pending')).toHaveCount(0)
      await window.keyboard.press('Escape')
      await window.keyboard.press('u')
      await window.waitForFunction(
        () => (window as unknown as { scaleSamples: Record<string, number[]> }).scaleSamples.u?.length === 1,
      )
      const samples = await window.evaluate(
        () => (window as unknown as { scaleSamples: Record<string, number[]> }).scaleSamples,
      )
      if (profiler !== undefined) {
        const { profile } = await profiler.send('Profiler.stop')
        await testInfo.attach('agenda-cpu-profile', {
          body: JSON.stringify(profile),
          contentType: 'application/json',
        })
        const counts = new Map<number, number>()
        for (const id of profile.samples ?? []) counts.set(id, (counts.get(id) ?? 0) + 1)
        console.log(
          'AGENDA_CPU',
          JSON.stringify(
            profile.nodes
              .map((node) => ({ name: node.callFrame.functionName, samples: counts.get(node.id) ?? 0 }))
              .filter((node) => !['(idle)', '(program)', '(root)'].includes(node.name))
              .toSorted((a, b) => b.samples - a.samples)
              .slice(0, 25),
          ),
        )
        await profiler.detach()
      }
      const motion = [...samples.j!, ...samples.k!].toSorted((a, b) => a - b)
      const typing = samples.a!.toSorted((a, b) => a - b)
      const dates = samples['5']!.toSorted((a, b) => a - b)
      expect(motion).toHaveLength(40)
      expect(typing).toHaveLength(30)
      expect(dates).toHaveLength(15)
      const metrics = {
        openPaintMs: round(samples.open![0]!),
        scrollPaintMs: round(scrollMs),
        motionP95Ms: round(motion[38]!),
        motionMaxMs: round(motion[39]!),
        typingP95Ms: round(typing[28]!),
        typingMaxMs: round(typing[29]!),
        dateEditP95Ms: round(dates[13]!),
        moveMs: round(samples.p![0]!),
        undoMs: round(samples.u![0]!),
        navigationSaves,
      }
      recordPerfResult({ kind: 'state', scenario, samples: 85, metrics })
      // Opening materializes every projected row (about 200,000 in these shapes, far fewer in the sparse wide
      // and mixed ones), so it keeps its own ceiling; the Product Owner accepted this extreme case.
      expect.soft(metrics.openPaintMs).toBeLessThan(dense || shape === 'deep' ? 150 : 100)
      expect.soft(metrics.scrollPaintMs).toBeLessThan(100)
      expect.soft(metrics.motionP95Ms).toBeLessThan(50)
      expect.soft(metrics.motionMaxMs).toBeLessThan(100)
      expect.soft(metrics.typingP95Ms).toBeLessThan(50)
      expect.soft(metrics.typingMaxMs).toBeLessThan(100)
      expect.soft(metrics.dateEditP95Ms).toBeLessThan(50)
      expect.soft(metrics.moveMs).toBeLessThan(500)
      expect.soft(metrics.undoMs).toBeLessThan(100)
      expect(await window.locator('.agenda-row').count()).toBeLessThan(100)
    })
  }
}
