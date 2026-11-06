import type { ElectronApplication, Page } from '@playwright/test'

type ProcessMemory = { type: string; workingSetSize: number }

/** Request compositor work without showing or focusing the native window. */
export async function renderMemoryFrame(app: ElectronApplication, window: Page): Promise<void> {
  const main = await app.browserWindow(window)
  try {
    const empty = await main.evaluate(async (main) => {
      const frame = await main.webContents.capturePage({ x: 0, y: 0, width: 1, height: 1 })
      return frame.isEmpty()
    })
    if (empty) throw new Error('Memory warm-up captured an empty frame')
  } finally {
    await main.dispose()
  }
}

/** Sample a complete process footprint before using it as a growth baseline. */
export async function collectWithGpuMemory<T extends { processes: ProcessMemory[] }>(
  collect: () => Promise<T>,
  render: () => Promise<void>,
): Promise<T> {
  const deadline = Date.now() + 10_000
  let processes: ProcessMemory[] = []
  let rendered = false
  const timeoutError = () => new Error(`GPU memory was unavailable for 10 seconds: ${JSON.stringify(processes)}`)
  const beforeDeadline = async <R>(operation: () => Promise<R>): Promise<R> => {
    if (Date.now() >= deadline) throw timeoutError()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        operation(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(timeoutError()), deadline - Date.now())
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  for (;;) {
    const sample = await beforeDeadline(collect)
    processes = sample.processes
    if (
      sample.processes.some(
        ({ type, workingSetSize }) => type === 'GPU' && Number.isFinite(workingSetSize) && workingSetSize > 0,
      )
    )
      return sample

    if (!rendered) {
      await beforeDeadline(render)
      rendered = true
    } else {
      await beforeDeadline(() => new Promise((resolve) => setTimeout(resolve, 100)))
    }
  }
}
