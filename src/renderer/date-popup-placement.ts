/**
 * Keep the popup inside the window: it opens below the row, flips above the row when the space
 * below is too small, and shifts left when it would pass the right edge.
 */
export function placeInViewport(
  presentation: { left: number; top: number; rowTop: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const fitsBelow = presentation.top + size.height <= viewport.height
  const fitsAbove = presentation.rowTop - size.height >= 0
  return {
    left: Math.max(0, Math.min(presentation.left, viewport.width - size.width)),
    top: fitsBelow || !fitsAbove ? presentation.top : presentation.rowTop - size.height,
  }
}
