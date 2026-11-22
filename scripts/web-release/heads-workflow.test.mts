import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const { load } = createRequire(import.meta.url)('js-yaml') as {
  load: (text: string) => { jobs: Record<string, { steps: { with: Record<string, string> }[] }> }
}
const workflow = load(readFileSync('deployment/github-pages/deploy-web-app.yml', 'utf8'))
const jobs = ['verify', 'deploy'] as const
const sourceUrl = 'https://github.com/abtv/tree.git'
const targetUrl = 'https://github.com/tree-editor/tree-editor.github.io.git'
const sourceSha = 'a'.repeat(40)
const targetSha = 'b'.repeat(40)
const otherSha = 'c'.repeat(40)
const secret = 'sensitive-output-must-not-appear'
const ref = (sha: string) => `${sha}\trefs/heads/main\n`
const failure = (fields: object) => Object.assign(new Error(secret), { stderr: secret }, fields)

function harness(job: (typeof jobs)[number]) {
  // The head check is the first step of its job: nothing runs before it.
  const script = workflow.jobs[job]!.steps[0]!.with.script!
  const heads: Record<string, string | Error> = { [sourceUrl]: ref(sourceSha), [targetUrl]: ref(targetSha) }
  const execFileSync = vi.fn<(file: string, args: string[], options: object) => string>((...call) => {
    const output = heads[call[1].at(-2)!]
    if (typeof output !== 'string') throw output
    return output
  })
  const load = vi.fn<(id: string) => object>(() => ({ execFileSync }))
  const setOutput = vi.fn()
  const env: Record<string, string> = { PATH: '/usr/bin', 'INPUT_GITHUB-TOKEN': secret }
  if (job === 'deploy') env.EXPECTED_SOURCE_SHA = sourceSha
  // No fetch or API client exists here, and the job name is unrecognized:
  // a script that needs either one fails these tests.
  const context = { repo: { owner: 'tree-editor', repo: 'tree-editor.github.io' }, sha: targetSha, job: 'renamed' }
  const run = () =>
    runInNewContext(`(async () => { ${script} })()`, {
      require: load,
      context,
      process: { env },
      core: { setOutput },
    }) as Promise<void>
  const urls = () => execFileSync.mock.calls.map(([, args]) => args.at(-2))

  return { run, heads, execFileSync, load, setOutput, env, urls }
}

describe.each(jobs)('%s source head read', (job) => {
  it('reads the branch over Git without a token, prompt, redirect or local Git configuration', async () => {
    const h = harness(job)

    await h.run()

    expect(h.load).toHaveBeenCalledWith('node:child_process')
    expect(h.execFileSync.mock.calls[0]).toEqual([
      'git',
      ['-c', 'http.followRedirects=false', 'ls-remote', '--exit-code', sourceUrl, 'refs/heads/main'],
      {
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { PATH: '/usr/bin', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
      },
    ])
  })

  it.each([
    [{ status: 128 }, 'exit 128'],
    [{ status: 2 }, 'exit 2'],
    [{ status: null, code: 'ETIMEDOUT' }, 'ETIMEDOUT'],
  ])('fails closed after one attempt and reports only the status of a failed read (%o)', async (fields, reason) => {
    const h = harness(job)
    h.heads[sourceUrl] = failure(fields)

    const result = h.run()

    await expect(result).rejects.toThrow(new RegExp(`^Cannot read source head \\(${reason}\\)$`))
    expect(h.execFileSync).toHaveBeenCalledTimes(1)
    expect(h.setOutput).not.toHaveBeenCalled()
  })

  it.each([
    '',
    secret,
    `${sourceSha}\trefs/heads/main\n${otherSha}\trefs/heads/fake/refs/heads/main\n`,
    `${sourceSha}\trefs/tags/main\n`,
    `${sourceSha} refs/heads/main\n`,
    `${sourceSha.slice(1)}\trefs/heads/main\n`,
    `${sourceSha.toUpperCase()}\trefs/heads/main\n`,
  ])('rejects output that is not exactly one main branch line (%#)', async (output) => {
    const h = harness(job)
    h.heads[sourceUrl] = output

    const result = h.run()

    await expect(result).rejects.toThrow(/^Invalid source head$/)
    expect(h.execFileSync).toHaveBeenCalledTimes(1)
    expect(h.setOutput).not.toHaveBeenCalled()
  })
})

describe('source tool resolution', () => {
  it('outputs the source head and reads no other repository', async () => {
    const h = harness('verify')

    await h.run()

    expect(h.setOutput.mock.calls).toEqual([['sha', sourceSha]])
    expect(h.urls()).toEqual([sourceUrl])
  })
})

describe('deployment freshness', () => {
  it('permits deployment after reading the source first and the target last', async () => {
    const h = harness('deploy')

    await h.run()

    expect(h.urls()).toEqual([sourceUrl, targetUrl])
    expect(h.setOutput).not.toHaveBeenCalled()
  })

  it('rejects a superseded source', async () => {
    const h = harness('deploy')
    h.heads[sourceUrl] = ref(otherSha)

    const result = h.run()

    await expect(result).rejects.toThrow(/^Source candidate superseded$/)
  })

  it('rejects a superseded target', async () => {
    const h = harness('deploy')
    h.heads[targetUrl] = ref(otherSha)

    const result = h.run()

    await expect(result).rejects.toThrow(/^Target candidate superseded$/)
    expect(h.urls()).toEqual([sourceUrl, targetUrl])
  })

  it.each([
    [failure({ status: 128 }), /^Cannot read target head \(exit 128\)$/],
    [secret, /^Invalid target head$/],
  ])('fails closed when the target head is unreadable or malformed (%#)', async (head, message) => {
    const h = harness('deploy')
    h.heads[targetUrl] = head

    const result = h.run()

    await expect(result).rejects.toThrow(message)
    expect(h.execFileSync).toHaveBeenCalledTimes(2)
  })

  it.each([undefined, '', secret, sourceSha.toUpperCase()])(
    'requires the verified source SHA before reading any head (%#)',
    async (expected) => {
      const h = harness('deploy')
      if (expected === undefined) delete h.env.EXPECTED_SOURCE_SHA
      else h.env.EXPECTED_SOURCE_SHA = expected

      const result = h.run()

      await expect(result).rejects.toThrow(/^Missing verified source SHA$/)
      expect(h.execFileSync).not.toHaveBeenCalled()
    },
  )
})

describe('head check wiring', () => {
  it('keeps one Git reader in both jobs', () => {
    const [verify, deploy] = jobs.map((job) => workflow.jobs[job]!.steps[0]!.with.script!.split('\n\n')[0])

    expect(verify).toContain('ls-remote')
    expect(deploy).toBe(verify)
  })

  it.each(jobs)('uses no REST API, API client, retry or job-name switch in %s', (job) => {
    const step = workflow.jobs[job]!.steps[0]!

    expect(step.with.script).not.toMatch(/fetch|github\.rest|api\.github\.com|context\.job/)
    expect(step.with).not.toHaveProperty('retries')
  })
})
