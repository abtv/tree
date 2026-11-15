import { locateNode, type AttachmentId, type Document, type NodeId, type TreeNode } from '../domain/document'

interface QueuedImage {
  kind: 'append' | 'index' | 'reindex'
  nodeId: NodeId
  attachmentId: AttachmentId
  canceled: boolean
}

export type ImageToTextJob = Readonly<QueuedImage>
export type ImageToTextAdmission = 'queued' | 'duplicate' | 'full' | 'suspended'

type DrainState = { phase: 'idle' } | { phase: 'draining'; active: QueuedImage | undefined }

/** Owns recognition scheduling; the store executes native work and applies its results. */
export class ImageToTextQueue {
  private readonly pending: QueuedImage[] = []
  private drain: DrainState = { phase: 'idle' }
  private suspensions = 0

  public get suspended(): boolean {
    return this.suspensions > 0
  }

  public get size(): number {
    return this.pending.length + (this.drain.phase === 'draining' && this.drain.active !== undefined ? 1 : 0)
  }

  public enqueueExplicit(nodeId: NodeId, attachmentId: AttachmentId): ImageToTextAdmission {
    if (this.suspended) return 'suspended'
    let explicit = 0
    for (const job of this.jobs()) {
      if (job.kind !== 'append') continue
      if (!job.canceled && job.nodeId === nodeId) return 'duplicate'
      explicit++
    }
    if (explicit >= 20) return 'full'
    this.pending.push({ kind: 'append', nodeId, attachmentId, canceled: false })
    return 'queued'
  }

  public enqueueIndex(nodeId: NodeId, attachmentId: AttachmentId): boolean {
    if (this.suspended) return false
    this.pending.push({ kind: 'index', nodeId, attachmentId, canceled: false })
    return true
  }

  public enqueueReindex(document: Document): void {
    if (this.suspended) return
    const pending = new Set<AttachmentId>()
    for (const job of this.jobs()) if (!job.canceled) pending.add(job.attachmentId)
    const visit = (nodes: readonly TreeNode[]): void => {
      for (const node of nodes) {
        const attachmentId = node.attachment?.id
        if (attachmentId !== undefined && !pending.has(attachmentId)) {
          pending.add(attachmentId)
          this.pending.push({ kind: 'reindex', nodeId: node.id, attachmentId, canceled: false })
        }
        visit(node.children)
      }
    }
    visit(document.roots)
  }

  public reconcile(document: Document): void {
    for (const job of this.jobs()) {
      if (job.canceled || locateNode(document, job.nodeId)?.node.attachment?.id === job.attachmentId) continue
      const owner = job.kind === 'reindex' ? findOwner(document.roots, job.attachmentId) : undefined
      if (owner === undefined) job.canceled = true
      else job.nodeId = owner.id
    }
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const job = this.pending[index]!
      if (job.kind !== 'append' && job.canceled) this.pending.splice(index, 1)
    }
  }

  public suspend(): () => void {
    this.suspensions++
    for (const job of this.jobs()) job.canceled = true
    let resumed = false
    return () => {
      if (resumed) return
      resumed = true
      this.suspensions--
    }
  }

  public start(): boolean {
    if (this.drain.phase !== 'idle') return false
    this.drain = { phase: 'draining', active: undefined }
    return true
  }

  public next(): ImageToTextJob | undefined {
    if (this.drain.phase !== 'draining' || this.drain.active !== undefined) return undefined
    this.drain.active = this.pending.shift()
    return this.drain.active
  }

  public complete(job: ImageToTextJob): void {
    if (this.drain.phase === 'draining' && this.drain.active === job) this.drain.active = undefined
  }

  public finish(): void {
    if (this.drain.phase === 'draining' && this.drain.active === undefined) this.drain = { phase: 'idle' }
  }

  private *jobs(): Iterable<QueuedImage> {
    if (this.drain.phase === 'draining' && this.drain.active !== undefined) yield this.drain.active
    yield* this.pending
  }
}

function findOwner(nodes: readonly TreeNode[], attachmentId: AttachmentId): TreeNode | undefined {
  for (const node of nodes) {
    if (node.attachment?.id === attachmentId) return node
    const child = findOwner(node.children, attachmentId)
    if (child !== undefined) return child
  }
  return undefined
}
