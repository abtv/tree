// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { attachmentByteCache } from '../infrastructure/renderer/electron-services'
import './test/setup'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'

afterEach(cleanup)

const attachmentBytes = new Uint8Array([137, 80, 78, 71])
const createdObjectUrl = 'blob:attachment'

function mockTreeApi(overrides: Partial<Window['treeApi']> = {}): void {
  window.treeApi = {
    quit: async () => undefined,
    quitWithoutSaving: async () => undefined,
    onQuitRequested: () => () => undefined,
    onQuitFailed: () => () => undefined,
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    readAttachment: async () => attachmentBytes,
    cleanupAttachments: async () => undefined,
    ...overrides,
  }
}

beforeEach(() => {
  mockTreeApi()
  attachmentByteCache.clear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => createdObjectUrl })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
})

describe('AttachmentImage', () => {
  it('renders the image button once the attachment loads and revokes the URL on unmount', async () => {
    const revoke = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    const onOpen = vi.fn()
    const { unmount } = render(<AttachmentImage attachmentId="image" onOpen={onOpen} />)

    const button = await screen.findByRole('button', { name: 'Open image preview' })
    fireEvent.click(button)
    expect(onOpen).toHaveBeenCalledWith('image')

    unmount()
    expect(revoke).toHaveBeenCalledWith(createdObjectUrl)
  })

  it('reports missing attachment bytes', async () => {
    mockTreeApi({ readAttachment: async () => null })
    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open image preview' })).not.toBeInTheDocument()
  })

  it('reports a failed attachment read without rejecting', async () => {
    mockTreeApi({
      readAttachment: async () => {
        throw new Error('read failed')
      },
    })
    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()
  })

  it('reports a browser decode error and releases the object URL', async () => {
    const revoke = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    const image = await screen.findByAltText('Attached image')
    fireEvent.error(image)

    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()
    expect(revoke).toHaveBeenCalledWith(createdObjectUrl)
  })

  it('clears a failure after switching to a valid attachment', async () => {
    mockTreeApi({
      readAttachment: async (id) => (id === 'broken' ? null : attachmentBytes),
    })
    const { rerender } = render(<AttachmentImage attachmentId="broken" onOpen={() => undefined} />)
    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()

    rerender(<AttachmentImage attachmentId="working" onOpen={() => undefined} />)

    expect(await screen.findByRole('button', { name: 'Open image preview' })).toBeInTheDocument()
    expect(screen.queryByText('Image could not be loaded.')).not.toBeInTheDocument()
  })

  it('ignores a late success for an attachment that is no longer displayed', async () => {
    let releaseFirst: ((bytes: Uint8Array) => void) | undefined
    mockTreeApi({
      readAttachment: (id) =>
        id === 'first'
          ? new Promise<Uint8Array>((resolve) => {
              releaseFirst = resolve
            })
          : Promise.resolve(null),
    })
    const { rerender } = render(<AttachmentImage attachmentId="first" onOpen={() => undefined} />)
    rerender(<AttachmentImage attachmentId="second" onOpen={() => undefined} />)
    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()

    releaseFirst!(attachmentBytes)
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.getByText('Image could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open image preview' })).not.toBeInTheDocument()
  })

  it('ignores a late failure for an attachment that is no longer displayed', async () => {
    let rejectFirst: ((error: Error) => void) | undefined
    mockTreeApi({
      readAttachment: (id) =>
        id === 'first'
          ? new Promise<Uint8Array>((_resolve, reject) => {
              rejectFirst = reject
            })
          : Promise.resolve(attachmentBytes),
    })
    const { rerender } = render(<AttachmentImage attachmentId="first" onOpen={() => undefined} />)
    rerender(<AttachmentImage attachmentId="second" onOpen={() => undefined} />)
    expect(await screen.findByRole('button', { name: 'Open image preview' })).toBeInTheDocument()

    rejectFirst!(new Error('late failure'))
    await Promise.resolve()
    await Promise.resolve()

    expect(screen.getByRole('button', { name: 'Open image preview' })).toBeInTheDocument()
    expect(screen.queryByText('Image could not be loaded.')).not.toBeInTheDocument()
  })

  it('reads the attachment once across remounts', async () => {
    const read = vi.fn(async () => attachmentBytes)
    mockTreeApi({ readAttachment: read })
    const first = render(<AttachmentImage attachmentId="shared" onOpen={() => undefined} />)
    await screen.findByRole('button', { name: 'Open image preview' })
    first.unmount()
    render(<AttachmentImage attachmentId="shared" onOpen={() => undefined} />)
    await screen.findByRole('button', { name: 'Open image preview' })

    expect(read).toHaveBeenCalledTimes(1)
  })

  it('reuses the inline bytes when the preview opens', async () => {
    const read = vi.fn(async () => attachmentBytes)
    mockTreeApi({ readAttachment: read })
    render(<AttachmentImage attachmentId="shared" onOpen={() => undefined} />)
    await screen.findByRole('button', { name: 'Open image preview' })
    render(<ImagePreview attachmentId="shared" onClose={() => undefined} />)
    await screen.findByAltText('Attached image preview')

    expect(read).toHaveBeenCalledTimes(1)
  })
})

