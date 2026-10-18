// Compatibility entry for installed workflows that still invoke the JavaScript filename.
import { fileURLToPath } from 'node:url'
process.argv[1] = fileURLToPath(new URL('./publish.mts', import.meta.url))
await import('./publish.mts')
