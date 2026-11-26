import { useLayoutEffect, useRef, useState, type ComponentPropsWithRef } from 'react'
import { validNodeSearchMarker } from '../domain/node-search-query'
import { isCommittedCompositionInput } from './editor-composition'

type Props = Omit<ComponentPropsWithRef<'input'>, 'value'> & { value: string }

/** Keep native input editing and selection; the inert mirror paints search marker emphasis. */
export function SearchQueryInput({
  ref,
  value,
  onChange,
  onSelect,
  onCompositionStart,
  onCompositionEnd,
  ...props
}: Props): React.JSX.Element {
  const input = useRef<HTMLInputElement | null>(null)
  const mirror = useRef<HTMLSpanElement>(null)
  const [composing, setComposing] = useState(false)
  const tokens = value.split(/(\s+)/u)
  const decorated = !composing && tokens.some((token) => validNodeSearchMarker(token) !== undefined)

  useLayoutEffect(() => {
    const element = input.current
    if (element === null) return
    let frame = 0
    const sync = (): void => {
      if (mirror.current !== null) mirror.current.style.transform = `translateX(${-element.scrollLeft}px)`
    }
    const schedule = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(sync)
    }
    sync()
    schedule()
    element.addEventListener('scroll', sync)
    element.addEventListener('input', schedule)
    element.addEventListener('select', schedule)
    element.addEventListener('keyup', schedule)
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule)
    resize?.observe(element)
    return () => {
      cancelAnimationFrame(frame)
      element.removeEventListener('scroll', sync)
      element.removeEventListener('input', schedule)
      element.removeEventListener('select', schedule)
      element.removeEventListener('keyup', schedule)
      resize?.disconnect()
    }
  }, [value, decorated])

  return (
    <div className="node-search-input-wrap" data-decorated={decorated || undefined}>
      {decorated && (
        <div className="node-search-input-mirror" aria-hidden="true">
          <span ref={mirror}>
            {tokens.map((token, index) => {
              const className = validNodeSearchMarker(token) === undefined ? undefined : 'node-search-match'
              return (
                <span key={index} className={className}>
                  {token}
                </span>
              )
            })}
          </span>
        </div>
      )}
      <input
        {...props}
        value={value}
        ref={(element) => {
          input.current = element
          if (typeof ref === 'function') return ref(element)
          if (ref != null) ref.current = element
        }}
        onChange={(event) => {
          if (composing && isCommittedCompositionInput(event.nativeEvent)) setComposing(false)
          onChange?.(event)
        }}
        onSelect={onSelect}
        onCompositionStart={(event) => {
          setComposing(true)
          onCompositionStart?.(event)
        }}
        onCompositionEnd={(event) => {
          setComposing(false)
          onCompositionEnd?.(event)
        }}
      />
    </div>
  )
}
