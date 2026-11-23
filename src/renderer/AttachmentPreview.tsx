import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { IMAGE_LOAD_ERROR } from '../domain/product-messages'
import type { AttachmentImageCache } from '../infrastructure/renderer/attachment-image-cache'
import { attachmentImageCache } from '../infrastructure/renderer/electron-services'
import { searchThumbnailSize } from './search-thumbnail-layout'
import { APPLE_SHORTCUTS, type ShortcutProfile } from './shortcut-profile'
import { useImagePreviewTransform } from './use-image-preview-transform'

type AttachmentState =
  | { attachmentId: string; status: 'loading' }
  | { attachmentId: string; status: 'ready'; url: string }
  | { attachmentId: string; status: 'error' }

const MAX_IMAGE_SIDE = 200 // Keep in sync with `.attachment-image` in styles.css.
const MAX_REMEMBERED_SIZES = 1024

interface ImageBox {
  readonly width: number
  readonly height: number
}

// The box each attachment image occupied the last time it loaded, as two numbers per attachment.
const renderedSizes = new Map<string, ImageBox>()

/** The inline box of an image with this natural size: fitted to 200×200 and never enlarged (§17.1). */
function inlineBox(naturalWidth: number, naturalHeight: number): ImageBox {
  const scale = Math.min(1, MAX_IMAGE_SIDE / naturalWidth, MAX_IMAGE_SIDE / naturalHeight)
  return { width: Math.round(naturalWidth * scale), height: Math.round(naturalHeight * scale) }
}

function rememberRenderedSize(attachmentId: string, box: ImageBox): void {
  renderedSizes.delete(attachmentId)
  renderedSizes.set(attachmentId, box)
  if (renderedSizes.size > MAX_REMEMBERED_SIZES) renderedSizes.delete(renderedSizes.keys().next().value!)
}

function cachedState(cache: AttachmentImageCache, attachmentId: string): AttachmentState {
  const url = cache.peek(attachmentId)?.url
  return url === undefined ? { attachmentId, status: 'loading' } : { attachmentId, status: 'ready', url }
}

function useAttachmentImage(
  cache: AttachmentImageCache,
  attachmentId: string,
): {
  state: AttachmentState
  onImageError: () => void
} {
  // A decoded image already in the cache renders in the first frame, without a placeholder.
  const [state, setState] = useState<AttachmentState>(() => cachedState(cache, attachmentId))
  if (state.attachmentId !== attachmentId) {
    setState(cachedState(cache, attachmentId))
  }
  const [request, setRequest] = useState(0)

  useEffect(() => {
    let disposed = false
    void cache
      .get(attachmentId)
      .then((image) => {
        if (disposed) return
        if (image === null) {
          setState({ attachmentId, status: 'error' })
          return
        }
        setState((current) =>
          current.attachmentId === attachmentId && current.status === 'ready' && current.url === image.url
            ? current
            : { attachmentId, status: 'ready', url: image.url },
        )
      })
      .catch(() => {
        if (!disposed) setState({ attachmentId, status: 'error' })
      })
    return () => {
      disposed = true
    }
  }, [cache, attachmentId, request])

  const failedUrl = state.status === 'ready' ? state.url : undefined
  const onImageError = useCallback(() => {
    if (failedUrl !== undefined && !cache.discard(attachmentId, failedUrl)) {
      // The cache evicted this URL before the image loaded; the attachment itself may be fine.
      setState({ attachmentId, status: 'loading' })
      setRequest((current) => current + 1)
      return
    }
    setState((current) => (current.attachmentId === attachmentId ? { attachmentId, status: 'error' } : current))
  }, [cache, attachmentId, failedUrl])

  return { state, onImageError }
}

/** With a reserved box, the message keeps at least the image's height, so the rows below stay in place. */
function ImageErrorMessage({ box }: { box?: ImageBox | undefined }): React.JSX.Element {
  return (
    <p className="attachment-error" role="status" style={box === undefined ? undefined : { minHeight: box.height }}>
      {IMAGE_LOAD_ERROR}
    </p>
  )
}

/** A small, non-interactive copy of a node's image for Search results. */
export function AttachmentThumbnail({
  attachmentId,
  width,
  height,
  images = attachmentImageCache,
}: {
  attachmentId: string
  width?: number | undefined
  height?: number | undefined
  images?: AttachmentImageCache
}): React.JSX.Element | null {
  const { state, onImageError } = useAttachmentImage(images, attachmentId)
  // The stored natural size reserves the box, so a row does not grow when the bytes arrive.
  const size = searchThumbnailSize(width, height)
  if (state.status === 'error') {
    return (
      <span className="attachment-error search-thumbnail-error" role="status">
        {IMAGE_LOAD_ERROR}
      </span>
    )
  }
  if (state.status === 'loading') {
    return size === undefined ? null : <span aria-hidden="true" className="search-thumbnail" style={size} />
  }
  return <img className="search-thumbnail" src={state.url} alt="Attached image" {...size} onError={onImageError} />
}

