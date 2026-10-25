import assert from 'node:assert/strict'
import { runSafari, SAFARI_SMOKE_TIMEOUT_MS } from './web/safari.mts'

assert.equal(process.argv.length, 2, 'Use npm run test:smoke:safari without arguments')
const started = performance.now()
await runSafari(true)
const elapsed = performance.now() - started
assert(
  elapsed <= SAFARI_SMOKE_TIMEOUT_MS,
  `Safari smoke including cleanup exceeded 30 seconds: ${elapsed.toFixed(0)}ms`,
)
console.log(`Safari smoke including startup and cleanup: ${(elapsed / 1000).toFixed(2)}s`)
