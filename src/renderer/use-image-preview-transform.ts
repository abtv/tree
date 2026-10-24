import { useEffect, useRef, useState } from 'react'
import { constrainPreview, INITIAL_PREVIEW_TRANSFORM, zoomPreview } from './image-preview-transform'
import type { ShortcutProfile } from './shortcut-profile'

/** Input and geometry belong to the preview surface, without changing editor or document state. */
export function useImagePreviewTransform(vimEnabled: boolean, shortcuts: ShortcutProfile) {
  const image = useRef<HTMLImageElement>(null)
  const overlay = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState(INITIAL_PREVIEW_TRANSFORM)

  useEffect(() => {
    const surface = overlay.current
    if (surface === null) return
    const geometry = () => ({
      width: image.current?.offsetWidth ?? 0,
      height: image.current?.offsetHeight ?? 0,
      viewportWidth: Math.max(0, window.innerWidth - 64),
      viewportHeight: Math.max(0, window.innerHeight - 64),
    })
    const ready = () => image.current !== null && image.current.naturalWidth > 0
    const pan = (x: number, y: number) => {
      if (!ready()) return
      setTransform((value) => constrainPreview({ ...value, x: value.x - x, y: value.y - y }, geometry()))
    }
    const zoom = (factor: number, clientX = window.innerWidth / 2, clientY = window.innerHeight / 2) => {
      if (!ready()) return
      setTransform((value) =>
        zoomPreview(value, factor, geometry(), {
          x: clientX - window.innerWidth / 2,
          y: clientY - window.innerHeight / 2,
        }),
      )
    }
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1
      if (event.ctrlKey) zoom(Math.exp(-event.deltaY * unit * 0.01), event.clientX, event.clientY)
      else pan(event.deltaX * unit, event.deltaY * unit)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return
      if (shortcuts.isPrimary(event) && !shortcuts.hasNonPrimaryCtrl(event)) {
        if (!['+', '=', '-'].includes(event.key)) return
        event.preventDefault()
        event.stopPropagation()
        zoom(event.key === '-' ? 1 / 1.25 : 1.25)
        return
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey) return
      const directions: Record<string, readonly [number, number]> = {
        ArrowLeft: [-48, 0],
        ArrowRight: [48, 0],
        ArrowUp: [0, -48],
        ArrowDown: [0, 48],
      }
      if (vimEnabled) Object.assign(directions, { h: [-48, 0], l: [48, 0], k: [0, -48], j: [0, 48] })
      const direction = directions[event.key]
      if (direction === undefined) return
      event.preventDefault()
      event.stopPropagation()
      pan(...direction)
    }
    const onResize = () => setTransform((value) => constrainPreview(value, geometry()))
    // Safari delivers trackpad pinches as gesture events rather than Ctrl+wheel.
    let gestureScale = 1
    const onGestureStart = (event: Event) => {
      event.preventDefault()
      gestureScale = 1
    }
    const onGestureChange = (event: Event) => {
      event.preventDefault()
      const gesture = event as Event & { scale: number; clientX: number; clientY: number }
      if (!Number.isFinite(gesture.scale) || gesture.scale <= 0) return
      zoom(gesture.scale / gestureScale, gesture.clientX, gesture.clientY)
      gestureScale = gesture.scale
    }
    surface.addEventListener('wheel', onWheel, { passive: false })
    surface.addEventListener('gesturestart', onGestureStart, { passive: false })
    surface.addEventListener('gesturechange', onGestureChange, { passive: false })
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onResize)
    return () => {
      surface.removeEventListener('wheel', onWheel)
      surface.removeEventListener('gesturestart', onGestureStart)
      surface.removeEventListener('gesturechange', onGestureChange)
      document.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('resize', onResize)
    }
  }, [vimEnabled, shortcuts])

  return {
    imageRef: image,
    overlayRef: overlay,
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
  }
}
