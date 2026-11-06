import { runMemory } from './chromium.mts'

try {
  process.exitCode = runMemory(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
