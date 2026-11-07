import type { ApiError, Reference, Request } from './types.mts'

export function isTransient(error: unknown): boolean {
  return (
    [500, 502, 503, 504].includes((error as ApiError | null)?.status ?? -1) ||
    (error instanceof TypeError && error.message === 'fetch failed') ||
    (error instanceof Error && error.name === 'TimeoutError')
  )
}

export async function retry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation()
    } catch (error) {
      const minimum = (error as ApiError | null)?.retryAfterMs ?? 0
      if (!isTransient(error) || attempt === 3 || minimum > 60000) throw error

      const delay = Math.max(minimum, 1000 * 2 ** attempt + Math.floor(Math.random() * 1000))
      console.error(`GitHub API temporary failure; retrying in ${delay}ms`)
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
      if (await reconcile()) return

      throw error
    }
  })
}
