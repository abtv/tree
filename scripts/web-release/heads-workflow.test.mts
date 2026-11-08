import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const { load } = createRequire(import.meta.url)('js-yaml') as {
  load: (text: string) => { jobs: Record<string, { steps: { with: { script: string } }[] }> }
}
const workflow = load(readFileSync('deployment/github-pages/deploy-web-app.yml', 'utf8'))
const sourceSha = 'a'.repeat(40)
const targetSha = 'b'.repeat(40)
const secret = 'sensitive-response-must-not-appear'

function harness(job: 'verify' | 'deploy') {
  const script = workflow.jobs[job]!.steps[0]!.with.script
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ object: { sha: sourceSha } })))
  const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: targetSha } } })
  const info = vi.fn()
  const setOutput = vi.fn()
  const delays: number[] = []
  const env: Record<string, string> = job === 'deploy' ? { EXPECTED_SOURCE_SHA: sourceSha } : {}
  let now = 0
  const run = () =>
    runInNewContext(`(async () => { ${script} })()`, {
      fetch,
      github: { rest: { git: { getRef } } },
      context: { repo: { owner: 'tree-editor', repo: 'tree-editor.github.io' }, sha: targetSha, job },
      process: { env },
      core: { info, setOutput },
      AbortSignal,
      Date: { now: () => now, parse: Date.parse },
      Math: { random: () => 0, floor: Math.floor, max: Math.max },
      setTimeout: (resolve: () => void, delay: number) => {
        delays.push(delay)
        now += delay
        resolve()
      },
    }) as Promise<void>

  return { run, fetch, getRef, info, setOutput, delays, env }
}

describe.each(['verify', 'deploy'] as const)('%s publication head check', (job) => {
  it('recovers from a temporary API failure and logs only the retry number', async () => {
    const h = harness(job)
    h.fetch.mockResolvedValueOnce(new Response(secret, { status: 503 }))

    await h.run()

    expect(h.fetch).toHaveBeenCalledTimes(2)
    expect(h.info.mock.calls).toEqual([['Retry #1']])
    expect(h.delays).toEqual([1000])
    if (job === 'deploy') expect(h.getRef).toHaveBeenCalledTimes(2)
    else expect(h.setOutput).toHaveBeenCalledWith('sha', sourceSha)
  })

  it.each([500, 502, 503, 504])(
    'bounds HTTP %i failures to four attempts without leaking responses',
    async (status) => {
      const h = harness(job)
      h.fetch.mockResolvedValue(new Response(secret, { status, headers: { 'x-secret': secret } }))

      await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

      expect(h.fetch).toHaveBeenCalledTimes(4)
      expect(h.info.mock.calls).toEqual([['Retry #1'], ['Retry #2'], ['Retry #3']])
      expect(h.delays).toEqual([1000, 2000, 4000])
      expect(h.setOutput).not.toHaveBeenCalled()
    },
  )

  it.each([401, 403, 404, 422])('does not retry permanent HTTP %i failures', async (status) => {
    const h = harness(job)
    h.fetch.mockResolvedValue(new Response(secret, { status }))

    await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(h.info).not.toHaveBeenCalled()
  })

  it.each([new TypeError('fetch failed'), new DOMException(secret, 'TimeoutError')])(
    'retries connection failures and timeouts',
    async (error) => {
      const h = harness(job)
      h.fetch.mockRejectedValueOnce(error)

      await h.run()

      expect(h.fetch).toHaveBeenCalledTimes(2)
      expect(h.info.mock.calls).toEqual([['Retry #1']])
      expect(h.fetch.mock.calls[0]![1]).toMatchObject({ redirect: 'error' })
    },
  )

  it.each([
    [429, { 'retry-after': '2' }, 2000],
    [403, { 'retry-after': '3' }, 3000],
    [403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '65' }, 65000],
    [429, {}, 60000],
  ] as const)('honors bounded rate limits (%i)', async (status, headers, delay) => {
    const h = harness(job)
    h.fetch.mockResolvedValueOnce(new Response(secret, { status, headers }))

    await h.run()

    expect(h.delays).toEqual([delay])
  })

  it.each(['1000', secret])('fails closed for excessive or invalid Retry-After', async (after) => {
    const h = harness(job)
    h.fetch.mockResolvedValue(new Response(secret, { status: 503, headers: { 'retry-after': after } }))

    await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(h.info).not.toHaveBeenCalled()
  })

  it('bounds total waiting even when every rate-limit response asks for a minute', async () => {
    const h = harness(job)
    h.fetch.mockResolvedValue(new Response(secret, { status: 429 }))

    await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

    expect(h.fetch).toHaveBeenCalledTimes(2)
    expect(h.delays).toEqual([60000])
  })

  it.each([secret, JSON.stringify({ object: { sha: secret } })])(
    'rejects malformed successful responses',
    async (body) => {
      const h = harness(job)
      h.fetch.mockResolvedValue(new Response(body))

      await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

      expect(h.fetch).toHaveBeenCalledTimes(1)
      expect(h.info).not.toHaveBeenCalled()
      expect(h.setOutput).not.toHaveBeenCalled()
    },
  )
})

describe('deployment freshness', () => {
  it('rejects a target superseded while waiting', async () => {
    const h = harness('deploy')
    h.fetch.mockResolvedValueOnce(new Response(secret, { status: 503 }))
    h.getRef.mockResolvedValueOnce({ data: { object: { sha: targetSha } } })
    h.getRef.mockResolvedValueOnce({ data: { object: { sha: 'c'.repeat(40) } } })

    await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

    expect(h.getRef).toHaveBeenCalledTimes(2)
    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(h.info.mock.calls).toEqual([['Retry #1']])
  })

  it('rejects a superseded source without retrying', async () => {
    const h = harness('deploy')
    h.fetch.mockResolvedValue(new Response(JSON.stringify({ object: { sha: 'c'.repeat(40) } })))

    await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

    expect(h.fetch).toHaveBeenCalledTimes(1)
    expect(h.info).not.toHaveBeenCalled()
  })

  it('sanitizes target API errors and retries only temporary failures', async () => {
    const h = harness('deploy')
    h.getRef.mockRejectedValueOnce({ status: 503, message: secret, response: { data: secret } })
    h.getRef.mockRejectedValueOnce({ status: 401, message: secret, response: { data: secret } })

    await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

    expect(h.getRef).toHaveBeenCalledTimes(2)
    expect(h.fetch).not.toHaveBeenCalled()
    expect(h.info.mock.calls).toEqual([['Retry #1']])
  })

  it('requires the expected source SHA in the deployment job', async () => {
    const h = harness('deploy')
    delete h.env.EXPECTED_SOURCE_SHA

    await expect(h.run()).rejects.toThrow('Cannot verify publication heads')

    expect(h.getRef).not.toHaveBeenCalled()
    expect(h.fetch).not.toHaveBeenCalled()
  })
})
