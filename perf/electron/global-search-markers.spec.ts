import { expect, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §20.14.4
test('keeps a 10000-name global marker list bounded and reachable', async ({ userDataDir }) => {
  const count = 10_000
  const tag = (index: number) => `#project_${String(index).padStart(4, '0')}`
  seedDocument(userDataDir, {
    document: {
      roots: [
        {
          id: 'root',
          text: 'Root',
          children: Array.from({ length: count }, (_, index) => ({
            id: `n${index}`,
            text: `Review ${tag(index)}`,
            children: [],
          })),
        },
      ],
    },
    location: { currentParentId: 'root', selectedNodeId: 'n0' },
  })
  const { window } = await launchTree(userDataDir, { vimEnabled: false })
  const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
  await expect(editor).toBeFocused()
  await window.keyboard.press('Meta+;')
  const input = window.getByRole('searchbox')
  const list = window.getByRole('listbox', { name: 'Tags' })
  const selected = list.getByRole('option', { selected: true })
  await expect(input).toBeFocused()

  const start = performance.now()
  await window.keyboard.type('#')
  await expect(selected).toHaveText(tag(0))
  const openMs = round(performance.now() - start)
  const mountedAtOpen = await list.getByRole('option').count()
  await input.press('ArrowUp')
  await expect(selected).toHaveText(tag(count - 1))
  await expect(selected).toHaveAttribute('aria-setsize', String(count))
  await expect(selected).toHaveAttribute('aria-posinset', String(count))
  await expect(selected).toBeInViewport()
  const mountedAtEnd = await list.getByRole('option').count()
  await input.press('ArrowDown')
  await expect(selected).toHaveText(tag(0))
  await input.fill('#project_999')
  await expect(selected).toHaveText(tag(9990))
  await input.press('ArrowUp')
  await expect(selected).toHaveText(tag(9999))
  await input.press('Enter')

  await expect(input).toHaveValue(tag(9999))
  await expect(input).toBeFocused()
  await expect(window.getByRole('listbox', { name: 'Search results' })).toHaveAttribute('aria-busy', 'false')
  await input.press('Escape')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText(`Review ${tag(0)}`)
  await expect(window.getByRole('textbox', { name: 'Current parent', exact: true })).toHaveValue('Root')
  recordPerfResult({
    kind: 'search',
    scenario: 'global-marker-10000',
    metrics: { openMs, mountedAtOpen, mountedAtEnd },
  })
  expect(Math.max(mountedAtOpen, mountedAtEnd)).toBeLessThanOrEqual(16)
})

// @requirement PRODUCT.md §22.1
test('keeps input responsive when a paste contains many distinct marker fragments', async ({ userDataDir }) => {
  const count = 10_000
  const tag = (index: number) => `#project_${String(index).padStart(4, '0')}`
  seedDocument(userDataDir, {
    document: {
      roots: Array.from({ length: count }, (_, index) => ({
        id: `n${index}`,
        text: `Review ${tag(index)}`,
        children: [],
      })),
    },
    location: { currentParentId: null, selectedNodeId: 'n0' },
  })
  const { window } = await launchTree(userDataDir, { vimEnabled: false })
  const editor = window.getByRole('textbox', { name: 'Node 1', exact: true })
  await expect(editor).toBeFocused()
  await window.keyboard.press('Meta+;')
  const input = window.getByRole('searchbox')
  await expect(input).toBeFocused()

  const timings = await window.evaluateHandle(() => {
    const samples: number[] = []
    // The document bubble listener runs after the search input handler on the React root.
    document.addEventListener('input', (event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement) || target.type !== 'search' || target.value.length < 100) return
      samples.push(performance.now() - event.timeStamp)
    })
    return samples
  })
  const pasted = Array.from({ length: 200 }, (_, index) => `#missing${index}`).join(' ')
  const result = window.getByRole('listbox', { name: 'Search results' })

  try {
    for (let index = 0; index < 5; index++) {
      await input.fill(pasted)
      await input.fill(tag(index))
      await expect(result).toHaveAttribute('aria-busy', 'false')
      await expect(result.getByRole('option', { selected: true })).toHaveText(`Review ${tag(index)}`)
    }
    const samples = await timings.jsonValue()
    expect(samples).toHaveLength(5)
    const maxInputMs = round(Math.max(...samples))
    recordPerfResult({
      kind: 'search',
      scenario: 'marker-paste-200-10000',
      samples: samples.length,
      metrics: { maxInputMs },
    })
    expect(maxInputMs).toBeLessThan(35)
  } finally {
    await timings.dispose()
  }
  await input.press('Escape')
  await expect(editor).toBeFocused()
  await expect(editor).toHaveText(`Review ${tag(0)}`)
})
