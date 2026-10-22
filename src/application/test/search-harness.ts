import { createSearchExecutor, type SearchScheduler, type SearchRequest, type SearchResult } from '../search-executor'

export function searchHarness(budget = 32) {
  const callbacks = new Set<() => void>()
  let slices = 0
  const scheduler: SearchScheduler = {
    schedule(callback) {
      callbacks.add(callback)
      return () => {
        callbacks.delete(callback)
      }
    },
  }
  function tick() {
    const callback = callbacks.values().next().value
    if (callback === undefined) return false
    callbacks.delete(callback)
    callback()
    slices++
    return true
  }
  function flush() {
    let remaining = 1_000_000
    while (tick()) {
      if (--remaining === 0) throw new Error('Search did not settle')
    }
  }
  const executor = createSearchExecutor(scheduler, budget)
  function run(request: SearchRequest): SearchResult {
    let result: SearchResult | undefined
    executor.execute(request, (value) => {
      result = value
    })
    flush()
    if (result === undefined) throw new Error('Missing result')
    return result
  }
  return { executor, scheduler, tick, flush, run, pending: () => callbacks.size, slices: () => slices }
}