describe('ImagePreview', () => {
  it('closes on Escape and restores focus to the previously focused element', async () => {
    const onClose = vi.fn()
    const trigger = document.createElement('button')
    trigger.textContent = 'trigger'
    document.body.append(trigger)
    trigger.focus()
    render(<ImagePreview attachmentId="image" onClose={onClose} />)

    await screen.findByRole('button', { name: 'Close image preview' })
    await screen.findByAltText('Attached image preview')
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()

    cleanup()
    expect(trigger).toHaveFocus()
    trigger.remove()
  })

  it('ignores an already-handled Escape key', async () => {
    const onClose = vi.fn()
    render(<ImagePreview attachmentId="image" onClose={onClose} />)
    await screen.findByRole('button', { name: 'Close image preview' })
    await screen.findByAltText('Attached image preview')

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    event.preventDefault()
    window.dispatchEvent(event)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores unrelated keys', async () => {
    const onClose = vi.fn()
    render(<ImagePreview attachmentId="image" onClose={onClose} />)
    await screen.findByRole('button', { name: 'Close image preview' })
    await screen.findByAltText('Attached image preview')

    fireEvent.keyDown(window, { key: 'a' })

    expect(onClose).not.toHaveBeenCalled()
  })

  it('wraps focus between the first and last focusable elements with Tab and Shift+Tab', async () => {
    render(<ImagePreview attachmentId="image" onClose={() => undefined} />)
    const close = await screen.findByRole('button', { name: 'Close image preview' })
    await screen.findByAltText('Attached image preview')
    expect(close).toHaveFocus()

    const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true })
    window.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(true)
    expect(close).toHaveFocus()

    const backward = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true, bubbles: true })
    window.dispatchEvent(backward)
    expect(backward.defaultPrevented).toBe(true)
    expect(close).toHaveFocus()
  })

  it('pulls focus back into the dialog when the active element is outside it', async () => {
    render(<ImagePreview attachmentId="image" onClose={() => undefined} />)
    const close = await screen.findByRole('button', { name: 'Close image preview' })
    await screen.findByAltText('Attached image preview')

    const outside = document.createElement('button')
    outside.textContent = 'outside'
    document.body.append(outside)
    outside.focus()

    fireEvent.focusIn(outside)
    expect(close).toHaveFocus()

    const forward = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true })
    window.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(true)
    expect(close).toHaveFocus()

    outside.remove()
  })

  it('prevents Tab from escaping when there are no focusable elements', async () => {
    const { container } = render(<ImagePreview attachmentId="image" onClose={() => undefined} />)
    await screen.findByRole('button', { name: 'Close image preview' })
    await screen.findByAltText('Attached image preview')
    container.querySelector('.image-preview-close')?.remove()

    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true })
    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('reports a failed preview attachment read without rejecting', async () => {
    mockTreeApi({
      readAttachment: async () => {
        throw new Error('read failed')
      },
    })
    render(<ImagePreview attachmentId="image" onClose={() => undefined} />)

    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByAltText('Attached image preview')).not.toBeInTheDocument()
  })

  it('keeps the preview closable when the image fails to decode', async () => {
    const onClose = vi.fn()
    render(<ImagePreview attachmentId="image" onClose={onClose} />)

    const image = await screen.findByAltText('Attached image preview')
    fireEvent.error(image)
    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
