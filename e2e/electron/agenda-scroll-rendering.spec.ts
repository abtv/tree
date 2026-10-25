// @editing-modes: both
import { describeForEachEditingMode, expect, launchTree, seedDocument, setAgendaToday, test } from './fixtures'

describeForEachEditingMode('Agenda scroll rendering', ({ mode }) => {
  // @requirement PRODUCT.md §23.6
  test('populates the viewport before a scroll event finishes without moving the pinned caret', async ({
    userDataDir,
  }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 1200 }, (_, index) => ({
          id: `dated-${index}`,
          text: `2026-10-08 Item ${index} Synthetic scroll rendering details`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'dated-0' },
    })
    const { window } = await launchTree(userDataDir)

    await setAgendaToday(window)
    await window.keyboard.press('Meta+p')
    await window.keyboard.press('Escape')
    await window.keyboard.press(mode === 'vim' ? 'j' : 'ArrowDown')

    await expect(window.locator('.agenda-row[aria-selected="true"]')).toHaveAttribute('data-node-id', 'dated-0')

    await window.keyboard.press('ArrowRight')

    const samples = await window.evaluate(async () => {
      const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
      const selected = document.querySelector<HTMLElement>('.agenda-row[aria-selected="true"]')!
      const active = document.activeElement
      const selection = getSelection()
      const anchorNode = selection?.anchorNode
      const anchorOffset = selection?.anchorOffset
      const focusNode = selection?.focusNode
      const focusOffset = selection?.focusOffset
      const samples: {
        visible: number
        coverage: number
        expectedCoverage: number
        focused: boolean
        caret: boolean
        mounted: number
      }[] = []
      const pendingVisible: number[] = []
      for (const fraction of [0.5, 0.8, 0.15, 0.6, 1, 0]) {
        await new Promise<void>((resolve) => {
          document.addEventListener(
            'scroll',
            (event) => {
              if (event.target !== viewport) return
              const bounds = viewport.getBoundingClientRect()
              const listBounds = document.querySelector('.agenda-list')!.getBoundingClientRect()
              const rows = [...document.querySelectorAll<HTMLElement>('.agenda-row')]
              const visible = rows
                .map((row) => row.getBoundingClientRect())
                .filter((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom)
              const selection = getSelection()
              samples.push({
                visible: visible.length,
                expectedCoverage: Math.min(bounds.bottom, listBounds.bottom) - Math.max(bounds.top, listBounds.top),
                coverage:
                  visible.length === 0
                    ? 0
                    : Math.min(bounds.bottom, Math.max(...visible.map((rect) => rect.bottom))) -
                      Math.max(bounds.top, Math.min(...visible.map((rect) => rect.top))),
                focused: document.activeElement === active && selected.isConnected,
                caret:
                  selection?.anchorNode === anchorNode &&
                  selection?.anchorOffset === anchorOffset &&
                  selection?.focusNode === focusNode &&
                  selection?.focusOffset === focusOffset,
                mounted: rows.length,
              })
              resolve()
            },
            { capture: true, once: true },
          )
          viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * fraction
          // The compositor may present this scroll offset before delivering the scroll event.
          // Keep the last painted window present until its replacement can commit.
          const bounds = viewport.getBoundingClientRect()
          pendingVisible.push(
            [...document.querySelectorAll<HTMLElement>('.agenda-row')].filter((row) => {
              const rect = row.getBoundingClientRect()
              return rect.bottom > bounds.top && rect.top < bounds.bottom
            }).length,
          )
        })
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      return { samples, pendingVisible }
    })

    for (const visible of samples.pendingVisible) expect(visible).toBeGreaterThan(5)
    for (const sample of samples.samples) {
      expect(sample.visible).toBeGreaterThan(5)
      expect(sample.coverage).toBeGreaterThanOrEqual(sample.expectedCoverage - 1)
      expect(sample.focused).toBe(true)
      expect(sample.caret).toBe(true)
      expect(sample.mounted).toBeLessThan(100)
    }

    await window.screenshot({ path: testInfo.outputPath('agenda-after-scroll.png') })
  })
})
