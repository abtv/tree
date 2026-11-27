import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { CompletionPopupState } from './completion-controller'
import type { CompletionSuggestion } from './completion-sources'
import { placeInViewport } from './completion-popup-placement'
import {
  COMPLETION_MAX_HEIGHT,
  COMPLETION_ROW_HEIGHT,
  COMPLETION_WINDOW_THRESHOLD,
  completionWindow,
  revealCompletionOption,
} from './completion-window'
import { computeListWindow } from './list-window'
import { SearchResultLayout } from './search-result-layout'

export interface CompletionPopupPresentation {
  readonly popup: CompletionPopupState
  readonly left: number
  readonly top: number
  readonly rowTop: number
}

interface LargeListSizing {
  epoch: symbol
  widest: number
  fits: boolean
}

interface WrappedMeasurement {
  readonly estimate: SearchResultLayout
  readonly layout: SearchResultLayout
  readonly anchor: { index: number; inset: number; atEnd: boolean } | undefined
}

/** Find the intrinsic-width option once per list, without mounting every option to size the popup. */
function sizeLargeList(
  element: HTMLElement,
  suggestions: readonly CompletionSuggestion[],
): Omit<LargeListSizing, 'epoch'> {
  const context = document.createElement('canvas').getContext('2d')
  if (context === null) return { widest: 0, fits: false }
  const style = getComputedStyle(element)
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
  const monoFamily = 'JetBrains Mono'
  const unquote = (name: string): string => name.replace(/['"]/g, '')
  const monoLoaded =
    unquote(style.fontFamily) === monoFamily &&
    [...(document.fonts ?? [])].some((face) => unquote(face.family) === monoFamily && face.status === 'loaded')
  const asciiAdvance = monoLoaded ? context.measureText('0').width : 0
  // Printable ASCII has one advance per character in the bundled mono face. A different or
  // not-yet-loaded face, emoji and non-ASCII names still use native glyph measurements.
  const textWidth = (text: string): number =>
    asciiAdvance > 0 && /^[\x20-\x7e]*$/.test(text) ? asciiAdvance * text.length : context.measureText(text).width
  const available = document.documentElement.clientWidth - 34
  let widest = 0
  let width = 0
  let wraps = false
  for (let index = 0; index < suggestions.length; index++) {
    const { id, label, description } = suggestions[index]!
    const candidate = textWidth(label) + (description ? textWidth(description) : 0)
    if (candidate > width) {
      widest = index
      width = candidate
    }
    // An unbreakable label can overflow horizontally without changing the row height.
    if (
      candidate >= available &&
      (/[^\x21-\x7e]|-/.test(description) || (!id.startsWith('emoji:') && /[^\x21-\x7e]|-/.test(label)))
    )
      wraps = true
  }
  return { widest, fits: !wraps }
}

function OptionText({ suggestion }: { suggestion: CompletionSuggestion }): React.JSX.Element {
  return (
    <>
      <span>{suggestion.label}</span>
      <span className="date-popup-description">{suggestion.description}</span>
    </>
  )
}

export function CompletionPopup({
  presentation,
  accept,
}: {
  presentation: CompletionPopupPresentation | undefined
  accept: (index: number) => void
}): React.JSX.Element | null {
  const container = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [sizing, setSizing] = useState<LargeListSizing>()
  const [viewportRevision, setViewportRevision] = useState(0)
  const suggestions = presentation?.popup.suggestions
  const selectedIndex = presentation?.popup.selected
  const large = (suggestions?.length ?? 0) > COMPLETION_WINDOW_THRESHOLD
  const sizingEpoch = useMemo(() => Symbol(`suggestions:${suggestions?.length ?? 0}`), [suggestions])
  const currentSizing = sizing?.epoch === sizingEpoch ? sizing : undefined
  const windowed = large
  const wrapEstimate = useMemo(
    () =>
      currentSizing?.fits === false
        ? SearchResultLayout.estimate(suggestions!.length, () => COMPLETION_ROW_HEIGHT)
        : undefined,
    [currentSizing, suggestions],
  )
  const [wrapMeasurement, setWrapMeasurement] = useState<WrappedMeasurement>()
  if (wrapMeasurement !== undefined && wrapMeasurement.estimate !== wrapEstimate) setWrapMeasurement(undefined)
  const measured = wrapMeasurement?.estimate === wrapEstimate ? wrapMeasurement : undefined
  const wrapLayout = measured?.layout ?? wrapEstimate
  const wrapWindow = useMemo(
    () =>
      wrapLayout === undefined
        ? undefined
        : computeListWindow({
            count: suggestions!.length,
            offsets: wrapLayout.offsetAt,
            viewportStart: scrollTop,
            viewportEnd: scrollTop + COMPLETION_MAX_HEIGHT,
            overscan: 2,
            focusedIndex: selectedIndex,
          }),
    [wrapLayout, suggestions, scrollTop, selectedIndex],
  )
  const revealWrapped = useRef(false)

  useLayoutEffect(() => {
    if (suggestions === undefined) return
    const measure = () => {
      if (container.current !== null)
        setSizing({ epoch: sizingEpoch, ...sizeLargeList(container.current, suggestions) })
    }
    const resize = () => {
      if (large) measure()
      // A short popup can need to flip even if the editor's anchor did not move.
      else setViewportRevision((revision) => revision + 1)
    }
    if (large) {
      measure()
      document.fonts?.addEventListener('loadingdone', measure)
    }
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      if (large) document.fonts?.removeEventListener('loadingdone', measure)
    }
  }, [large, sizingEpoch, suggestions])

  const left = presentation?.left
  const top = presentation?.top
  const rowTop = presentation?.rowTop
  const viewportHeightRef = useRef(0)
  useLayoutEffect(() => {
    const element = container.current
    if (left === undefined || top === undefined || rowTop === undefined || element === null) return
    const viewportHeight = document.documentElement.clientHeight
    const availableHeight = Math.max(rowTop, viewportHeight - top)
    element.style.maxHeight = `${Math.max(0, Math.min(COMPLETION_MAX_HEIGHT, availableHeight - 2))}px`
    const { width, height } = element.getBoundingClientRect()
    const placed = placeInViewport(
      { left, top, rowTop },
      { width, height },
      { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    )
    element.style.left = `${placed.left}px`
    element.style.top = `${placed.top}px`
    viewportHeightRef.current = element.clientHeight
  }, [left, top, rowTop, suggestions, currentSizing, windowed, viewportRevision])

  useLayoutEffect(() => {
    const element = container.current
    if (element === null || selectedIndex === undefined) return
    if (currentSizing?.fits === false) {
      revealWrapped.current = true
      return
    }
    if (windowed) {
      const currentTop = element.scrollTop
      const nextTop = revealCompletionOption(selectedIndex, currentTop, viewportHeightRef.current)
      if (nextTop !== currentTop) element.scrollTop = nextTop
      setScrollTop(element.scrollTop)
      return
    }

    const selected = element.querySelector<HTMLElement>('[aria-selected="true"]')
    if (selected !== null) {
      const bottom = selected.offsetTop + selected.offsetHeight
      if (selected.offsetTop < element.scrollTop) element.scrollTop = selected.offsetTop
      else if (bottom > element.scrollTop + element.clientHeight) element.scrollTop = bottom - element.clientHeight
    }
  }, [left, top, rowTop, suggestions, selectedIndex, currentSizing, windowed, viewportRevision])

  useLayoutEffect(() => {
    if (wrapEstimate === undefined || wrapLayout === undefined || wrapWindow === undefined) return
    const element = container.current
    if (element === null) return
    const heights = new Map<number, number>()
    for (const option of element.querySelectorAll<HTMLElement>('[aria-posinset]')) {
      const index = Number(option.getAttribute('aria-posinset')) - 1
      const height = option.getBoundingClientRect().height
      if (height > 0 && height !== wrapLayout.heightAt(index)) heights.set(index, height)
    }
    const layout = wrapLayout.withMeasurements(heights)
    if (layout === wrapLayout) return
    const top = element.scrollTop
    const index = computeListWindow({
      count: suggestions!.length,
      offsets: wrapLayout.offsetAt,
      viewportStart: top,
      viewportEnd: top,
      overscan: 0,
      focusedIndex: undefined,
    }).start
    const anchor = revealWrapped.current
      ? undefined
      : {
          index,
          inset: top - wrapLayout.offsetAt(index),
          atEnd: top > 0 && element.scrollHeight - element.clientHeight - top < 1,
        }
    const publish = () => setWrapMeasurement({ estimate: wrapEstimate, layout, anchor })
    publish()
  }, [suggestions, wrapEstimate, wrapLayout, wrapWindow])

  useLayoutEffect(() => {
    const element = container.current
    if (element === null || measured?.anchor === undefined || revealWrapped.current) return
    const { anchor, layout } = measured
    element.scrollTop = anchor.atEnd ? element.scrollHeight : layout.offsetAt(anchor.index) + anchor.inset
    setScrollTop(element.scrollTop)
  }, [measured])

  useLayoutEffect(() => {
    const element = container.current
    if (wrapLayout === undefined || element === null || selectedIndex === undefined || !revealWrapped.current) return
    const top = wrapLayout.offsetAt(selectedIndex)
    const bottom = wrapLayout.offsetAt(selectedIndex + 1)
    const height = element.clientHeight
    if (top < element.scrollTop || bottom - top > height) element.scrollTop = top
    else if (bottom > element.scrollTop + height) element.scrollTop = bottom - height
    const selected = element.querySelector<HTMLElement>('[aria-selected="true"]')
    if (selected?.getBoundingClientRect().height === bottom - top && element.scrollTop === scrollTop)
      revealWrapped.current = false
    if (element.scrollTop !== scrollTop) setScrollTop(element.scrollTop)
  }, [left, top, rowTop, scrollTop, selectedIndex, wrapLayout])

  if (presentation === undefined) return null
  const { popup } = presentation
  const items = popup.suggestions
  const { start, end } =
    wrapWindow ?? (windowed ? completionWindow(items.length, scrollTop) : { start: 0, end: items.length })
  const indices = Array.from({ length: end - start }, (_, offset) => start + offset)
  if (wrapWindow?.pinnedIndex !== undefined) indices.push(wrapWindow.pinnedIndex)
  const options = indices.map((index) => {
    const suggestion = items[index]!
    const selected = index === popup.selected
    return (
      <div
        key={suggestion.id}
        role="option"
        aria-selected={selected}
        aria-posinset={windowed ? index + 1 : undefined}
        aria-setsize={windowed ? items.length : undefined}
        className={selected ? 'date-popup-option date-popup-selected' : 'date-popup-option'}
        style={
          windowed
            ? {
                top: (wrapLayout?.offsetAt(index) ?? index * COMPLETION_ROW_HEIGHT) - scrollTop,
                ...(wrapLayout === undefined
                  ? { height: COMPLETION_ROW_HEIGHT }
                  : { minHeight: COMPLETION_ROW_HEIGHT }),
              }
            : undefined
        }
        onMouseDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          accept(index)
        }}
      >
        <OptionText suggestion={suggestion} />
      </div>
    )
  })
  return (
    <div
      ref={container}
      className="date-popup"
      data-windowed={windowed || undefined}
      style={{ left, top }}
      onScroll={
        windowed
          ? (event) => {
              const top = event.currentTarget.scrollTop
              if (top !== scrollTop) flushSync(() => setScrollTop(top))
            }
          : undefined
      }
    >
      {windowed && (
        <div className="date-popup-sizing" aria-hidden="true">
          <div className="date-popup-option">
            <OptionText suggestion={items[currentSizing?.widest ?? 0]!} />
          </div>
        </div>
      )}
      <div
        role="listbox"
        aria-label={popup.listLabel}
        className={windowed ? 'date-popup-window' : undefined}
        data-wrap={wrapLayout !== undefined || undefined}
        style={windowed ? { height: wrapLayout?.total ?? items.length * COMPLETION_ROW_HEIGHT } : undefined}
      >
        {windowed ? <div className="date-popup-window-anchor">{options}</div> : options}
      </div>
      <div className="date-popup-footer">↑ ↓ select · Enter/Tab accept · Esc dismiss</div>
    </div>
  )
}
