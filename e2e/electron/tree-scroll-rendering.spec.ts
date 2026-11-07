// @editing-modes: both
import { describeForEachEditingMode, expect, launchTree, seedDocument, setCursor, test } from './fixtures'

describeForEachEditingMode('Tree scroll rendering', () => {
  // @requirement PRODUCT.md §20.1
  test('keeps painted rows before delivery and fills each committed viewport without losing the pinned input', async ({
    userDataDir,
  }, testInfo) => {
    seedDocument(userDataDir, {
      document: {
        roots: Array.from({ length: 9000 }, (_, index) => ({
          id: `row-${index}`,
          text: `Synthetic item ${index} with readable scroll content`,
          children: [],
        })),
      },
      location: { currentParentId: null, selectedNodeId: 'row-0' },
    })
    const { window } = await launchTree(userDataDir)

    const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
    await editor.focus()
    await setCursor(editor, 3)

    const samples = await window.evaluate(async () => {
      const viewport = document.querySelector<HTMLElement>('.scroll-viewport')!
      const active = document.activeElement
      const input = active as HTMLTextAreaElement
      const caret = [input.selectionStart, input.selectionEnd]
      const selected = document.querySelector('.node-row:has(.node-focus-marker)')!
      const samples: {
        visible: number
        coverage: number
        expected: number
        focused: boolean
        caret: boolean
        mounted: number
      }[] = []
      const pendingVisible: number[] = []
      const visibleRows = () => {
        const bounds = viewport.getBoundingClientRect()
        return [...document.querySelectorAll<HTMLElement>('.node-row')]
          .map((row) => row.getBoundingClientRect())
          .filter((rect) => rect.bottom > bounds.top && rect.top < bounds.bottom)
      }

      for (const fraction of [0.5, 0.9, 0.15, 0.6, 1, 0]) {
        await new Promise<void>((resolve) => {
          document.addEventListener(
            'scroll',
            (event) => {
              if (event.target !== viewport) return
              const bounds = viewport.getBoundingClientRect()
              const list = document.querySelector('.node-list')!.getBoundingClientRect()
              const visible = visibleRows()
              samples.push({
                visible: visible.length,
                coverage:
                  visible.length === 0
                    ? 0
                    : Math.min(bounds.bottom, Math.max(...visible.map((rect) => rect.bottom))) -
                      Math.max(bounds.top, Math.min(...visible.map((rect) => rect.top))),
                expected: Math.min(bounds.bottom, list.bottom) - Math.max(bounds.top, list.top),
                focused: document.activeElement === active && selected.isConnected,
                caret: input.selectionStart === caret[0] && input.selectionEnd === caret[1],
                mounted: document.querySelectorAll('.node-row').length,
              })
              resolve()
            },
            { capture: true, once: true },
          )
          viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * fraction
          pendingVisible.push(visibleRows().length)
        })
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      }
      return { samples, pendingVisible }
    })

    expect(samples.samples).toHaveLength(6)
    for (const visible of samples.pendingVisible) expect(visible).toBeGreaterThan(5)
    for (const sample of samples.samples) {
      expect(sample.visible).toBeGreaterThan(5)
      expect(sample.coverage).toBeGreaterThanOrEqual(sample.expected - 1)
      expect(sample.focused).toBe(true)
      expect(sample.caret).toBe(true)
      expect(sample.mounted).toBeLessThan(100)
    }

    await window.screenshot({ path: testInfo.outputPath('tree-after-scroll.png') })
  })
})
