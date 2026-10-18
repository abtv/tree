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
      const samples: { visible: number; coverage: number; focused: boolean; caret: boolean; mounted: number }[] = []
      for (const fraction of [0.5, 0.8, 0.15, 0.6]) {
        await new Promise<void>((resolve) => {
          document.addEventListener(
            'scroll',
            (event) => {
              if (event.target !== viewport) return
              const bounds = viewport.getBoundingClientRect()
              const rows = [...document.querySelectorAll<HTMLElement>('.agenda-row')]
              const visible = rows
                .map((row) => row.getBoundingClientRect())
                .filter((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom)
              const selection = getSelection()
              samples.push({
                visible: visible.length,
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
        })
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      return { samples, height: viewport.clientHeight }
    })
    for (const sample of samples.samples) {
      expect(sample.visible).toBeGreaterThan(5)
      expect(sample.coverage).toBeGreaterThan(samples.height - 60)
      expect(sample.focused).toBe(true)
      expect(sample.caret).toBe(true)
      expect(sample.mounted).toBeLessThan(100)
    }
    await window.screenshot({ path: testInfo.outputPath('agenda-after-scroll.png') })
  })
})
