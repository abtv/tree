import { locateNode, type Document, type TreeNode } from '../domain/document'
import {
  SUMMARY_INPUT_BYTES,
  SUMMARY_INTERMEDIATE_BYTES,
  SUMMARY_MAX_NODES,
  SUMMARY_MAX_REQUESTS,
  SUMMARY_MAX_SOURCE_BYTES,
  type SummarizationPort,
} from '../shared/summarize'

export interface SummaryState {
  readonly available: boolean
  readonly running: boolean
  readonly message?: string
}
export interface SummarySelection {
  readonly anchorId: string
  readonly focusId: string
}
const encoder = new TextEncoder()
const bytes = (text: string): number => encoder.encode(text).length

/** Whole-node Visual ranges use real siblings, including their collapsed descendants. */
export function summaryRoots(document: Document, currentId: string, selection?: SummarySelection): readonly TreeNode[] {
  if (selection === undefined) {
    const node = locateNode(document, currentId)?.node
    return node === undefined ? [] : [node]
  }
  const anchor = locateNode(document, selection.anchorId)
  const focus = anchor?.siblings.findIndex((node) => node.id === selection.focusId) ?? -1
  if (anchor === undefined || focus < 0) return []
  return anchor.siblings.slice(Math.min(anchor.index, focus), Math.max(anchor.index, focus) + 1)
}

/** A bounded rolling reduction per branch; no flattened copies of every subtree. */
export async function summarizeForest(
  roots: readonly TreeNode[],
  reduce: (text: string, final: boolean) => Promise<string>,
  signal: AbortSignal,
  progress: (completed: number) => void,
): Promise<string> {
  let nodes = 0
  let sourceBytes = 0
  let requests = 0
  let hasText = false
  const check = (): void => {
    signal.throwIfAborted()
  }
  const compress = async (text: string, final = false): Promise<string> => {
    check()
    if (++requests > SUMMARY_MAX_REQUESTS)
      throw new Error('The selected notes require too many summarization steps. Select a smaller branch.')
    const result = (await reduce(text, final)).trim()
    check()
    if (!result || (!final && bytes(result) > SUMMARY_INTERMEDIATE_BYTES))
      throw new Error('The model could not produce a compact summary. Please try a smaller branch.')
    progress(requests)
    return result
  }
  interface Frame {
    nodes: readonly TreeNode[]
    index: number
    text: string
  }
  const stack: Frame[] = [{ nodes: roots, index: 0, text: '' }]
  const append = async (frame: Frame, text: string): Promise<void> => {
    // Code points are bounded individually, preserving surrogate pairs in long node text.
    let block = ''
    let blockBytes = 0
    const push = async (): Promise<void> => {
      if (bytes(frame.text) + blockBytes + 1 > SUMMARY_INPUT_BYTES) frame.text = await compress(frame.text)
      frame.text += `${frame.text ? '\n' : ''}${block}`
      block = ''
      blockBytes = 0
    }
    for (const point of text) {
      const code = point.codePointAt(0)!
      const size = code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
      if (blockBytes + size > SUMMARY_INPUT_BYTES - SUMMARY_INTERMEDIATE_BYTES - 2) await push()
      block += point
      blockBytes += size
    }
    if (block) await push()
  }
  while (stack.length > 0) {
    check()
    const frame = stack.at(-1)!
    const node = frame.nodes[frame.index++]
    if (node !== undefined) {
      if (
        ++nodes > SUMMARY_MAX_NODES ||
        node.text.length > SUMMARY_MAX_SOURCE_BYTES ||
        (sourceBytes += bytes(node.text)) > SUMMARY_MAX_SOURCE_BYTES
      )
        throw new Error('The selected notes are too large to summarize. Select a smaller branch.')
      if (nodes % 128 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
        check()
      }
      if (node.text.trim()) hasText = true
      // A child frame retains parent text as context; completed children merge in tree order.
      const child: Frame = { nodes: node.children, index: 0, text: '' }
      await append(child, `Node at level ${stack.length}: ${node.text}`)
      stack.push(child)
    } else {
      stack.pop()
      if (stack.length === 0) {
        if (!hasText) throw new Error('The selected nodes contain no text to summarize.')
        return compress(frame.text, true)
      }
      await append(stack.at(-1)!, frame.text)
    }
  }
  throw new Error('The selected nodes contain no text to summarize.')
}

export class Summarization {
  private state: SummaryState = { available: false, running: false }
  private readonly listeners = new Set<() => void>()
  private job: { id: string; abort: AbortController; canceling?: Promise<boolean | void> } | undefined
  private availabilityGeneration = 0
  private suspended = 0
  public constructor(private readonly port?: SummarizationPort) {}
  public getSnapshot = (): SummaryState => this.state
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
  private publish(state: SummaryState): void {
    this.state = state
    for (const listener of this.listeners) listener()
  }
  public refresh = async (): Promise<void> => {
    const generation = ++this.availabilityGeneration
    const available = (await this.port?.available().catch(() => false)) ?? false
    if (generation === this.availabilityGeneration)
      this.publish({ ...this.state, available: available && this.suspended === 0 })
  }
  public suspend(): () => void {
    this.suspended++
    this.cancel()
    this.publish({ ...this.state, available: false })
    return () => {
      this.suspended--
      void this.refresh()
    }
  }
  public cancel = (): void => {
    const job = this.job
    if (job === undefined || job.canceling !== undefined) return
    job.abort.abort()
    job.canceling = this.port?.cancel(job.id) ?? Promise.resolve(true)
    void job.canceling
      .then((canceled) => {
        if (this.job !== job || canceled === false) return
        this.job = undefined
        this.publish({ ...this.state, running: false, message: 'Summarization canceled.' })
      })
      .catch(() => undefined)
  }
  public start(roots: readonly TreeNode[]): void {
    if (!this.port || !this.state.available || this.job || this.suspended > 0) return
    const job: NonNullable<Summarization['job']> = { id: crypto.randomUUID(), abort: new AbortController() }
    this.job = job
    this.publish({ ...this.state, running: true, message: 'Summarizing…' })
    const port = this.port
    void (async () => {
      const timer = setTimeout(() => {
        if (this.job === job) this.cancel()
      }, 15 * 60_000)
      let message = 'Summary copied.'
      try {
        await port.begin(job.id)
        job.abort.signal.throwIfAborted()
        const text = await summarizeForest(
          roots,
          (text, final) => port.reduce(job.id, text, final),
          job.abort.signal,
          (count) => {
            if (this.job === job) this.publish({ ...this.state, message: `Summarizing… ${count} sections processed` })
          },
        )
        job.abort.signal.throwIfAborted()
        if (this.job === job) this.publish({ ...this.state, message: 'Copying summary…' })
        await port.finish(job.id, text)
      } catch (error) {
        message = `Summarization failed. ${error instanceof Error ? error.message : String(error)}`
      } finally {
        clearTimeout(timer)
        await job.canceling?.catch(() => undefined)
        await port.cancel(job.id).catch(() => undefined)
        if (this.job === job) {
          this.job = undefined
          this.publish({ available: this.state.available, running: false, message })
        }
      }
    })()
  }
}
