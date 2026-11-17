// @editing-modes: both
import {
  describeForEachEditingMode,
  expect,
  launchTree,
  seedDocument,
  setAgendaToday,
  setCursor,
  setMainWindowContentSize,
  test,
} from './fixtures'

describeForEachEditingMode('Measured scroll continuity', ({ mode }) => {
  for (const view of ['Tree', 'Agenda'] as const) {
    // @requirement PRODUCT.md §20.1
    // @requirement PRODUCT.md §23.6
    test(`${view} keeps the visible row when width remeasurement clamps the old scroll position`, async ({
      userDataDir,
    }, info) => {
      seedDocument(userDataDir, {
        document: {
          roots: Array.from({ length: 400 }, (_, index) => ({
            id: `row-${index}`,
            text: `${view === 'Agenda' ? '2026-10-08 ' : ''}Row ${index} ${index === 0 ? 'Long wrapping content. '.repeat(200) : 'Short content'}`,
            children: [],
          })),
        },
        location: { currentParentId: null, selectedNodeId: 'row-0' },
      })
      const { app, window } = await launchTree(userDataDir)
      await setMainWindowContentSize(app, { width: 700, height: 600 })
      if (view === 'Agenda') {
        await setAgendaToday(window)
        await window.keyboard.press('Meta+p')
        if (mode === 'vim') await window.keyboard.press('Escape')
        await window.keyboard.press(mode === 'vim' ? 'j' : 'ArrowDown')
      }
      const editor = window.locator('[data-node-id="row-0"] .node-input')
      await editor.focus()
      const viewport = window.locator('.scroll-viewport')
      const beforeWheel = await viewport.evaluate((element) => element.scrollTop)
      await window.mouse.move(420, 300)
      await window.mouse.wheel(0, 24)
      await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(beforeWheel)
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight - element.clientHeight - 100
      })
      // Agenda's fixed date installs Playwright's clock. Its animation callbacks do not
      // acknowledge native scroll delivery, so wait for a visible row before measuring it.
      const anchorHandle = await window.waitForFunction(() => {
        const viewport = document.querySelector('.scroll-viewport')!
        const bounds = viewport.getBoundingClientRect()
        const row = [...document.querySelectorAll<HTMLElement>('.node-row, .agenda-row')].find((row) => {
          const rect = row.getBoundingClientRect()
          return row.dataset.nodeId !== undefined && rect.top >= bounds.top && rect.bottom < bounds.bottom
        })
        return row === undefined
          ? undefined
          : { id: row.dataset.nodeId!, top: row.getBoundingClientRect().top, scrollTop: viewport.scrollTop }
      })
      const anchor = (await anchorHandle.jsonValue())!
      await anchorHandle.dispose()

      await setMainWindowContentSize(app, { width: 1100, height: 600 })

      await expect
        .poll(() => viewport.evaluate((element) => element.scrollHeight - element.clientHeight))
        .toBeLessThan(anchor.scrollTop)

      await expect
        .poll(() =>
          window.evaluate(({ id, top }) => {
            const row = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)
            return row === null ? null : Math.abs(row.getBoundingClientRect().top - top)
          }, anchor),
        )
        .toBeLessThan(1)
      await expect(editor).toBeFocused()
      expect(await window.locator('.node-row, .agenda-row').count()).toBeLessThan(100)
      await window.screenshot({ path: info.outputPath(`${view.toLowerCase()}-resized-${mode}.png`) })
    })

    // @requirement PRODUCT.md §20.1
    // @requirement PRODUCT.md §23.6
    test(`${view} keeps wrapped rows moving with first-visit wheel input`, async ({ userDataDir }, info) => {
      seedDocument(userDataDir, {
        document: {
          roots: Array.from({ length: 400 }, (_, index) => ({
            id: `row-${index}`,
            text: `${view === 'Agenda' ? '2026-10-08 ' : ''}Row ${index} ${'Readable wrapped content. '.repeat(1 + (index % 9))}`,
            children: [],
          })),
        },
        location: { currentParentId: null, selectedNodeId: 'row-0' },
      })
      const { app, window } = await launchTree(userDataDir)
      await setMainWindowContentSize(app, { width: 700, height: 600 })
      if (view === 'Agenda') {
        await setAgendaToday(window)
        await window.keyboard.press('Meta+p')
        if (mode === 'vim') await window.keyboard.press('Escape')
        await window.keyboard.press(mode === 'vim' ? 'j' : 'ArrowDown')
      }
      const editor = window.locator('[data-node-id="row-0"] .node-input')
      await editor.focus()
      await setCursor(editor, 3)
      await expect(editor).toBeFocused()
      const selection = () =>
        editor.evaluate((element) => {
          if (element instanceof HTMLTextAreaElement)
            return { anchor: element.selectionStart, focus: element.selectionEnd, text: element.value }
          const native = getSelection()!
          return { anchor: native.anchorOffset, focus: native.focusOffset, text: native.anchorNode?.textContent }
        })
      await window.mouse.move(420, 300)
      await window.locator('.scroll-viewport').evaluate((element) => {
        element.scrollTop = (element.scrollHeight - element.clientHeight) * 0.7
      })
      // Fixed-clock animation callbacks do not acknowledge native scroll delivery. The sticky
      // window can still show the old rows, so start measuring only after its range catches up.
      await window.waitForFunction(() => {
        const viewport = document.querySelector('.scroll-viewport')!
        const list = document.querySelector<HTMLElement>('[data-window-start]')!
        const start = Math.max(0, viewport.getBoundingClientRect().top - list.getBoundingClientRect().top)
        return Math.abs(Number(list.dataset.windowStart) - start) < 1
      })
      // Normal mode projects a one-character selection after the native selection event.
      const initialSelection = await selection()

      const movements: number[] = []
      for (const direction of [-1, 1, -1]) {
        for (let step = 0; step < 24; step++) {
          const before = await window.evaluate(() => {
            const bounds = document.querySelector('.scroll-viewport')!.getBoundingClientRect()
            return [...document.querySelectorAll<HTMLElement>('.node-row, .agenda-row')].flatMap((row) => {
              const rect = row.getBoundingClientRect()
              return row.dataset.nodeId !== undefined && rect.bottom > bounds.top && rect.top < bounds.bottom
                ? [{ id: row.dataset.nodeId, top: rect.top }]
                : []
            })
          })

          await window.mouse.wheel(0, direction * 24)
          // Wheel delivery can finish after two animation callbacks. Wait for this input's
          // first movement before measuring its settled displacement. This checks geometry,
          // not the physical presentation time of each frame.
          await window.waitForFunction(({ id, top }) => {
            const row = document.querySelector<HTMLElement>(`[data-node-id="${id}"]`)
            return row !== null && row.getBoundingClientRect().top !== top
          }, before[0]!)
          await window.evaluate(
            () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
          )

          const moved = await window.evaluate((before) => {
            const rows = [...document.querySelectorAll<HTMLElement>('.node-row, .agenda-row')]
            return before.flatMap(({ id, top }) => {
              const row = rows.find((row) => row.dataset.nodeId === id)
              return row === undefined ? [] : [row.getBoundingClientRect().top - top]
            })
          }, before)
          expect(moved.length, 'The scroll must retain overlapping rows').toBeGreaterThan(0)
          movements.push(...moved.map((delta) => delta * -direction))
        }
      }

      await window.screenshot({ path: info.outputPath(`${view.toLowerCase()}-continuity-${mode}.png`) })
      await info.attach('wheel-movements', {
        body: JSON.stringify(movements),
        contentType: 'application/json',
      })
      expect(Math.min(...movements), 'Every wheel input must move the visible content').toBeGreaterThan(23)
      expect(Math.max(...movements), 'Measurements must not add a visible jump to the wheel movement').toBeLessThan(25)
      await expect(editor).toBeFocused()
      expect(await selection()).toEqual(initialSelection)
      expect(await window.locator('.node-row, .agenda-row').count()).toBeLessThan(100)
    })
  }
})
