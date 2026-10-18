// Compatibility entry for installed workflows that still invoke the JavaScript filename.
import { fileURLToPath } from 'node:url'
process.argv[1] = fileURLToPath(new URL('./cli.mts', import.meta.url))
await import('./cli.mts')
