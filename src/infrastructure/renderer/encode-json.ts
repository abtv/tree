/** Yield between bounded JSON batches without retaining a task or document after completion. */
async function yieldToInput(): Promise<void> {
  const scheduler = (globalThis as typeof globalThis & { scheduler?: { yield(): Promise<void> } }).scheduler
  if (scheduler !== undefined) await scheduler.yield()
  else await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

type Frame =
  | { kind: 'value'; value: unknown }
  | { kind: 'array'; value: unknown[]; index: number }
  | { kind: 'object'; value: Record<string, unknown>; keys: string[]; index: number; first: boolean }

/** Plain persisted data only. Keep one traversal stack, rather than a generator per field. */
function* tokens(value: unknown): Generator<string> {
  const stack: Frame[] = [{ kind: 'value', value }]
  const ancestors = new Set<object>()

  while (stack.length > 0) {
    const frame = stack.pop()!
    if (frame.kind === 'value') {
      const current = frame.value
      if (typeof current !== 'object' || current === null) {
        yield JSON.stringify(current) ?? 'null'
        continue
      }
      if (ancestors.has(current)) throw new TypeError('Cannot encode circular JSON data.')
      ancestors.add(current)
      if (Array.isArray(current)) {
        stack.push({ kind: 'array', value: current, index: 0 })
        yield '['
      } else {
        stack.push({
          kind: 'object',
          value: current as Record<string, unknown>,
          keys: Object.keys(current),
          index: 0,
          first: true,
        })
        yield '{'
      }
      continue
    }

    if (frame.kind === 'array') {
      if (frame.index === frame.value.length) {
        ancestors.delete(frame.value)
        yield ']'
      } else {
        const index = frame.index++
        stack.push(frame, { kind: 'value', value: frame.value[index] })
        if (index > 0) yield ','
      }
      continue
    }

    let key: string | undefined
    while (frame.index < frame.keys.length) {
      const candidate = frame.keys[frame.index++]!
      if (frame.value[candidate] !== undefined) {
        key = candidate
        break
      }
    }
    if (key === undefined) {
      ancestors.delete(frame.value)
      yield '}'
    } else {
      stack.push(frame, { kind: 'value', value: frame.value[key] })
      yield `${frame.first ? '' : ','}${JSON.stringify(key)}:`
      frame.first = false
    }
  }
}

/**
 * Avoid passing the document graph through contextBridge, which copies/freezes every object.
 * Encoding yields to input; the final primitive string keeps the existing IPC save atomic.
 */
export async function encodeJson(
  value: unknown,
  yieldWork: () => Promise<void> = yieldToInput,
  now: () => number = () => performance.now(),
): Promise<string> {
  const chunks: string[] = []
  let parts: string[] = []
  let characters = 0
  let work = 0
  let started = now()

  for (const token of tokens(value)) {
    parts.push(token)
    characters += token.length
    if (characters >= 32_768) {
      chunks.push(parts.join(''))
      parts = []
      characters = 0
    }
    work += 1
    if (work % 64 === 0 && now() - started >= 3) {
      await yieldWork()
      started = now()
    }
  }

  chunks.push(parts.join(''))
  return chunks.join('')
}
