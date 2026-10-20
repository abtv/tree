import { describe, expect, it } from 'vitest'
import { archiveFileName, exportProgressText, exportResultText } from './data-menu'

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
})