export function AttachmentImage({
  attachmentId,
  width,
  height,
  onOpen,
  onNaturalSize,
  imageCaretActive = false,
  recognitionComplete = false,
  images = attachmentImageCache,
}: {
  attachmentId: string
  /** The natural size stored with the attachment, when the document has one (§17). */
  width?: number | undefined
  height?: number | undefined
  onOpen: (attachmentId: string) => void
  /** Reports a decoded natural size that differs from the stored one. */
  onNaturalSize?: ((attachmentId: string, width: number, height: number) => void) | undefined
  imageCaretActive?: boolean
  recognitionComplete?: boolean
  images?: AttachmentImageCache
}): React.JSX.Element | null {
  const { state, onImageError } = useAttachmentImage(images, attachmentId)
  const [, showDecodedSize] = useReducer((count: number) => count + 1, 0)
  // A size measured from the decoded image wins over the stored one, which may be missing or wrong.
  const size =
    renderedSizes.get(attachmentId) ??
    (width === undefined || height === undefined ? undefined : inlineBox(width, height))
  const onLoad = (image: HTMLImageElement): void => {
    const { naturalWidth, naturalHeight } = image
    if (naturalWidth === 0 || naturalHeight === 0) return
    const box = inlineBox(naturalWidth, naturalHeight)
    rememberRenderedSize(attachmentId, box)
    if (naturalWidth !== width || naturalHeight !== height) onNaturalSize?.(attachmentId, naturalWidth, naturalHeight)
    if (box.width !== size?.width || box.height !== size.height) showDecodedSize()
  }
  if (state.status === 'loading') {
    // Rows remount when a node is left, a branch opens or a list window moves. Reserving the image's
    // size keeps the rows below it from shifting when the bytes arrive.
    return size === undefined ? null : <span aria-hidden="true" className="attachment-placeholder" style={size} />
  }
  if (state.status === 'error') return <ImageErrorMessage box={size} />
  return (
    <button
      aria-label="Open image preview"
      aria-description={recognitionComplete ? undefined : 'Image text recognition is not complete'}
      title={recognitionComplete ? undefined : 'Image text recognition is not complete'}
      data-recognition-incomplete={recognitionComplete ? undefined : true}
      className={imageCaretActive ? 'attachment-button attachment-image-caret' : 'attachment-button'}
      onClick={() => onOpen(attachmentId)}
      onPointerDown={(event) => {
        event.stopPropagation()
        // Keyboard commands are bound to the node input, so focus stays there while the preview is open.
        const input = event.currentTarget.parentElement?.querySelector<HTMLElement>(':scope > .node-input')
        ;(input ?? event.currentTarget).focus()
        onOpen(attachmentId)
      }}
      type="button"
    >
      <img
        className="attachment-image"
        src={state.url}
        alt="Attached image"
        {...size}
        onError={onImageError}
        onLoad={(event) => onLoad(event.currentTarget)}
      />
    </button>
  )
}

export function ImagePreview({
  attachmentId,
  onClose,
  images = attachmentImageCache,
  vimEnabled = false,
  shortcuts = APPLE_SHORTCUTS,
}: {
  attachmentId: string
  onClose: () => void
  images?: AttachmentImageCache
  vimEnabled?: boolean
  shortcuts?: ShortcutProfile
}): React.JSX.Element {
  const { state, onImageError } = useAttachmentImage(images, attachmentId)
  const { imageRef, overlayRef, transform } = useImagePreviewTransform(vimEnabled, shortcuts)
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<Element | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    previouslyFocused.current = document.activeElement
    closeButton.current?.focus()
    const onKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.defaultPrevented) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusableElements = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )
      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusableElements[0]!
      const last = focusableElements[focusableElements.length - 1]!
      if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault()
        first.focus()
      }
    }
    const onFocusIn = (event: FocusEvent): void => {
      if (!dialog.current?.contains(event.target as Node)) closeButton.current?.focus()
    }
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn, true)
      const previous = previouslyFocused.current
      if (previous instanceof HTMLElement) previous.focus()
    }
  }, [])

  return (
    <div ref={overlayRef} className="image-preview-overlay" onClick={onClose}>
      <div
        ref={dialog}
        aria-label="Image preview"
        aria-modal="true"
        className="image-preview"
        role="dialog"
        data-editor-selection-return
      >
        <button
          ref={closeButton}
          aria-label="Close image preview"
          className="image-preview-close"
          onClick={onClose}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.6"
            viewBox="0 0 12 12"
          >
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
        {state.status === 'ready' ? (
          <img
            ref={imageRef}
            className="image-preview-image"
            style={{ transform }}
            src={state.url}
            alt="Attached image preview"
            onError={onImageError}
          />
        ) : null}
        {state.status === 'error' ? <ImageErrorMessage /> : null}
      </div>
    </div>
  )
}
