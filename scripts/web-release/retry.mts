import type { ApiError, Reference, Request } from './types.mts'

export function isTransient(error: unknown): boolean {
  return (
    (error as ApiError | null)?.rateLimited === true ||
    [500, 502, 503, 504].includes((error as ApiError | null)?.status ?? -1) ||
    (error instanceof TypeError && error.message === 'fetch failed') ||
    (error instanceof Error && error.name === 'TimeoutError')
  )
}

export async function retry<T>(operation: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + 90000
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const failure = error as ApiError | null
      const minimum = failure?.retryAfterMs ?? 0
      if (!isTransient(error) || attempt === 3 || (!failure?.rateLimited && minimum > 60000)) throw error

      const delay = Math.max(
        minimum * (failure?.rateLimited ? 2 ** attempt : 1),
        1000 * 2 ** attempt + Math.floor(Math.random() * 1000),
      )
      if (Date.now() + delay > deadline) throw error

      const reason = failure?.rateLimited ? 'rate limit' : 'temporary failure'
      console.error(`GitHub API ${reason}; retrying in ${delay}ms`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export async function advanceReference(root: string, base: string, sha: string, request: Request, token: string) {
  const options = { token }
  let uncertain = false
  async function reconcile() {
    const head = (await request(`${root}/git/ref/heads/main`, options)) as Reference
    if (head.object.sha === sha) return true
    if (head.object.sha !== base) throw new Error('Hosting branch changed during publication; publication stopped')
    uncertain = false
    return false
  }

  await retry(async () => {
    if (uncertain && (await reconcile())) return

    try {
      await request(`${root}/git/refs/heads/main`, {
        ...options,
        method: 'PATCH',
        body: { sha, force: false },
      })
    } catch (error) {
      if (!isTransient(error)) throw error

      uncertain = true
      // A rate limit applies to reconciliation reads too. Wait before any request.
      if ((error as ApiError).rateLimited) throw error
      if (await reconcile()) return

      throw error
    }
  })
}
