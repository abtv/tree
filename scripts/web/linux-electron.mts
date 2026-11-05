import { runElectron } from './chromium.mts'

try {
  process.exitCode = runElectron(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
