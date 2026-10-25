// @editing-modes: both
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  test,
  expect,
  launchTree,
  seedDocument,
  node,
  typeInto,
  closeApp,
  describeForEachEditingMode,
  setMainWindowBounds,
} from './fixtures'

describeForEachEditingMode('Recent nodes', (mode) => {
  // @requirement PRODUCT.md §20.14
  test('searches all nodes as typed, completes existing tags and opens results from Agenda', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'Project', children: [{ id: 'child', text: 'Alpha #work #w', children: [] }] },
          { id: 'b', text: 'alpha #Work', children: [] },
          { id: 'c', text: 'Other #worker', children: [] },
        ],
      },
      location: { currentParentId: 'a', selectedNodeId: 'child' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    const input = window.getByRole('searchbox', { name: 'Search query' })
    const results = window.getByRole('listbox', { name: 'Search results' })
    await expect(input).toBeFocused()
    await expect(input).toHaveValue('')
    await input.fill('al')
    await expect(window.getByText('Enter at least 3 characters')).toBeVisible()
    await input.fill('alpha')
    await expect(results.getByRole('option')).toHaveCount(2)
    await expect(results.locator('.recent-node-text')).toHaveText(['Alpha #work #w', 'alpha #Work'])
    await window.screenshot({ path: `test-results/search-${mode.mode}-light.png` })
    await input.fill('Alpha')
    await expect(results.getByRole('option')).toHaveCount(1)
    await input.fill('#')
    const tags = window.getByRole('listbox', { name: 'Tags' })
    await expect(tags.getByRole('option')).toHaveText(['#Work', '#w', '#work', '#worker'])
    await input.fill('#wrk')
    await window.keyboard.press('Tab')
    await expect(input).toHaveValue('#work')
    await expect(tags).toHaveCount(0)
    await expect(results.locator('.recent-node-text')).toHaveText(['Alpha #work #w'])
    await input.fill('#w')
    await window.keyboard.press('Escape')
    await expect(input).toHaveValue('#w')
    await expect(results.getByRole('option')).toHaveCount(1)
    await input.fill('#new_tag')
    await expect(window.getByText('No results', { exact: true })).toBeVisible()
    await input.fill('#')
    await expect(tags.getByRole('option')).toHaveCount(4)
    await window.evaluate(() => globalThis.window.treeApi.setAppearance('dark'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await window.screenshot({ path: `test-results/search-${mode.mode}-dark-tags.png` })
    await window.keyboard.press('Escape')
    await window.keyboard.press('Escape')
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Meta+f')
    await expect(input).toHaveValue('')
    await input.fill('alpha')
    await expect(results.getByRole('option')).toHaveCount(2)
    await window.keyboard.press('ArrowDown')
    await window.keyboard.press('Enter')

    await expect(window.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
    await expect(window.locator('[data-node-id="b"] .node-input')).toBeFocused()
  })

  // @requirement PRODUCT.md §20.14
  test('promotes edits, cancels without navigation, visits a node and survives restart', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: '', children: [{ id: 'child', text: 'Nested', children: [] }] },
          { id: 'b', text: '', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const first = await launchTree(userDataDir)
    await typeInto(node(first.window, 1), 'Alpha edited')
    await typeInto(node(first.window, 2), 'Beta edited')
    await first.window.keyboard.press('Meta+;')

    const popup = first.window.getByRole('dialog', { name: 'Search' })
    await expect(popup.getByRole('option')).toHaveText(['Beta edited', 'Alpha edited'])
    await expect(popup.getByRole('img', { name: 'Top level' })).toHaveCount(2)
    const fontSize = await node(first.window, 2).evaluate((element) => getComputedStyle(element).fontSize)
    await expect(popup.locator('.recent-node-text').first()).toHaveCSS('font-size', fontSize)
    await first.window.keyboard.press('ArrowUp')
    await expect(popup.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
    await first.window.keyboard.press('Escape')

    await expect(popup).toHaveCount(0)
    await expect(node(first.window, 2)).toBeFocused()

    await first.window.keyboard.press('Meta+;')
    await first.window.keyboard.press('ArrowDown')
    await first.window.screenshot({ path: `.scratch/recent-nodes/${mode.mode}-popup.png` })
    await first.window.keyboard.press('Enter')

    await expect(node(first.window, 1)).toBeFocused()
    await closeApp(first.app)

    expect(JSON.parse(readFileSync(join(userDataDir, 'data', 'recent-nodes.json'), 'utf8'))).toEqual(['a', 'b'])
    const second = await launchTree(userDataDir, { appearance: 'dark' })
    await second.window.evaluate(() => window.treeApi.setAppearance('dark'))
    await second.window.emulateMedia({ colorScheme: 'dark' })
    await second.window.keyboard.press('Meta+;')

    await expect(second.window.getByRole('option')).toHaveText(['Alpha edited', 'Beta edited'])
    await second.window.screenshot({ path: `.scratch/recent-nodes/${mode.mode}-dark-popup.png` })
    await second.window.keyboard.press('Escape')
  })
})

