import type { Page } from '@playwright/test'

/** Playwright's clock pauses timers, not postTask. Call after installing the clock. */
export async function controlPostedTasksWithClock(window: Page): Promise<void> {
  await window.evaluate(() => {
    if (typeof globalThis.scheduler?.postTask !== 'function') return
    const postTask = globalThis.scheduler.postTask.bind(globalThis.scheduler)
    globalThis.scheduler.postTask = (callback, options) =>
      new Promise((resolve, reject) => {
        setTimeout(() => {
          void postTask(callback, options).then(resolve, reject)
        }, 0)
      })
  })
}
