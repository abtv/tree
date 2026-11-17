import type { CaretFocus } from './caret-projection-state'

interface SearchFocusContext {
  draft: boolean
  searchFocused: boolean
}

/** Owns borrowed search focus without depending on DOM elements or React commits. */
export class SearchFocusController {
  private deferred: CaretFocus | undefined
  private borrowed: { focus: CaretFocus; selection: { anchor: number; focus: number } } | undefined

  public constructor(private readonly readContext: () => SearchFocusContext) {}

  public canProjectFocus(): boolean {
    return !this.readContext().draft
  }

  public canProjectCaret(): boolean {
    const context = this.readContext()
    return !context.draft && !context.searchFocused
  }

  public keepsSearchFocus(): boolean {
    return this.readContext().searchFocused
  }

  public completeFocusProjection(focus: CaretFocus, searchKeptFocus: boolean): void {
    this.deferred = searchKeptFocus ? focus : undefined
    if (!searchKeptFocus) this.borrowed = undefined
  }

  public editorFocused(): void {
    this.deferred = undefined
    this.borrowed = undefined
  }

  public borrowSelection(focus: CaretFocus, selection: { anchor: number; focus: number }): void {
    this.borrowed = { focus, selection }
  }

  public takeSelection(focus: CaretFocus, selectedNodeId: string): { anchor: number; focus: number } | undefined {
    const borrowed = this.borrowed
    this.borrowed = undefined
    return borrowed?.focus.token === focus.token && borrowed.focus.nodeId === selectedNodeId
      ? borrowed.selection
      : undefined
  }

  public canReadNativeCaret(): boolean {
    return this.deferred === undefined && !this.readContext().searchFocused
  }

  public takeRestoration(focus: CaretFocus, selectedNodeId: string): CaretFocus | undefined {
    const deferred = this.deferred
    this.deferred = undefined
    return deferred?.token === focus.token && deferred.nodeId === selectedNodeId ? deferred : undefined
  }
}
