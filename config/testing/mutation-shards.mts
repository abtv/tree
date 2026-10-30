/** Validate the shared local/CI selector without duplicating mutation file lists. */
export function mutationShard(value: string | undefined) {
  if (!value) return undefined
  if (!['domain', 'application', 'renderer'].includes(value)) {
    throw new Error(`Unknown mutation shard: ${value}`)
  }
  return value
}
