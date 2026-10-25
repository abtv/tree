// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { DesktopDataOperations } from '../application/notes-archive/desktop-data-operations'
import { ImportConfirmationDialog } from './ImportConfirmationDialog'

afterEach(cleanup)

// @requirement PRODUCT.md §25.3
it('presents desktop preservation and missing-image text, with Cancel focused and replacement disabled while running', () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  const cancel = vi.fn()
  const replace = vi.fn()
  const confirmation = {
    ok: true,
    fileName: 'Notes.zip',
    fileBytes: 2500,
    incoming: { nodeCount: 3, imageCount: 1, missingImageCount: 1 },
    current: 'invalid',
  }
  const operations = {
    getConfirmation: () => confirmation,
    cancel,
    replaceNotes: replace,
  } as unknown as DesktopDataOperations
  const view = render(<ImportConfirmationDialog operations={operations} state={{ phase: 'confirming', text: '' }} />)

  expect(screen.getByRole('dialog').textContent).toContain('“Notes.zip” (2.5 KB) contains 3 nodes and 1 image.')
  expect(screen.getByRole('dialog').textContent).toContain('moves their files to the Replaced Notes folder.')
  expect(screen.getByRole('dialog').textContent).toContain('1 image that the notes use is not in the archive.')
  expect(screen.queryByRole('button', { name: 'Export Current Notes First' })).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))

  view.rerender(
    <ImportConfirmationDialog operations={operations} state={{ phase: 'replacing', text: 'Replacing Notes…' }} />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Replace Notes' }))
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))

  expect(replace).not.toHaveBeenCalled()
  expect(cancel).not.toHaveBeenCalled()

  view.rerender(
    <ImportConfirmationDialog operations={operations} state={{ phase: 'confirming', text: 'Exported “Notes.zip”.' }} />,
  )

  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }))
})
