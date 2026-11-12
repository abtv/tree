import type { AgendaPresentation } from '../application/agenda-state'
import type { RowCaret } from './agenda-row-caret'

type PendingPosition = { readonly kind: 'idle' } | { readonly kind: 'pending'; readonly top: number }
export type AgendaReveal = 'today' | 'native-line' | 'synthetic-line' | 'keyboard-row' | 'pointer-row' | 'cancel'

interface CommittedRow<Document, Rows> {
  readonly key: string
  readonly nodeId: string | undefined
  readonly document: Document
  readonly rows: Rows
}

/** Agenda intent only. The shared viewport executor still owns DOM geometry and cancellation. */
export class AgendaViewportState<Document, Rows> {
  private opening: 'pending' | 'consumed' = 'pending'
  private navigation: 'keyboard' | 'pointer' | 'none' = 'keyboard'
  private end: 'following' | 'free' = 'free'
  private restoration: PendingPosition = { kind: 'idle' }
  private anchor: PendingPosition = { kind: 'idle' }
  private suppressRowReveal = false
  private line: RowCaret | undefined
  private presentation: AgendaPresentation | undefined
  private previous: CommittedRow<Document, Rows> | undefined

  public mount(): void {
    this.opening = 'pending'
  }

  public navigate(kind: 'keyboard' | 'pointer' | 'none'): void {
    this.navigation = kind
  }

  public presentationChanged(next: AgendaPresentation): 'restore' | 'start' | 'none' {
    const previous = this.presentation
    this.presentation = next
    if (previous?.kind === 'focused-day' && next.kind === 'timeline') {
      this.restoration = { kind: 'pending', top: previous.timelineReturn.scrollTop }
      this.navigation = 'none'
      return 'restore'
    }
    if (previous?.kind === 'timeline' && next.kind === 'focused-day') {
      this.navigation = 'keyboard'
      return 'start'
    }
    return 'none'
  }

  public takeRestoration(measured: boolean): number | undefined {
    if (!measured || this.restoration.kind === 'idle') return undefined
    const top = this.restoration.top
    this.restoration = { kind: 'idle' }
    return top
  }

  public followEnd(following: boolean): void {
    this.end = following ? 'following' : 'free'
  }

  public get followsEnd(): boolean {
    return this.end === 'following'
  }

  /** Called before React changes the old row's geometry. Unchanged projections need no measure. */
  public anchorSource(next: Omit<CommittedRow<Document, Rows>, 'key'>): string | undefined {
    const last = this.previous
    return last !== undefined &&
      last.nodeId !== undefined &&
      last.nodeId === next.nodeId &&
      last.document !== next.document &&
      last.rows !== next.rows
      ? last.key
      : undefined
  }

  public captureAnchor(top: number | undefined): void {
    if (top !== undefined && this.anchor.kind === 'idle') this.anchor = { kind: 'pending', top }
  }

  /** Suppression lasts through this commit even when the measured correction consumes the anchor. */
  public commit(row: CommittedRow<Document, Rows>, measured: boolean): number | undefined {
    this.previous = row
    this.suppressRowReveal = this.anchor.kind === 'pending'
    if (!measured || this.anchor.kind === 'idle') return undefined
    const top = this.anchor.top
    this.anchor = { kind: 'idle' }
    return top
  }

  public takeReveal(openingToday: boolean, line: 'native' | 'synthetic' | 'none'): AgendaReveal {
    const opening = this.opening
    this.opening = 'consumed'
    if (opening === 'pending' && openingToday) return 'today'
    if (line !== 'none') return line === 'native' ? 'native-line' : 'synthetic-line'
    if (this.suppressRowReveal || this.navigation === 'none') return 'cancel'
    return this.navigation === 'keyboard' ? 'keyboard-row' : 'pointer-row'
  }

  public revealLine(caret: RowCaret): void {
    this.line = caret
  }

  /** Runs after whole-row effects: a same-row visual-line motion replaces their intent. */
  public takeLine(): RowCaret | undefined {
    const line = this.line
    this.line = undefined
    return line
  }
}
