import type { DayNumber } from '../domain/calendar-date'
import type { DateTextRange } from '../domain/date-recognition'
import { recognizeCompletion, type CompletionMatch } from './completion-sources'

export type CompletionPopupState = CompletionMatch & {
  readonly nodeId: string
  readonly text: string
  readonly selected: number
}

/** Single transient owner. Only explicit typing may open it; observation only closes. */
export class CompletionController {
  public popup: CompletionPopupState | undefined

  public close(): void {
    this.popup = undefined
  }

  public edit(nodeId: string, text: string, caret: number, today: DayNumber, excluded: readonly DateTextRange[]): void {
    const match = recognizeCompletion(text, caret, today)
    if (match === undefined || excluded.some((range) => range.start < match.end && range.end > match.start)) {
      this.close()
      return
    }
    const previous = this.popup
    const suggestion =
      match.retainsSelection && previous?.nodeId === nodeId && previous.start === match.start
        ? previous.suggestions[previous.selected]
        : undefined
    const retained =
      suggestion === undefined ? -1 : match.suggestions.findIndex((candidate) => candidate.id === suggestion.id)
    this.popup = { ...match, nodeId, text, selected: Math.max(0, retained) }
  }

  public observe(nodeId: string | undefined, text: string, start: number, end: number, eligible: boolean): void {
    const popup = this.popup
    if (popup === undefined) return
    if (
      !eligible ||
      nodeId !== popup.nodeId ||
      text !== popup.text ||
      start !== end ||
      start < popup.start ||
      start > popup.end
    )
      this.close()
  }

  public move(direction: -1 | 1): void {
    const popup = this.popup
    if (popup === undefined) return
    this.popup = {
      ...popup,
      selected: (popup.selected + direction + popup.suggestions.length) % popup.suggestions.length,
    }
  }
}
