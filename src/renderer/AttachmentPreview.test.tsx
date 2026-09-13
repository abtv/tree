// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import './test/setup'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'

afterEach(cleanup)

const attachmentBytes = new Uint8Array([137, 80, 78, 71])
const createdObjectUrl = 'blob:attachment'

function mockTreeApi(overrides: Partial<Window['treeApi']> = {}): void {
  window.treeApi = {
    quit: async () => undefined,
    onQuitRequested: () => () => undefined,
    onQuitFailed: () => () => undefined,
    load: async () => null,
    save: async () => undefined,
    readClipboard: async () => ({ kind: 'text', text: '' }),
    writeAttachment: async () => undefined,
    hasAttachment: async () => true,
    readAttachment: async () => attachmentBytes,
    cleanupAttachments: async () => undefined,
    ...overrides,
  }
}

beforeEach(() => {
  mockTreeApi()
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

  it('renders nothing when the attachment bytes are missing', async () => {
    mockTreeApi({ readAttachment: async () => null })
    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByRole('button', { name: 'Open image preview' })).not.toBeInTheDocument()
  })

  it('renders nothing and does not reject when the attachment read fails', async () => {
    mockTreeApi({
      readAttachment: async () => {
        throw new Error('read failed')
      },
    })
    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    await Promise.resolve()
    await Promise.resolve()

    expect(screen.queryByRole('button', { name: 'Open image preview' })).not.toBeInTheDocument()
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

  it('renders nothing and does not reject when the preview attachment read fails', async () => {
    mockTreeApi({
      readAttachment: async () => {
        throw new Error('read failed')
      },
    })
    const { container } = render(<ImagePreview attachmentId="image" onClose={() => undefined} />)

    await Promise.resolve()
    await Promise.resolve()

    expect(container.querySelector('.image-preview-image')).toBeNull()
  })
})