test.describe('Recent-node buffered editing', () => {
  test.use({ editingMode: 'vim' })
  // @requirement PRODUCT.md §20.14
  test('preserves Replace on cancel and finishes it before a nested jump', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: [
          { id: 'a', text: 'Alpha', children: [{ id: 'child', text: 'Nested', children: [] }] },
          { id: 'b', text: 'Beta', children: [] },
        ],
      },
      location: { currentParentId: null, selectedNodeId: 'a' },
    })
    const { window } = await launchTree(userDataDir, { initialMode: 'normal' })
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Meta+.')
    await window.keyboard.press('Meta+,')
    await window.keyboard.press('Meta+,')
    await node(window, 2).click()
    await window.keyboard.press('0')
    await window.keyboard.press('R')
    await window.keyboard.type('X')
    await window.keyboard.press('Meta+;')
    await window.keyboard.press('Escape')

    await expect(window.getByLabel('Vim mode')).toHaveText('REPLACE')
    await window.keyboard.type('Y')
    await window.keyboard.press('Meta+;')
    await window.getByRole('option').filter({ hasText: 'Nested' }).click()

    await expect(window.locator('[data-node-id="child"] .node-input')).toBeFocused()
    await expect(window.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
    await expect(window.getByLabel('Vim mode')).toHaveText('NORMAL')
    await window.keyboard.press('Meta+,')
    await expect(node(window, 2)).toHaveValue('XYta')
  })
})

