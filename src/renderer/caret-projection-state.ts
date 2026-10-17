import type { VimCaretState } from './vim-caret-transition'
import type { VimMode } from './vim-editing'

export interface CaretFocus {
  nodeId: string
  cursor: number
  token: number
}

export interface PendingCaretPlacement<Input> {
  nodeId: string
  input?: Input
  cursor: number
  normal: boolean
  revision: number
  focusToken: number | undefined
  /** A replaced input must receive focus before placement. */
  refocus?: boolean
  /** A released drag restores the captured caret after the move's focus intent. */
  restoredCaret?: VimCaretState
}

export interface PendingVisualSelection {
  nodeId: string
  start: number
  end: number
  endpoints?: { anchor: number; focus: number; hadText: boolean }
}

export function pendingCaretAfterModeChange<Input>(
  pending: PendingCaretPlacement<Input> | undefined,
  mode: VimMode,
  revision: number,
): PendingCaretPlacement<Input> | undefined {
  // A change command schedules insertion before switching mode. Keep compatible placement.
  return pending !== undefined && pending.normal === (mode === 'normal') ? { ...pending, revision } : undefined
}

/** One owner for caret authority and the precedence of deferred placement. No DOM or store state. */
export class CaretProjectionState<Input> {
  private currentAuthority: { nodeId?: string; caret: VimCaretState }
  private currentMode: VimMode
  private currentFocus: CaretFocus | undefined
  private consumedFocusToken: number | undefined
  private revision = 0
  private pending: PendingCaretPlacement<Input> | undefined
  private visual: PendingVisualSelection | undefined
  private committed = false
  private committedFocus: CaretFocus | undefined
  private committedMode: VimMode | undefined

  public constructor(focus: CaretFocus | undefined, mode: VimMode) {
    this.currentFocus = focus
    this.currentMode = mode
    this.consumedFocusToken = focus?.token
    this.currentAuthority = { caret: { cursor: focus?.cursor ?? 0, imageActive: false } }
  }

  public get authority(): { readonly nodeId?: string; readonly caret: VimCaretState } {
    return this.currentAuthority
  }

  public get mode(): VimMode {
    return this.currentMode
  }

  public get syncedFocusToken(): number | undefined {
    return this.consumedFocusToken
  }

  public get focusToken(): number | undefined {
    return this.currentFocus?.token
  }

  public get pendingCaret(): PendingCaretPlacement<Input> | undefined {
    return this.pending
  }

  public get currentRevision(): number {
    return this.revision
  }

  /** Gate commit phases explicitly: unrelated renders must not refocus or collapse a selection. */
  public beginCommit(focus: CaretFocus | undefined, mode: VimMode): { focusChanged: boolean; modeChanged: boolean } {
    const focusChanged = !this.committed || focus !== this.committedFocus
    const renderedModeChanged = !this.committed || mode !== this.committedMode
    const modeChanged = focusChanged || renderedModeChanged
    // Event handlers can change mode before React publishes the prop. An unrelated commit
    // carrying that same old prop must not overwrite the event-time mode.
    if (renderedModeChanged) this.currentMode = mode
    this.committed = true
    this.committedFocus = focus
    this.committedMode = mode
    this.currentFocus = focus
    return { focusChanged, modeChanged }
  }

  public changeMode(mode: VimMode): void {
    if (mode === this.mode) return
    this.pending = pendingCaretAfterModeChange(this.pending, mode, ++this.revision)
    this.currentMode = mode
  }

  public requestCaret(
    request: Omit<PendingCaretPlacement<Input>, 'normal' | 'revision' | 'focusToken'>,
    focusToken: number | undefined,
  ): void {
    this.pending = { ...request, normal: false, revision: ++this.revision, focusToken }
  }

  public placeCaret(
    nodeId: string,
    caret: VimCaretState,
    options: { focusToken: number | undefined; fromFocus: boolean; defer: boolean },
  ): void {
    this.invalidateCaret()
    this.currentAuthority = { nodeId, caret }
    if (options.fromFocus) this.consumedFocusToken = options.focusToken
    if (options.defer) {
      this.pending = {
        nodeId,
        cursor: caret.cursor,
        normal: true,
        revision: this.revision,
        focusToken: options.focusToken,
      }
    }
  }

  public invalidateCaret(): void {
    this.pending = undefined
    this.revision += 1
  }

  public consumeFocus(token: number | undefined): void {
    this.consumedFocusToken = token
  }

  public requestVisual(selection: PendingVisualSelection): void {
    this.visual = selection
  }

  public takeVisual(): PendingVisualSelection | undefined {
    const selection = this.visual
    this.visual = undefined
    // Restoring a selection supersedes both passes of the preceding focus projection.
    if (selection !== undefined) this.revision += 1
    return selection
  }

  public takeCaret(): PendingCaretPlacement<Input> | undefined {
    const pending = this.pending
    this.pending = undefined
    return pending
  }

  public restoreDrag(nodeId: string, caret: VimCaretState, focusToken: number | undefined): void {
    this.placeCaret(nodeId, caret, { focusToken, fromFocus: true, defer: false })
  }

  public captureFocusWork(): { token: number | undefined; revision: number } {
    return { token: this.currentFocus?.token, revision: this.revision }
  }

  public isCurrentFocusWork(work: { token: number | undefined; revision: number }): boolean {
    return this.currentFocus?.token === work.token && this.revision === work.revision
  }
}
