import assert from 'node:assert/strict'
import { runSafari } from './web/safari.mts'

assert.equal(process.argv.length, 2, 'Use npm run test:smoke:safari without arguments')
const started = performance.now()
await runSafari(true)
const elapsed = performance.now() - started
assert(elapsed <= 20_000, `Safari smoke including cleanup exceeded 20 seconds: ${elapsed.toFixed(0)}ms`)
console.log(`Safari smoke including startup and cleanup: ${(elapsed / 1000).toFixed(2)}s`)
