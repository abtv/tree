export const COMPLETION_ROW_HEIGHT = 25
export const COMPLETION_MAX_HEIGHT = 200
export const COMPLETION_WINDOW_THRESHOLD = 40

export function completionWindow(count: number, scrollTop: number): { start: number; end: number } {
  const overscan = 2
  return {
    start: Math.max(0, Math.min(count - 1, Math.floor(scrollTop / COMPLETION_ROW_HEIGHT)) - overscan),
    end: Math.min(count, Math.ceil((scrollTop + COMPLETION_MAX_HEIGHT) / COMPLETION_ROW_HEIGHT) + overscan),
  }
}

export function revealCompletionOption(index: number, top: number, height: number): number {
  const rowTop = index * COMPLETION_ROW_HEIGHT
  if (rowTop < top) return rowTop
  return Math.max(top, rowTop + COMPLETION_ROW_HEIGHT - height)
}
