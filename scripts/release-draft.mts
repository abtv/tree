import { appendFileSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { packageVersion, parseVersion, compareVersions } from './release-version.mts'
import { dispatchedSource } from './publication.mts'

const repository = 'abtv/tree'
const root = `/repos/${repository}`
export type Request = (path: string, method?: 'GET' | 'POST' | 'PATCH', body?: unknown) => Promise<unknown>
type Run = {
  id: number
  run_attempt: number
  head_sha: string
  head_branch: string
  event: string
  path: string
  status: string
  conclusion: string
  repository: { full_name: string }
  head_repository: { full_name: string }
}
type Job = { name: string; status: string; conclusion: string }
type Tag = { name: string; commit: { sha: string } }
type Release = {
  id: number
  tag_name: string
  draft: boolean
  body: string | null
  assets: { name: string; state: string; size: number }[]
}
type Candidate = { tag: string; sha: string; runId: number; marker: string; release?: Release; tagged: boolean }

export const request: Request = async (path, method = 'GET', body) => {
  if (!path.startsWith(`${root}/`) || /[\r\n#]/.test(path)) throw new Error('Invalid release API path')
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    redirect: 'error',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`Release API ${method} failed (${response.status})`)
  return response.json()
}

async function pages<T>(path: string, api: Request): Promise<T[]> {
  const values: T[] = []
  for (let page = 1; page <= 100; page++) {
    const result = await api(`${path}?per_page=100&page=${page}`)
    if (!Array.isArray(result)) throw new Error('Invalid release API list')
    values.push(...(result as T[]))
    if (result.length < 100) return values
  }
  throw new Error('Release API list exceeded pagination limit')
}

export async function verifySource(event: { workflow_run: Run }, api: Request) {
  const expected = event.workflow_run
  if (!Number.isSafeInteger(expected?.id) || expected.id <= 0 || !/^[a-f0-9]{40}$/.test(expected.head_sha)) {
    throw new Error('Invalid upstream run identity')
  }
  const run = (await api(`${root}/actions/runs/${expected.id}`)) as Run
  for (const source of [expected, run]) {
    if (
      source.repository?.full_name !== repository ||
      source.head_repository?.full_name !== repository ||
      source.path !== '.github/workflows/test-and-build-app.yml' ||
      source.event !== 'push' ||
      source.head_branch !== 'main' ||
      source.status !== 'completed' ||
      source.conclusion !== 'success' ||
      source.head_sha !== expected.head_sha ||
      source.id !== expected.id ||
      source.run_attempt !== expected.run_attempt ||
      !Number.isSafeInteger(source.run_attempt) ||
      source.run_attempt < 1
    ) {
      throw new Error('Untrusted or superseded upstream run')
    }
  }
  const jobs: Job[] = []
  for (let page = 1; page <= 20; page++) {
    const result = (await api(
      `${root}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100&page=${page}`,
    )) as { jobs: Job[]; total_count: number }
    if (
      !Array.isArray(result.jobs) ||
      !Number.isSafeInteger(result.total_count) ||
      result.total_count < 1 ||
      result.total_count > 2000
    )
      throw new Error('Invalid upstream job list')
    jobs.push(...result.jobs)
    if (jobs.length === result.total_count) break
    if (!result.jobs.length || jobs.length > result.total_count || page === 20)
      throw new Error('Incomplete upstream job list')
  }
  const gates = jobs.filter((job) => job.name === 'Check release version')
  if (gates.length !== 1 || gates[0]!.status !== 'completed' || gates[0]!.conclusion !== 'success')
    throw new Error('Upstream checks did not pass')
  return run
}

function validTag(tag: string) {
  if (!tag.startsWith('v')) return false
  try {
    parseVersion(tag.slice(1))
    return true
  } catch {
    return false
  }
}

export async function planDraft(
  event: { workflow_run: Run },
  texts: string[],
  api: Request,
): Promise<Candidate | undefined> {
  const run = await verifySource(event, api)
  const { version } = packageVersion(texts)
  const tag = `v${version}`
  const tags = await pages<Tag>(`${root}/tags`, api)
  const releases = await pages<Release>(`${root}/releases`, api)
  const versions = [...tags.map((item) => item.name), ...releases.map((item) => item.tag_name)].filter(validTag)
  if (
    versions.some(
      (item) =>
        compareVersions(item.slice(1), version) > 0 || (item !== tag && compareVersions(item.slice(1), version) === 0),
    )
  )
    return undefined
  const existingTag = tags.find((item) => item.name === tag)
  if (existingTag && existingTag.commit.sha !== run.head_sha) return undefined
  const existing = releases.filter((item) => item.tag_name === tag)
  if (existing.length > 1) throw new Error('Multiple releases for one version')
  const release = existing[0]
  const marker = `<!-- tree-macos-release source=${run.head_sha} run=${run.id} -->`
  if (release) {
    if (!release.draft) return undefined
    if (!release.body?.includes(marker) || !existingTag)
      throw new Error('Existing draft is not owned by this source run')
    if (release.assets.length) {
      if (
        release.assets.length === 3 &&
        [`Tree-${version}-arm64.dmg`, `Tree-${version}-arm64.zip`, 'latest-mac.yml'].every((name) =>
          release.assets.some((asset) => asset.name === name && asset.state === 'uploaded' && asset.size > 0),
        )
      )
        return undefined
      throw new Error('Existing draft has partial or unknown assets; inspect it before retrying')
    }
  }
  if (!existingTag) {
    const main = (await api(`${root}/git/ref/heads/main`)) as { object: { sha: string } }
    if (main.object.sha !== run.head_sha) return undefined
  }
  return { tag, sha: run.head_sha, runId: run.id, marker, ...(release ? { release } : {}), tagged: !!existingTag }
}

export async function reserveDraft(event: { workflow_run: Run }, texts: string[], api: Request) {
  const candidate = await planDraft(event, texts, api)
  if (!candidate) return undefined
  if (!candidate.tagged) {
    await api(`${root}/git/refs`, 'POST', { ref: `refs/tags/${candidate.tag}`, sha: candidate.sha })
  }
  const release =
    candidate.release ??
    ((await api(`${root}/releases`, 'POST', {
      tag_name: candidate.tag,
      target_commitish: candidate.sha,
      name: candidate.tag,
      draft: true,
      body: `${candidate.marker}\nPublish only after the macOS release job succeeds and you test the signed DMG.`,
    })) as Release)
  if (!release.draft || release.tag_name !== candidate.tag || !Number.isSafeInteger(release.id))
    throw new Error('Invalid reserved draft')
  return { ...candidate, release }
}

export async function verifyUpload(event: { workflow_run: Run }, texts: string[], releaseId: number, api: Request) {
  const candidate = await planDraft(event, texts, api)
  if (!candidate?.release || candidate.release.id !== releaseId)
    throw new Error('Draft is no longer eligible for upload')
  return candidate
}

if (import.meta.main) {
  try {
    if (
      process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
      process.env.GITHUB_REPOSITORY !== repository ||
      !process.env.GH_TOKEN
    )
      throw new Error('Draft preparation requires a trusted dispatch')
    const event = { workflow_run: (await dispatchedSource()) as Run }
    const texts = ['package.json', 'package-lock.json'].map((path) => readFileSync(path, 'utf8'))
    const sha = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })
    if (sha.status !== 0 || sha.stdout.trim() !== event.workflow_run.head_sha)
      throw new Error('Checkout does not match checked source')
    const [command, ...extra] = process.argv.slice(2)
    if (extra.length) throw new Error('Unexpected arguments')
    if (command === 'plan' || command === 'reserve') {
      const candidate = await (command === 'plan' ? planDraft : reserveDraft)(event, texts, request)
      appendFileSync(
        process.env.GITHUB_OUTPUT!,
        `ready=${!!candidate}\nsha=${candidate?.sha ?? ''}\ntag=${candidate?.tag ?? ''}\nrelease_id=${candidate?.release?.id ?? ''}\n`,
      )
      console.log(
        candidate ? `Preparing draft ${candidate.tag} from ${candidate.sha}` : 'No new eligible macOS release version',
      )
    } else if (command === 'upload') {
      const candidate = await verifyUpload(event, texts, Number(process.env.RELEASE_ID), request)
      const file = `dist/Tree-${candidate.tag.slice(1)}-arm64.dmg`
      const result = spawnSync(
        'gh',
        [
          'release',
          'upload',
          candidate.tag,
          file,
          `dist/Tree-${candidate.tag.slice(1)}-arm64.zip`,
          'dist/latest-mac.yml',
          '--repo',
          repository,
        ],
        {
          stdio: 'inherit',
        },
      )
      if (result.error || result.status !== 0)
        throw new Error('Draft asset upload failed; inspect draft before retrying')
      // Do not PATCH draft state after upload: an owner may publish at any time.
      console.log(`Uploaded verified DMG to ${candidate.tag}. Publication remains manual.`)
    } else throw new Error('Usage: release-draft.mts plan|reserve|upload')
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
