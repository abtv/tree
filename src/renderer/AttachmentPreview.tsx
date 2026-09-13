import { useEffect, useRef, useState } from 'react'
import { attachmentByteCache } from '../infrastructure/renderer/electron-services'

export function AttachmentImage({
  attachmentId,
  onOpen,
}: {
  attachmentId: string
  onOpen: (attachmentId: string) => void
}): React.JSX.Element | null {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void attachmentByteCache
      .get(attachmentId)
      .then((bytes) => {
        if (disposed || bytes === null) return
        objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId])
  if (url === undefined) return null
  return (
    <button
      aria-label="Open image preview"
      className="attachment-button"
      onClick={() => onOpen(attachmentId)}
      type="button"
    >
      <img className="attachment-image" src={url} alt="Attached image" />
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
  const [url, setUrl] = useState<string>()
  const closeButton = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<Element | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    let disposed = false
    let objectUrl: string | undefined
    void attachmentByteCache
      .get(attachmentId)
      .then((bytes) => {
        if (disposed || bytes === null) return
        objectUrl = URL.createObjectURL(new Blob([Uint8Array.from(bytes).buffer], { type: 'image/png' }))
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      disposed = true
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl)
    }
  }, [attachmentId])

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
        {url === undefined ? null : <img className="image-preview-image" src={url} alt="Attached image preview" />}
      </div>
    </div>
  )
}
