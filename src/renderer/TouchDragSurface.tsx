/**
 * Touch hit areas occupy existing empty space; text keeps the browser's native gestures.
 * Click handlers make the surfaces touch targets too, so touch adjustment does not choose a nearby dot.
 */
export function TouchDragSurface(): React.JSX.Element {
  return (
    <>
      <span
        aria-hidden="true"
        className="node-touch-drag-surface node-touch-drag-gutter"
        onClick={(event) => event.preventDefault()}
      />
      <span
        aria-hidden="true"
        className="node-touch-drag-surface node-touch-drag-end"
        onClick={(event) => event.preventDefault()}
      />
    </>
  )
}
