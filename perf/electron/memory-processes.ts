type ProcessMemory = { type: string; workingSetSize: number }

/** Sample a complete process footprint before using it as a growth baseline. */
export async function collectWithGpuMemory<T extends { processes: ProcessMemory[] }>(
  collect: () => Promise<T>,
): Promise<T> {
  const deadline = Date.now() + 10_000
  for (;;) {
    const sample = await collect()
    if (
      sample.processes.some(
        ({ type, workingSetSize }) => type === 'GPU' && Number.isFinite(workingSetSize) && workingSetSize > 0,
      )
    )
      return sample

    if (Date.now() >= deadline)
      throw new Error(`GPU memory was unavailable for 10 seconds: ${JSON.stringify(sample.processes)}`)

    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
