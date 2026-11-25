import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { tagGroupLabel, tagPrefix } from '../domain/tags'
import { computeListWindow, ROW_HEIGHT_ESTIMATE } from './list-window'
import { SearchResultLayout } from './search-result-layout'
import { TagSuggestionText } from './TagSuggestionText'

interface Props {
  names: readonly string[]
  query: string
  selected: number
  accept(index: number): void
}

function Suggestion({ names, query, selected, accept, index, top }: Props & { index: number; top?: number }) {
  const active = index === selected
  const windowed = top !== undefined
  const style: CSSProperties | undefined = windowed ? { position: 'absolute', insetInline: 0, top } : undefined
  return (
    <div
      role="option"
      data-suggestion-index={windowed ? index : undefined}
      data-result-divider={index < names.length - 1 && !active && index + 1 !== selected ? '' : undefined}
      aria-selected={active}
      aria-posinset={windowed ? index + 1 : undefined}
      aria-setsize={windowed ? names.length : undefined}
      className={`node-search-tag${active ? ' command-row-selected' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => accept(index)}
      ref={
        !windowed && active
          ? (element) => {
              element?.scrollIntoView({ block: 'nearest' })
            }
          : undefined
      }
      style={style}
    >
      <TagSuggestionText name={names[index]!} query={query} />
    </div>
  )
}

interface Measurement {
  epoch: symbol
  width: number
  height: number
  layout: SearchResultLayout
  anchor?: { index: number; inset: number; end: boolean }
}

function WindowedSuggestions(props: Props & { label: string }): React.JSX.Element {
  const { names, selected, label } = props
  const scroller = useRef<HTMLDivElement>(null)
  const activeIndex = useRef(selected)
  const reveal = useRef(true)
  const [scrollTop, setScrollTop] = useState(0)
  const [measurement, setMeasurement] = useState<Measurement>()
  const epoch = useMemo(() => Symbol(`suggestions:${names.length}`), [names])
  const estimate = useMemo(() => SearchResultLayout.estimate(names.length, () => ROW_HEIGHT_ESTIMATE), [names.length])
  const current = measurement?.epoch === epoch ? measurement : undefined
  const layout = current?.layout ?? estimate
  const { start, end, pinnedIndex } = computeListWindow({
    count: names.length,
    offsets: layout.offsetAt,
    viewportStart: scrollTop,
    viewportEnd: scrollTop + (current?.height ?? 6 * ROW_HEIGHT_ESTIMATE),
    overscan: 3,
    focusedIndex: selected,
  })
  const indices = Array.from({ length: end - start }, (_, index) => start + index)
  if (pinnedIndex !== undefined) {
    if (pinnedIndex < start) indices.unshift(pinnedIndex)
    else indices.push(pinnedIndex)
  }

  useLayoutEffect(() => {
    activeIndex.current = selected
    reveal.current = true
  }, [epoch, selected])

  useLayoutEffect(() => {
    const list = scroller.current
    if (!list) return
    const measure = () => {
      const width = list.clientWidth
      const height = list.clientHeight
      if (width === 0 || height === 0) return
      const widthChanged = current !== undefined && current.width !== width
      const base = widthChanged ? estimate : layout
      const heights = new Map<number, number>()
      for (const row of list.querySelectorAll<HTMLElement>('[data-suggestion-index]')) {
        const index = Number(row.dataset.suggestionIndex)
        const height = row.getBoundingClientRect().height
        if (height > 0 && Math.abs(base.heightAt(index) - height) > 0.001) heights.set(index, height)
      }
      const next = base.withMeasurements(heights)
      if (current?.width === width && current.height === height && next === layout) return
      const top = list.scrollTop
      const active = activeIndex.current
      if (
        current &&
        (widthChanged || current.height !== height) &&
        active >= 0 &&
        active < names.length &&
        layout.offsetAt(active) < top + current.height &&
        layout.offsetAt(active + 1) > top
      ) {
        // Keep a previously visible selection in view when wrapping changes. Leave pointer scrolls alone.
        reveal.current = true
      }
      const index = computeListWindow({
        count: names.length,
        offsets: layout.offsetAt,
        viewportStart: top,
        viewportEnd: top,
        overscan: 0,
        focusedIndex: undefined,
      }).start
      setMeasurement({
        epoch,
        width,
        height,
        layout: next,
        // Preserve a manually scrolled position when new wrapped rows acquire real heights.
        ...(!reveal.current && {
          anchor: { index, inset: top - layout.offsetAt(index), end: top > 0 && list.scrollHeight - height - top < 1 },
        }),
      })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(list)
    return () => observer?.disconnect()
  }, [current, epoch, estimate, layout, names.length, start, end, pinnedIndex])

  useLayoutEffect(() => {
    const list = scroller.current
    if (!list || !current?.anchor || reveal.current) return
    const { index, inset, end } = current.anchor
    list.scrollTop = end ? list.scrollHeight : current.layout.offsetAt(index) + inset
    setScrollTop(list.scrollTop)
  }, [current])

  useLayoutEffect(() => {
    const list = scroller.current
    if (!list || !reveal.current) return
    const row = list.querySelector<HTMLElement>('[aria-selected=true]')
    if (!row) return
    const top = list.scrollTop
    row.scrollIntoView({ block: 'nearest' })
    if (list.scrollTop === top && top === scrollTop) reveal.current = false
    else setScrollTop(list.scrollTop)
  }, [current, epoch, scrollTop, selected])

  return (
    <div
      ref={scroller}
      className="node-search-tags node-search-tags-windowed"
      role="listbox"
      aria-label={label}
      onScroll={(event) => {
        const top = event.currentTarget.scrollTop
        if (top !== scrollTop) flushSync(() => setScrollTop(top))
      }}
    >
      <div style={{ height: layout.total, position: 'relative', overflow: 'visible clip' }}>
        {indices.map((index) => (
          <Suggestion key={names[index]} {...props} index={index} top={layout.offsetAt(index)} />
        ))}
      </div>
    </div>
  )
}

export function GlobalSearchSuggestions(props: Props): React.JSX.Element {
  const { names, query } = props
  const label = tagGroupLabel(tagPrefix(query)!)
  return (
    <>
      <div className="node-search-section-title node-search-tags-heading">{label}</div>
      {names.length > 40 ? (
        <WindowedSuggestions {...props} label={label} />
      ) : (
        <div className="node-search-tags" role="listbox" aria-label={label}>
          {names.map((name, index) => (
            <Suggestion key={name} {...props} index={index} />
          ))}
        </div>
      )}
    </>
  )
}
