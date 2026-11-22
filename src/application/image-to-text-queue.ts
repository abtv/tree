import { locateNode, type AttachmentId, type Document, type NodeId, type TreeNode } from '../domain/document'

interface QueuedImage {
  kind: 'index' | 'reindex'
  nodeId: NodeId
  attachmentId: AttachmentId
  canceled: boolean
}

export type ImageToTextJob = Readonly<QueuedImage>

type DrainState = { phase: 'idle' } | { phase: 'draining'; active: QueuedImage | undefined }

/**
 * Owns recognition scheduling; the store executes native work and applies its results.
 * Cancellation removes pending jobs at once, so only the active job, whose native request is
 * already in flight, can be observed with `canceled` set.
 */
export class ImageToTextQueue {
  private readonly pending: QueuedImage[] = []
  private drain: DrainState = { phase: 'idle' }
  private suspensions = 0

  public get suspended(): boolean {
    return this.suspensions > 0
  }

  public get size(): number {
    return this.pending.length + (this.activeJob === undefined ? 0 : 1)
  }

  public enqueueIndex(nodeId: NodeId, attachmentId: AttachmentId): boolean {
    if (this.suspended) return false
    this.pending.push({ kind: 'index', nodeId, attachmentId, canceled: false })
    return true
  }

  public enqueueReindex(document: Document): void {
    if (this.suspended) return
    const pending = new Set<AttachmentId>(this.pending.map((job) => job.attachmentId))
    const active = this.activeJob
    if (active !== undefined && !active.canceled) pending.add(active.attachmentId)
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
    const active = this.activeJob
    if (active !== undefined && !active.canceled && !retainSource(document, active)) active.canceled = true
    let kept = 0
    for (const job of this.pending) if (retainSource(document, job)) this.pending[kept++] = job
    this.pending.length = kept
  }

  public suspend(): () => void {
    this.suspensions++
    this.pending.length = 0
    const active = this.activeJob
    if (active !== undefined) active.canceled = true
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

  private get activeJob(): QueuedImage | undefined {
    return this.drain.phase === 'draining' ? this.drain.active : undefined
  }
}

/** Keeps a job's source current: a reindex job follows its image to another node. */
function retainSource(document: Document, job: QueuedImage): boolean {
  if (locateNode(document, job.nodeId)?.node.attachment?.id === job.attachmentId) return true
  const owner = job.kind === 'reindex' ? findOwner(document.roots, job.attachmentId) : undefined
  if (owner === undefined) return false
  job.nodeId = owner.id
  return true
}

function findOwner(nodes: readonly TreeNode[], attachmentId: AttachmentId): TreeNode | undefined {
  for (const node of nodes) {
    if (node.attachment?.id === attachmentId) return node
    const child = findOwner(node.children, attachmentId)
    if (child !== undefined) return child
  }
  return undefined
}
