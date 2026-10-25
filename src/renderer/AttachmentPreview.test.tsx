// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAttachmentImageCache } from '../infrastructure/renderer/attachment-image-cache'
import { attachmentImageCache } from '../infrastructure/renderer/electron-services'
import './test/setup'
import { AttachmentImage, ImagePreview } from './AttachmentPreview'
import { OTHER_SHORTCUTS } from './shortcut-profile'

afterEach(cleanup)

const attachmentBytes = new Uint8Array([137, 80, 78, 71])
const createdObjectUrl = 'blob:attachment'

function mockTreeApi(overrides: Partial<Window['treeApi']> = {}): void {
  window.treeApi = {
    getAppearance: async () => 'system',
    setAppearance: async () => undefined,
    getCommandHistory: async () => [],
    setCommandHistory: async () => undefined,
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
    getAlwaysOnTop: async () => false,
    setAlwaysOnTop: async () => undefined,
    getVimEnabled: async () => true,
    setVimEnabled: async () => undefined,
    ...overrides,
  }
}

beforeEach(() => {
  mockTreeApi()
  attachmentImageCache.clear()
  // jsdom does not decode images.
  Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: async () => undefined })
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => createdObjectUrl })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined })
})

describe('AttachmentImage', () => {
  it('renders the image button once the attachment loads and keeps the URL cached on unmount', async () => {
    const revoke = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    const onOpen = vi.fn()
    const { unmount } = render(<AttachmentImage attachmentId="image" onOpen={onOpen} />)

    const button = await screen.findByRole('button', { name: 'Open image preview' })

    fireEvent.click(button)

    expect(onOpen).toHaveBeenCalledWith('image')

    unmount()

    expect(revoke).not.toHaveBeenCalled()
  })

  it('renders a cached image in the first render of a remount', async () => {
    const first = render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)
    await screen.findByAltText('Attached image')

    first.unmount()

    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    expect(screen.getByAltText('Attached image')).toHaveAttribute('src', createdObjectUrl)
  })

  it('reserves the rendered size of an image that is no longer cached from the first render of a remount', async () => {
    const first = render(<AttachmentImage attachmentId="sized-image" onOpen={() => undefined} />)
    const image = await screen.findByAltText('Attached image')
    Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 400 })
    Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 300 })

    fireEvent.load(image)
    first.unmount()
    attachmentImageCache.clear()

    const { container } = render(<AttachmentImage attachmentId="sized-image" onOpen={() => undefined} />)
    const placeholder = container.querySelector<HTMLElement>('.attachment-placeholder')

    expect(placeholder).not.toBeNull()
    expect(placeholder).toHaveStyle({ width: '200px', height: '150px' })

    const remounted = await screen.findByAltText('Attached image')

    expect(remounted).toHaveAttribute('width', '200')
    expect(remounted).toHaveAttribute('height', '150')
    expect(container.querySelector('.attachment-placeholder')).toBeNull()
  })

  it('reserves no space for an image whose size has not been measured', () => {
    const { container } = render(<AttachmentImage attachmentId="unmeasured-image" onOpen={() => undefined} />)

    expect(container.querySelector('.attachment-placeholder')).toBeNull()
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

  it('reports a browser display error and releases the cached object URL', async () => {
    const revoke = vi.fn()
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    const image = await screen.findByAltText('Attached image')

    fireEvent.error(image)

    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()
    expect(revoke).toHaveBeenCalledWith(createdObjectUrl)
    expect(attachmentImageCache.peek('image')).toBeUndefined()
  })

  it('requests the image again when its URL was evicted before it loaded', async () => {
    const read = vi.fn(async () => attachmentBytes)
    let next = 0
    const decode = async () => {
      next += 1
      return { url: `blob:${next}`, width: 10, height: 10, release: () => undefined }
    }
    // Each entry costs 404 bytes, so the budget holds one image.
    const images = createAttachmentImageCache(read, decode, 500)
    render(<AttachmentImage attachmentId="evicted" images={images} onOpen={() => undefined} />)
    const image = await screen.findByAltText('Attached image')

    expect(image).toHaveAttribute('src', 'blob:1')

    await images.get('other')
    fireEvent.error(image)

    await waitFor(() => expect(screen.getByAltText('Attached image')).toHaveAttribute('src', 'blob:3'))

    expect(screen.queryByText('Image could not be loaded.')).not.toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('reports bytes the browser cannot decode', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: async () => {
        throw new Error('invalid image')
      },
    })
    render(<AttachmentImage attachmentId="image" onOpen={() => undefined} />)

    expect(await screen.findByText('Image could not be loaded.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Open image preview' })).not.toBeInTheDocument()
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
  async function transformFixture(vimEnabled = false, otherPlatform = false) {
    const onClose = vi.fn()
    const rendered = render(
      <ImagePreview
        attachmentId="image"
        onClose={onClose}
        vimEnabled={vimEnabled}
        {...(otherPlatform ? { shortcuts: OTHER_SHORTCUTS } : {})}
      />,
    )
    const image = await screen.findByAltText('Attached image preview')
    Object.defineProperties(image, {
      naturalWidth: { value: 2000 },
      offsetWidth: { value: window.innerWidth - 64 },
      offsetHeight: { value: window.innerHeight - 64 },
    })
    const overlay = image.closest('.image-preview-overlay')!
    return { image, overlay, onClose, ...rendered }
  }

  it.each([false, true])('zooms with the platform primary modifier and pans with arrows (other=%s)', async (other) => {
    const { image, onClose } = await transformFixture(false, other)
    const primary = other ? { ctrlKey: true } : { metaKey: true }

    fireEvent.keyDown(document, { key: '=', ...primary })

    expect(image.style.transform).toBe('translate(0px, 0px) scale(1.25)')

    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'ArrowDown' })

    expect(image.style.transform).toBe('translate(-48px, -48px) scale(1.25)')

    fireEvent.keyDown(document, { key: '-', ...primary })

    expect(image.style.transform).toBe('translate(0px, 0px) scale(1)')
    expect(onClose).not.toHaveBeenCalled()
  })

  it.each([false, true])('uses Vim pan keys only when Vim is enabled (%s)', async (vim) => {
    const { image } = await transformFixture(vim)

    fireEvent.keyDown(document, { key: '+', metaKey: true, shiftKey: true })
    fireEvent.keyDown(document, { key: 'l' })
    fireEvent.keyDown(document, { key: 'j' })

    expect(image.style.transform).toBe(`translate(${vim ? -48 : 0}px, ${vim ? -48 : 0}px) scale(1.25)`)

    fireEvent.keyDown(document, { key: 'h', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'k', isComposing: true })

    expect(image.style.transform).toBe(`translate(${vim ? -48 : 0}px, ${vim ? -48 : 0}px) scale(1.25)`)

    fireEvent.keyDown(document, { key: 'h' })
    fireEvent.keyDown(document, { key: 'k' })

    expect(image.style.transform).toBe('translate(0px, 0px) scale(1.25)')
  })

  it('consumes pinch and scrolling without changing page zoom or dismissing the preview', async () => {
    const { image, overlay, onClose } = await transformFixture()
    const pinch = new WheelEvent('wheel', {
      ctrlKey: true,
      deltaY: -40,
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2,
      bubbles: true,
      cancelable: true,
    })

    fireEvent(overlay, pinch)

    expect(pinch.defaultPrevented).toBe(true)
    expect(image.style.transform).toContain(`scale(${Math.exp(0.4)})`)

    fireEvent.wheel(overlay, { deltaX: 30, deltaY: 40 })

    expect(image.style.transform).toContain('translate(-30px, -40px)')
    expect(screen.getByRole('button', { name: 'Close image preview' })).toHaveFocus()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('supports cumulative Safari gesture scales and removes listeners on close', async () => {
    const { image, overlay, unmount } = await transformFixture()

    fireEvent(overlay, new Event('gesturestart', { cancelable: true }))
    for (const scale of [1.5, 2]) {
      const event = new Event('gesturechange', { cancelable: true })
      Object.assign(event, { scale, clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 })
      fireEvent(overlay, event)
    }

    expect(image.style.transform).toBe('translate(0px, 0px) scale(2)')

    unmount()
    const event = new KeyboardEvent('keydown', { key: '+', metaKey: true, cancelable: true })
    document.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps loading and failed images closable without applying zoom', async () => {
    const { image } = await transformFixture()

    fireEvent.error(image)
    fireEvent.keyDown(document, { key: '+', metaKey: true })

    expect(screen.getByText('Image could not be loaded.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close image preview' })).toHaveFocus()
  })

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

  it('closes on a mouse click on the backdrop or on the image', async () => {
    const onClose = vi.fn()
    render(<ImagePreview attachmentId="image" onClose={onClose} />)
    const image = await screen.findByAltText('Attached image preview')

    fireEvent.click(image)

    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(image.closest('.image-preview-overlay')!)

    expect(onClose).toHaveBeenCalledTimes(2)
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
