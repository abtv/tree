import { execFile, type ChildProcess } from 'node:child_process'
import {
  SUMMARY_INPUT_BYTES,
  SUMMARY_OUTPUT_BYTES,
  SUMMARY_MAX_REQUESTS,
  type SummarizationPort,
} from '../../shared/summarize'

/** Fixed executable, one active job and one native inference at a time. */
export function createSummarization(binary: string): SummarizationPort & { cancelAll(): void } {
  let active: string | undefined
  let child: ChildProcess | undefined
  let busy = false
  let inference: Promise<Record<string, unknown>> | undefined
  let availabilityProbe: Promise<boolean> | undefined
  let requests = 0
  let deadline = 0
  const invoke = (available: boolean, payload?: unknown): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const process = execFile(
        binary,
        available ? ['--available'] : [],
        { timeout: available ? 15_000 : 60_000, maxBuffer: 32_768, killSignal: 'SIGKILL' },
        (error, stdout) => {
          if (!available && child === process) child = undefined
          try {
            const result: unknown = JSON.parse(stdout)
            if (typeof result !== 'object' || result === null || Array.isArray(result))
              throw new Error('Invalid model response.')
            if ('error' in result && typeof result.error === 'string') throw new Error(result.error)
            if (error) throw error
            resolve(result as Record<string, unknown>)
          } catch {
            reject(new Error('Apple Intelligence could not summarize the notes. Please try again.'))
          }
        },
      )
      if (!available) child = process
      process.stdin?.on('error', () => undefined)
      process.stdin?.end(payload === undefined ? undefined : JSON.stringify(payload))
    })
  return {
    cancelAll() {
      active = undefined
      child?.kill('SIGKILL')
    },
    available: () => {
      availabilityProbe ??= invoke(true)
        .then(
          (result) => result.available === true,
          () => false,
        )
        .finally(() => {
          availabilityProbe = undefined
        })
      return availabilityProbe
    },
    async begin(id) {
      if (active !== undefined) throw new Error('Summarization is already running.')
      active = id
      requests = 0
      deadline = Date.now() + 15 * 60_000
      await inference?.catch(() => undefined)
      if (active !== id) throw new Error('Summarization was canceled.')
    },
    async reduce(id, text, final) {
      if (id !== active || busy) throw new Error('Summarization is unavailable or already running.')
      if (Buffer.byteLength(text) > SUMMARY_INPUT_BYTES) throw new Error('Summary input is too large.')
      if (++requests > SUMMARY_MAX_REQUESTS || Date.now() > deadline)
        throw new Error('Summarization exceeded its processing limit.')
      busy = true
      try {
        inference = invoke(false, { text, final })
        const result = await inference
        if (id !== active) throw new Error('Summarization was canceled.')
        if (
          typeof result.text !== 'string' ||
          !result.text.trim() ||
          Buffer.byteLength(result.text) > SUMMARY_OUTPUT_BYTES
        )
          throw new Error('Apple Intelligence returned an invalid summary.')
        return result.text.trim()
      } finally {
        busy = false
        inference = undefined
      }
    },
    async finish(id) {
      if (id !== active) throw new Error('Summarization was canceled.')
      active = undefined
    },
    async cancel(id) {
      if (id !== active) return
      active = undefined
      child?.kill('SIGKILL')
    },
  }
}
