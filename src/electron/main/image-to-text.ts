import { execFile, type ChildProcess } from 'node:child_process'

/** A single bounded native worker. The application owns the user-facing queue. */
export function createImageToText(binary: string) {
  let child: ChildProcess | undefined
  let busy = false
  let generation = 0

  return {
    cancel(): void {
      generation += 1
      child?.kill('SIGKILL')
    },
    async recognize(read: () => Promise<Uint8Array | null>): Promise<string[]> {
      if (busy) throw new Error('Image recognition is already running.')
      busy = true
      const started = generation
      try {
        const png = await read()
        if (started !== generation) throw new Error('Image recognition was canceled.')
        if (png === null) throw new Error('The image could not be loaded.')
        if (png.byteLength === 0 || png.byteLength > 25 * 1024 * 1024)
          throw new Error('The image is invalid or too large.')

        const output = await new Promise<string>((resolve, reject) => {
          child = execFile(
            binary,
            [],
            { timeout: 60_000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
            (error, stdout) => {
              if (error) reject(new Error('Apple Vision could not recognize the image. Please try again.'))
              else resolve(stdout)
            },
          )
          // A failed launch/early exit is reported by execFile; do not leave an unhandled EPIPE.
          child.stdin?.on('error', () => undefined)
          child.stdin?.end(png)
        })
        const paragraphs: unknown = JSON.parse(output)
        if (
          !Array.isArray(paragraphs) ||
          paragraphs.length > 1000 ||
          paragraphs.some((text) => typeof text !== 'string')
        )
          throw new Error('Apple Vision returned an invalid result.')
        return (paragraphs as string[]).map((text) => text.trim())
      } finally {
        child = undefined
        busy = false
      }
    },
  }
}