test.describe('Recent-node popup geometry (mode-independent)', () => {
  // @requirement PRODUCT.md §20.14
  test('keeps selection visible in every animation frame during repeated arrow scrolling', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}`, text: `Result node ${i}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    await window.getByRole('searchbox').fill('node')
    await expect(window.getByLabel('Result position')).toHaveText('1 / 100')

    for (const appearance of ['light', 'dark'] as const) {
      await window.evaluate((value) => globalThis.window.treeApi.setAppearance(value), appearance)
      await window.emulateMedia({ colorScheme: appearance })
      const session = await window.context().newCDPSession(window)
      const frames: string[] = []
      session.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
        frames.push(frame.data)
        void session.send('Page.screencastFrameAck', { sessionId: frame.sessionId })
      })
      await session.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 })
      await window.evaluate(() => {
        const state = { active: true, count: 0, failures: [] as string[] }
        Object.assign(window, { searchFrameProbe: state })
        const sample = (): void => {
          const list = document.querySelector('.node-search-results')!
          const rows = list.querySelectorAll('[aria-selected="true"]')
          const viewport = list.getBoundingClientRect()
          const row = rows[0]?.getBoundingClientRect()
          state.count++
          if (rows.length !== 1 || !row || row.top < viewport.top - 1 || row.bottom > viewport.bottom + 1) {
            state.failures.push(`frame ${state.count}: selected=${rows.length}, top=${row?.top}, bottom=${row?.bottom}`)
          }
          if (state.active) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
      })

      for (const direction of ['ArrowDown', 'ArrowUp']) {
        for (let step = 0; step < 65; step++) {
          await window.keyboard.down(direction)
          await window.waitForTimeout(30)
        }
        await window.keyboard.up(direction)
      }
      const probe = await window.evaluate(() => {
        const state = (
          window as unknown as { searchFrameProbe: { active: boolean; count: number; failures: string[] } }
        ).searchFrameProbe
        state.active = false
        return state
      })
      await session.send('Page.stopScreencast')
      await session.detach()
      frames.forEach((data, index) => {
        writeFileSync(test.info().outputPath(`arrows-${appearance}-${index}.png`), Buffer.from(data, 'base64'))
      })

      expect(probe.count).toBeGreaterThan(100)
      expect(probe.failures).toEqual([])
      expect(frames.length).toBeGreaterThan(20)
      await expect(window.getByLabel('Result position')).toHaveText('1 / 100')
    }
  })

  // @requirement PRODUCT.md §20.14
  test('separates the heading from partially scrolled results and fades only overflow edges', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, text: `Result node ${i}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    const input = window.getByRole('searchbox')
    await input.fill('node')
    const list = window.getByRole('listbox', { name: 'Search results' })
    await expect(list.getByRole('option').first()).toBeVisible()
    await expect(list).toHaveAttribute('data-scroll-after', '')
    await expect(list).not.toHaveAttribute('data-scroll-before')

    await list.evaluate((element) => {
      element.scrollTop = 17
    })

    await expect(list).toHaveAttribute('data-scroll-before', '')
    await expect(list).toHaveAttribute('data-scroll-after', '')
    await expect(list).not.toHaveCSS('mask-image', 'none')
    const heading = window.locator('.node-search-results-heading')
    const headingBox = (await heading.boundingBox())!
    const listBox = (await list.boundingBox())!
    expect(listBox.y - headingBox.y - headingBox.height).toBeGreaterThanOrEqual(6)
    await window.screenshot({ path: 'test-results/search-edge-fade-light.png' })
    await window.evaluate(() => globalThis.window.treeApi.setAppearance('dark'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await window.screenshot({ path: 'test-results/search-edge-fade-dark.png' })
    for (let step = 0; step < 12; step++) await window.keyboard.press('ArrowDown')
    const selectedGeometry = await list.evaluate((element) => {
      const viewport = element.getBoundingClientRect()
      const row = element.querySelector('[aria-selected="true"]')!.getBoundingClientRect()
      return { top: row.top - viewport.top, bottom: viewport.bottom - row.bottom }
    })
    expect(selectedGeometry.top).toBeGreaterThanOrEqual(12)
    expect(selectedGeometry.bottom).toBeGreaterThanOrEqual(12)
    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight
    })
    await expect(list).not.toHaveAttribute('data-scroll-after')
    await expect(list).toHaveAttribute('data-scroll-before', '')

    await input.fill('node 29')
    await expect(list.getByRole('option')).toHaveCount(1)
    await expect(list).toHaveCSS('mask-image', 'none')
  })

  // @requirement PRODUCT.md §20.14
  test('scrolls arrow navigation by only the space needed to reveal the next result', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, text: `Result node ${i}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    await window.getByRole('searchbox').fill('node')
    const list = window.getByRole('listbox', { name: 'Search results' })
    await expect(list.getByRole('option').first()).toContainText('Result node 0')
    const typography = () =>
      list.locator('[aria-selected="true"] .recent-node-text').evaluate((element) => {
        const style = getComputedStyle(element)
        return { font: style.font, spacing: style.letterSpacing, height: element.getBoundingClientRect().height }
      })
    const initialTypography = await typography()
    const position = window.getByLabel('Result position')
    await expect(position).toHaveText('1 / 80')
    let previous = 0

    for (let i = 1; i <= 20; i++) {
      await window.keyboard.press('ArrowDown')
      await expect(list.locator('[aria-selected="true"]')).toContainText(`Result node ${i}`)
      await expect(position).toHaveText(`${i + 1} / 80`)
      const current = await list.evaluate((element) => element.scrollTop)
      expect.soft(current - previous, `ArrowDown to ${i}`).toBeLessThanOrEqual(52)
      expect.soft(await typography()).toEqual(initialTypography)
      previous = current
    }
    await window.screenshot({ path: 'test-results/search-arrow-scroll.png' })
    for (let i = 19; i >= 0; i--) {
      await window.keyboard.press('ArrowUp')
      await expect(list.locator('[aria-selected="true"]')).toContainText(`Result node ${i}`)
      const current = await list.evaluate((element) => element.scrollTop)
      expect.soft(previous - current, `ArrowUp to ${i}`).toBeLessThanOrEqual(52)
      previous = current
    }
    await window.keyboard.press('ArrowUp')
    await expect(position).toHaveText('80 / 80')
    await window.keyboard.press('ArrowDown')
    await expect(position).toHaveText('1 / 80')
  })

  // @requirement PRODUCT.md §20.14
  test('keeps the popup and input stationary while refining queries and avoids contradictory tag feedback', async ({
    userDataDir,
  }) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, text: `Alpha ${i} #p${i}`, children: [] })),
      },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { window } = await launchTree(userDataDir)
    await window.keyboard.press('Meta+f')
    const popup = window.getByRole('dialog', { name: 'Search' })
    const input = popup.getByRole('searchbox')
    const initialPopup = (await popup.boundingBox())!
    const initialInput = await input.boundingBox()

    for (const query of ['al', 'Alpha', 'Alpha 11', 'missing', '#p', '#p1', '']) {
      await input.fill(query)
      await expect(popup.getByText('Searching…', { exact: true })).toHaveCount(0)
      const box = (await popup.boundingBox())!
      expect
        .soft({ x: box.x, y: box.y, width: box.width }, query)
        .toEqual({ x: initialPopup.x, y: initialPopup.y, width: initialPopup.width })
      expect.soft(await input.boundingBox(), query).toEqual(initialInput)
      if (query === '#p') {
        await expect(popup.getByLabel('Result position')).toHaveCount(0)
        await expect(popup.getByRole('listbox', { name: 'Tags' })).toBeVisible()
        await expect.soft(popup.getByText('No results', { exact: true })).toHaveCount(0)
        await window.screenshot({ path: 'test-results/search-stable-tags-light.png' })
      }
      if (query === '#p1') {
        await expect(popup.getByText('Tags', { exact: true })).toBeVisible()
        await expect(popup.getByText('Results', { exact: true })).toBeVisible()
        await expect(popup.locator('[aria-selected="true"]')).toHaveCount(1)
        await expect(popup.getByText('↑ ↓ select · Enter/Tab apply · Esc dismiss')).toBeVisible()
        await window.keyboard.press('Tab')
        await expect(popup.getByRole('listbox', { name: 'Tags' })).toHaveCount(0)
        await expect(popup.getByText('↑ ↓ select · Enter open · Esc close')).toBeVisible()
        await expect(input).toHaveValue('#p1')
        await expect(popup.getByLabel('Result position')).toHaveText('1 / 1')
      }
    }
    await input.fill('Alpha')
    await expect(popup.getByRole('option')).toHaveCount(12)
    const manyHeight = (await popup.boundingBox())!.height
    await input.fill('Alpha 11')
    await expect(popup.getByRole('option')).toHaveCount(1)
    expect((await popup.boundingBox())!.height).toBeLessThan(manyHeight)
    await window.evaluate(() => globalThis.window.treeApi.setAppearance('dark'))
    await window.emulateMedia({ colorScheme: 'dark' })
    await window.screenshot({ path: 'test-results/search-stable-results-dark.png' })
  })

  // @requirement PRODUCT.md §20.14
  test('reveals the last result in a short window and restores focus on an outside click', async ({ userDataDir }) => {
    seedDocument(userDataDir, {
      document: { roots: Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, text: `Node ${i}`, children: [] })) },
      location: { currentParentId: null, selectedNodeId: 'n0' },
    })
    const { app, window } = await launchTree(userDataDir)
    await window.evaluate(() =>
      (
        globalThis as typeof globalThis & { treeApi: { setRecentNodes(ids: string[]): Promise<void> } }
      ).treeApi.setRecentNodes(Array.from({ length: 8 }, (_, i) => `n${i}`)),
    )
    await window.reload()
    await expect(node(window, 1)).toBeVisible()
    await window.keyboard.press('Meta+;')
    const popup = window.getByRole('dialog', { name: 'Search' })
    const centerOffset = () =>
      popup.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return Math.max(
          Math.abs(box.left + box.width / 2 - innerWidth / 2),
          Math.abs(box.top - Math.min(innerHeight * 0.2, 160)),
        )
      })
    await expect.poll(centerOffset).toBeLessThanOrEqual(1)
    await window.screenshot({ path: 'test-results/recent-nodes-centered.png' })
    await window.keyboard.press('Escape')
    await setMainWindowBounds(app, { width: 700, height: 400 })
    await node(window, 1).focus()
    await window.keyboard.press('Meta+;')
    await window.locator('.recent-nodes-title').click()
    await expect(window.getByRole('dialog', { name: 'Search' })).toBeVisible()
    await expect.poll(centerOffset).toBeLessThanOrEqual(1)
    await window.keyboard.press('ArrowUp')

    const geometry = await window
      .getByRole('option')
      .last()
      .evaluate((element) => {
        const row = element.getBoundingClientRect()
        const popup = element.closest('.recent-nodes-popup')!.getBoundingClientRect()
        return { rowBottom: row.bottom, popupBottom: popup.bottom, rowTop: row.top, popupTop: popup.top }
      })
    expect(geometry.rowBottom).toBeLessThanOrEqual(geometry.popupBottom)
    expect(geometry.rowTop).toBeGreaterThanOrEqual(geometry.popupTop)

    await window.mouse.click(10, 70)

    await expect(window.getByRole('dialog', { name: 'Search' })).toHaveCount(0)
    await expect(node(window, 1)).toBeFocused()
  })
})
