import fc from 'fast-check'

import { propertyRuns } from './property-runs'

// Property tests explore with a random seed. A failure prints its seed and path; set FC_SEED and
// FC_PATH to replay that exact counterexample.
function readInteger(name: string): number | undefined {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return undefined
  const value = Number(raw)
  if (!Number.isInteger(value)) throw new Error(`${name} must be an integer, got "${raw}"`)
  return value
}

const seed = readInteger('FC_SEED')
const path = process.env.FC_PATH

fc.configureGlobal({
  numRuns: propertyRuns(100),
  ...(seed === undefined ? {} : { seed }),
  ...(path === undefined || path === '' ? {} : { path }),
})
