import { describe, expect, it } from 'vitest'
import {
  archiveFileName,
  exportProgressText,
  exportResultText,
  fileSizeText,
  importConfirmationText,
  importProgressText,
  restoreProgressText,
} from './data-menu'

describe('data menu wording', () => {
  it('names the archive after the local date', () => {
    expect(archiveFileName(new Date(2026, 0, 5, 23, 59))).toBe('Tree Notes 2026-01-05.zip')
    expect(archiveFileName(new Date(2026, 11, 31, 0, 0))).toBe('Tree Notes 2026-12-31.zip')
  })

  it('reports image progress with grouped counts', () => {
    expect(exportProgressText(0, 0)).toBe('Exporting Notes…')
    expect(exportProgressText(0, 1)).toBe('Exporting Notes… 0 of 1 image')
    expect(exportProgressText(1250, 3000)).toBe('Exporting Notes… 1,250 of 3,000 images')
  })

  it('names the file and any images that were not included', () => {
    const summary = { imageCount: 2, archiveBytes: 10 }
    expect(exportResultText('Tree Notes 2026-10-20.zip', { ...summary, missingImageCount: 0 })).toBe(
      'Exported “Tree Notes 2026-10-20.zip”.',
    )
    expect(exportResultText('a.zip', { ...summary, missingImageCount: 1 })).toBe(
      'Exported “a.zip”. 1 image could not be found and was not included.',
    )
    expect(exportResultText('a.zip', { ...summary, missingImageCount: 1200 })).toBe(
      'Exported “a.zip”. 1,200 images could not be found and were not included.',
    )
  })

  it('reports import and restore progress like export progress', () => {
    expect(importProgressText(0, 0)).toBe('Importing Notes…')
    expect(importProgressText(2, 3000)).toBe('Importing Notes… 2 of 3,000 images')
    expect(restoreProgressText(0, 0)).toBe('Restoring Notes…')
    expect(restoreProgressText(1, 1)).toBe('Restoring Notes… 1 of 1 image')
  })

  // @requirement PRODUCT.md §24.6
  it('names the folder and what restoring replaces', () => {
    const incoming = { nodeCount: 2, imageCount: 0, missingImageCount: 2 }
    expect(importConfirmationText('Tree Backup', 1500, incoming, { nodeCount: 1, imageCount: 0 }, true)).toEqual({
      incoming: '“Tree Backup” (1.5 KB) contains 2 nodes and 0 images.',
      current: 'Your current notes have 1 node and 0 images. Restoring replaces them, and this cannot be undone.',
      missing: '2 images that the notes use are not in the folder. Their nodes will show “Image could not be loaded.”',
    })
    expect(importConfirmationText('Tree Backup', 1, incoming, 'invalid', true).current).toBe(
      'The notes saved in this browser are invalid and cannot be opened. Restoring replaces them.',
    )
  })

  it('formats file sizes in decimal units', () => {
    expect(fileSizeText(1)).toBe('1 byte')
    expect(fileSizeText(999)).toBe('999 bytes')
    expect(fileSizeText(1000)).toBe('1 KB')
    expect(fileSizeText(2_450_000)).toBe('2.5 MB')
    expect(fileSizeText(999_960)).toBe('1 MB')
    expect(fileSizeText(123_456_789)).toBe('123 MB')
    expect(fileSizeText(2_147_483_647)).toBe('2.1 GB')
  })

  // @requirement PRODUCT.md §24.4
  it('compares the archive with the current notes before replacing them', () => {
    const incoming = { nodeCount: 1234, imageCount: 1, missingImageCount: 0 }
    expect(
      importConfirmationText('Tree Notes 2026-10-20.zip', 2_450_000, incoming, { nodeCount: 1, imageCount: 0 }),
    ).toEqual({
      incoming: '“Tree Notes 2026-10-20.zip” (2.5 MB) contains 1,234 nodes and 1 image.',
      current: 'Your current notes have 1 node and 0 images. Importing replaces them, and this cannot be undone.',
      missing: undefined,
    })
    expect(importConfirmationText('a.zip', 10, { ...incoming, missingImageCount: 1 }, 'none')).toMatchObject({
      current: 'There are no saved notes in this browser.',
      missing: '1 image that the notes use is not in the archive. Its node will show “Image could not be loaded.”',
    })
    expect(importConfirmationText('a.zip', 10, { ...incoming, missingImageCount: 1500 }, 'invalid')).toMatchObject({
      current: 'The notes saved in this browser are invalid and cannot be opened. Importing replaces them.',
      missing:
        '1,500 images that the notes use are not in the archive. Their nodes will show “Image could not be loaded.”',
    })
  })
})
