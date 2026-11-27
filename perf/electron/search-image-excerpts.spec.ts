import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { attachmentPath } from '../../e2e/electron/fixtures'
import { solidPng } from '../../e2e/electron/solid-png'
import { expect, launchTree, round, seedDocument, test } from './fixtures'
import { recordPerfResult } from '../results'

// @requirement PRODUCT.md §20.14.2
test('keeps image-heavy global search and result navigation responsive', async ({ userDataDir }) => {
  const count = 2000
  const context = 'The synthetic release plan has notes for a new Version and a second target label. '
  const attachment = {
    id: 'synthetic',
    mimeType: 'image/png' as const,
    width: 320,
    height: 180,
    searchText: context.repeat(6),
  }
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'start', text: 'Start', children: [] },
        ...Array.from({ length: count }, (_, index) => ({
          id: `r${index}`,
          text: index % 2 ? `Screenshot ${index}` : '',
          attachment,
          children: [],
        })),
      ],
    },
    location: { currentParentId: null, selectedNodeId: 'start' },
  })
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  writeFileSync(attachmentPath(userDataDir, attachment.id), solidPng(320, 180))
  const { window } = await launchTree(userDataDir, { vimEnabled: false })
  const origin = window.getByRole('textbox', { name: 'Node 1', exact: true })
  const input = window.getByRole('searchbox')
  const position = window.getByLabel('Result position')
  const results = window.getByRole('listbox', { name: 'Search results' })
  await expect(origin).toBeFocused()
  await window.keyboard.press('Meta+;')
  await expect(input).toBeFocused()

  const completes: number[] = []
  const navigation: number[] = []
  const inputs = ['release Version', 'target label']
  for (let pass = 0; pass < 9; pass++) {
    const start = performance.now()
    await input.fill(inputs[pass % inputs.length]!)
    await expect(position).toHaveText(`1 / ${count}`)
    await expect(results).toHaveAttribute('aria-busy', 'false')
    await window.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    )
    if (pass > 0) completes.push(performance.now() - start)

    const navigationStart = performance.now()
    for (let index = 0; index < 12; index++) {
      await input.press('ArrowDown')
      await expect(position).toHaveText(`${index + 2} / ${count}`)
    }
    if (pass > 0) navigation.push(performance.now() - navigationStart)
    expect(await results.getByRole('option').count()).toBeLessThanOrEqual(40)
  }
  await input.press('Escape')
  await expect(origin).toBeFocused()
  await expect(origin).toHaveText('Start')

  const median = (samples: readonly number[]): number => {
    const sorted = samples.toSorted((a, b) => a - b)
    const middle = sorted.length / 2
    return round((sorted[middle - 1]! + sorted[middle]!) / 2)
  }
  const completeMedianMs = median(completes)
  const navigationMedianMs = median(navigation)
  recordPerfResult({
    kind: 'node-search',
    scenario: 'image-excerpts-2000-results',
    samples: completes.length,
    metrics: { completeMedianMs, navigationMedianMs },
  })
  expect(completeMedianMs).toBeLessThan(300)
  expect(navigationMedianMs).toBeLessThan(400)
})

// @requirement PRODUCT.md §20.14.2
test('reuses decoded thumbnails after crossing a list of distinct large attachments', async ({ userDataDir }) => {
  const count = 144
  const width = 1200
  const height = 1000
  const attachments = Array.from({ length: count }, (_, index) => ({
    id: `search-image-${index}`,
    mimeType: 'image/png' as const,
    width,
    height,
  }))
  seedDocument(userDataDir, {
    document: {
      roots: [
        { id: 'workspace', text: 'Workspace', children: [{ id: 'start', text: 'Start', children: [] }] },
        ...attachments.map((attachment, index) => ({
          id: `n${index}`,
          text: `Distinct screenshot ${index}`,
          attachment,
          children: [],
        })),
      ],
    },
    location: { currentParentId: 'workspace', selectedNodeId: 'start' },
  })
  mkdirSync(join(userDataDir, 'data', 'attachments'), { recursive: true })
  const screenshot = solidPng(width, height)
  for (const { id } of attachments) writeFileSync(attachmentPath(userDataDir, id), screenshot)
  const { app, window } = await launchTree(userDataDir, { vimEnabled: false })
  await app.evaluate(() => {
    const reads: string[] = []
    Object.assign(globalThis, { distinctSearchAttachmentReads: reads })
    globalThis.__treeIpc.wrap('tree:read-attachment', (read, event, id) => {
      reads.push(String(id))
      return read(event, id)
    })
  })
  const readIds = () =>
    app.evaluate(
      () =>
        (globalThis as typeof globalThis & { distinctSearchAttachmentReads: string[] }).distinctSearchAttachmentReads,
    )
  const origin = window.getByRole('textbox', { name: 'Node 1', exact: true })
  const input = window.getByRole('searchbox')
  const position = window.getByLabel('Result position')
  const results = window.getByRole('listbox', { name: 'Search results' })
  const selectedThumbnail = results
    .getByRole('option', { selected: true })
    .locator('canvas.search-thumbnail, img.search-thumbnail')
  await expect(origin).toBeFocused()
  await window.keyboard.press('Meta+;')
  await input.fill('distinct screenshot')
  await expect(position).toHaveText(`1 / ${count}`)
  await expect(selectedThumbnail).toBeVisible()

  for (let index = 1; index < count; index += 1) await input.press('ArrowDown')
  await expect(position).toHaveText(`${count} / ${count}`)
  await expect(selectedThumbnail).toBeVisible()
  const coldReads = await readIds()
  expect(new Set(coldReads)).toEqual(new Set(attachments.map(({ id }) => id)))

  for (let index = 1; index < count; index += 1) await input.press('ArrowUp')
  await expect(position).toHaveText(`1 / ${count}`)
  await expect(selectedThumbnail).toBeVisible()
  await window.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )

  const warmReads = (await readIds()).length - coldReads.length
  const thumbnailSize = await selectedThumbnail.evaluate((image) =>
    image instanceof HTMLCanvasElement
      ? { width: image.width, height: image.height }
      : { width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight },
  )
  recordPerfResult({
    kind: 'node-search',
    scenario: 'distinct-screenshot-thumbnail-retention',
    samples: count,
    metrics: { coldReads: coldReads.length, warmReads },
  })
  expect(coldReads).toHaveLength(count)
  expect(warmReads).toBe(0)
  expect(thumbnailSize).toEqual({ width: 115, height: 96 })
  await input.press('Escape')
  await expect(origin).toBeFocused()
})
