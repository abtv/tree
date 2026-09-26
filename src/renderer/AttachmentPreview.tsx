import { useCallback, useEffect, useRef, useState } from 'react'
import { IMAGE_LOAD_ERROR } from '../domain/product-messages'
import { attachmentByteCache } from '../infrastructure/renderer/electron-services'

type AttachmentState =
  | { attachmentId: string; status: 'loading' }
  | { attachmentId: string; status: 'ready'; url: string }
  | { attachmentId: string; status: 'error' }

function useAttachmentImage(attachmentId: string): {
  state: AttachmentState
  onImageError: () => void
} {
  const [state, setState] = useState<AttachmentState>({ attachmentId, status: 'loading' })
  if (state.attachmentId !== attachmentId) {
    setState({ attachmentId, status: 'loading' })
  }
  const objectUrl = useRef<string | undefined>(undefined)

  useEffect(() => {
    let disposed = false
    void attachmentByteCache
      .get(attachmentId)
      .then((bytes) => {
        if (disposed) return
        if (bytes === null) {
          setState({ attachmentId, status: 'error' })
          return
        }
        const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
        objectUrl.current = url
        setState({ attachmentId, status: 'ready', url })
      })
      .catch(() => {
        if (!disposed) setState({ attachmentId, status: 'error' })
      })
    return () => {
      disposed = true
      if (objectUrl.current !== undefined) {
        URL.revokeObjectURL(objectUrl.current)
        objectUrl.current = undefined
      }
    }
  }, [attachmentId])

  const onImageError = useCallback(() => {
    if (objectUrl.current !== undefined) {
      URL.revokeObjectURL(objectUrl.current)
      objectUrl.current = undefined
    }
    setState((current) => (current.attachmentId === attachmentId ? { attachmentId, status: 'error' } : current))
  }, [attachmentId])

  return { state, onImageError }
}

function ImageErrorMessage(): React.JSX.Element {
  return (
    <p className="attachment-error" role="status">
      {IMAGE_LOAD_ERROR}
    </p>
  )
}

export function AttachmentImage({
  attachmentId,
  onOpen,
  imageCaretActive = false,
}: {
  attachmentId: string
  onOpen: (attachmentId: string) => void
  imageCaretActive?: boolean
}): React.JSX.Element | null {
  const { state, onImageError } = useAttachmentImage(attachmentId)
  if (state.status === 'loading') return null
  if (state.status === 'error') return <ImageErrorMessage />
  return (
    <button
      aria-label="Open image preview"
      className={imageCaretActive ? 'attachment-button attachment-image-caret' : 'attachment-button'}
      onClick={() => onOpen(attachmentId)}
      onPointerDown={(event) => {
        event.stopPropagation()
        event.currentTarget.focus()
        onOpen(attachmentId)
      }}
      type="button"
    >
      <img className="attachment-image" src={state.url} alt="Attached image" onError={onImageError} />
    </button>
  )
}

export function ImagePreview({
  attachmentId,
  onClose,
}: {
  attachmentId: string
  onClose: () => void
}): React.JSX.Element {
  const { state, onImageError } = useAttachmentImage(attachmentId)
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
    <div className="image-preview-overlay">
      <div ref={dialog} aria-label="Image preview" aria-modal="true" className="image-preview" role="dialog">
        <button
          ref={closeButton}
          aria-label="Close image preview"
          className="image-preview-close"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
        {state.status === 'ready' ? (
          <img className="image-preview-image" src={state.url} alt="Attached image preview" onError={onImageError} />
        ) : null}
        {state.status === 'error' ? <ImageErrorMessage /> : null}
      </div>
    </div>
  )
}
