import type { NodeId } from '../domain/document'
import type { Clock } from './editor-store-types'

const TEXT_SESSION_BOUNDARY_MILLISECONDS = 5_000

export class EditorTextSession {
  private activeNodeId: NodeId | undefined
  private timer: unknown
  private standaloneNextEdit = false

  public constructor(private readonly clock: Clock) {}

  public end(): void {
    this.activeNodeId = undefined
    if (this.timer !== undefined) {
      this.clock.clearTimeout(this.timer)
      this.timer = undefined
    }
  }

  public isActive(nodeId: NodeId): boolean {
    return this.activeNodeId === nodeId
  }

  public begin(nodeId: NodeId): void {
    this.activeNodeId = nodeId
  }

  public markNextEditStandalone(): void {
    this.end()
    this.standaloneNextEdit = true
  }

  public scheduleBoundary(): void {
    if (this.timer !== undefined) {
      this.clock.clearTimeout(this.timer)
    }
    this.timer = this.clock.setTimeout(() => this.end(), TEXT_SESSION_BOUNDARY_MILLISECONDS)
  }

  public endIfStandalone(): void {
    if (!this.standaloneNextEdit) return
    this.standaloneNextEdit = false
    this.end()
  }
}
