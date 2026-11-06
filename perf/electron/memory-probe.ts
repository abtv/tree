import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { ElectronApplication, Page, TestInfo } from '@playwright/test'
import { assertMemoryBudget, type MemoryBudget, type MemoryMetrics } from '../memory-budget'
import { collectWithGpuMemory, renderMemoryFrame } from './memory-processes'

const MIB = 1024 ** 2

// Three Linux arm64 Docker runs on 2026-11-06: normal-scenario maxima in MiB were
// renderer heap 8.81, main heap 13.09, main working set 181.79, renderer 178.75, total 589.34.
// Allow GC/native allocator variation while rejecting large regressions. These are fixed
// ceilings, not limits derived from the current run. Ubuntu x64 remains a different host.
// Existing tighter scenario-specific limits remain; slow leaks below budgets are accepted.
export const sessionMemoryBudget: MemoryBudget = {
  rendererHeap: { maxBytes: 32 * MIB, growthBytes: 8 * MIB },
  mainHeap: { maxBytes: 32 * MIB, growthBytes: 16 * MIB },
  mainWorkingSet: { maxBytes: 256 * MIB, growthBytes: 64 * MIB },
  rendererWorkingSet: { maxBytes: 300 * MIB, growthBytes: 96 * MIB },
  totalWorkingSet: { maxBytes: 800 * MIB, growthBytes: 160 * MIB },
}

export async function collectMemory({
  app,
  window,
}: {
  app: ElectronApplication
  window: Page
}): Promise<MemoryMetrics> {
  const session = await window.context().newCDPSession(window)
  try {
    await session.send('HeapProfiler.collectGarbage')
    const heap = await session.send('Runtime.getHeapUsage')
    const native = await collectWithGpuMemory(
      () =>
        app.evaluate(({ app, BrowserWindow }) => {
          const metrics = app.getAppMetrics()
          const rendererPid = BrowserWindow.getAllWindows()[0]?.webContents.getOSProcessId()
          return {
            processes: metrics.map(({ type, memory }) => ({ type, workingSetSize: memory.workingSetSize })),
            mainHeap: process.memoryUsage().heapUsed,
            mainWorkingSet: (metrics.find((metric) => metric.pid === process.pid)?.memory.workingSetSize ?? 0) * 1024,
            rendererWorkingSet:
              (metrics.find((metric) => metric.pid === rendererPid)?.memory.workingSetSize ?? 0) * 1024,
            totalWorkingSet: metrics.reduce((sum, metric) => sum + metric.memory.workingSetSize * 1024, 0),
          }
        }),
      () => renderMemoryFrame(app, window),
    )
    return {
      rendererHeap: heap.usedSize,
      mainHeap: native.mainHeap,
      mainWorkingSet: native.mainWorkingSet,
      rendererWorkingSet: native.rendererWorkingSet,
      totalWorkingSet: native.totalWorkingSet,
    }
  } finally {
    await session.detach()
  }
}

/** Each sample reaches disk/stdout before assertions, including the failing measurement. */
export class MemoryProbe {
  readonly samples: MemoryMetrics[] = []
  private readonly path: string

  constructor(
    private readonly info: Pick<TestInfo, 'titlePath' | 'outputPath' | 'attachments'>,
    readonly budget: MemoryBudget = sessionMemoryBudget,
  ) {
    this.path = info.outputPath('memory-samples.jsonl')
    mkdirSync(dirname(this.path), { recursive: true })
    info.attachments.push({ name: 'memory-samples', path: this.path, contentType: 'application/x-ndjson' })
    this.write({ event: 'start', platform: process.platform, arch: process.arch, budget })
  }

  private write(data: Record<string, unknown>): void {
    const line = JSON.stringify({ test: this.info.titlePath, ...data })
    appendFileSync(this.path, `${line}\n`)
    console.log(`MEMORY ${line}`)
  }

  record(label: string, metrics: MemoryMetrics, details?: unknown): void {
    this.samples.push(metrics)
    this.write({ event: 'sample', label, metrics, ...(details === undefined ? {} : { details }) })
    assertMemoryBudget(this.samples, this.budget)
  }

  async sample(label: string, launched: { app: ElectronApplication; window: Page }): Promise<MemoryMetrics> {
    const metrics = await collectMemory(launched)
    this.record(label, metrics)
    return metrics
  }
}
