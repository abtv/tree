import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { load } = require('js-yaml') as { load: (text: string) => unknown }
type Step = {
  run?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
  'continue-on-error'?: boolean
}
type Job = {
  needs?: string | string[]
  if?: string
  'runs-on': string
  permissions?: Record<string, string>
  outputs?: Record<string, string>
  steps: Step[]
}
const text = readFileSync('.github/workflows/create-macos-release-draft.yml', 'utf8')
const workflow = load(text) as { jobs: Record<string, Job>; permissions: Record<string, string> }
const { candidate, reserve, sign, verify, upload } = workflow.jobs as Record<
  'candidate' | 'reserve' | 'sign' | 'verify' | 'upload',
  Job
>

test('all explicit ticket checks use bounded network retries', () => {
  expect(text).not.toContain('xcrun stapler validate')
  const checks = [sign, verify].flatMap((job) =>
    job.steps.flatMap((step) => (step.run ?? '').split('\n').filter((line) => line.includes('stapler-validate.mts'))),
  )

  expect(checks.map((line) => line.trim())).toEqual([
    'node scripts/stapler-validate.mts dist/mac-arm64/Tree.app',
    'node scripts/stapler-validate.mts --staple dist/Tree-*.dmg',
    'node scripts/stapler-validate.mts dist/Tree-*.dmg',
    'node scripts/stapler-validate.mts "$DMG_FILE"',
    'node scripts/stapler-validate.mts "$app_dir/Tree.app"',
    'node scripts/stapler-validate.mts "$zip_dir/Tree.app"',
  ])
})

test('DMG stapling uses bounded network retries before validation', () => {
  expect(text).not.toContain('xcrun stapler staple')
  expect(text).toContain('node scripts/stapler-validate.mts --staple dist/Tree-*.dmg')
})

test('external workflow actions are pinned to full commit identities', () => {
  for (const file of readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name))) {
    const workflow = load(readFileSync(`.github/workflows/${file}`, 'utf8')) as {
      jobs: Record<string, { uses?: string; steps?: Step[] }>
    }

    for (const job of Object.values(workflow.jobs)) {
      for (const uses of [job.uses, ...(job.steps ?? []).map((step) => step.uses)]) {
        if (!uses || uses.startsWith('./')) continue

        expect(uses, `${file}: ${uses}`).toMatch(/^[^@]+@[a-f0-9]{40}$/)
      }
    }
  }
})

test('release and publication jobs explicitly disable automatic and explicit dependency caches', () => {
  for (const file of ['create-macos-release-draft.yml', 'release-new-app-version.yml']) {
    const release = load(readFileSync(`.github/workflows/${file}`, 'utf8')) as { jobs: Record<string, Job> }

    for (const job of Object.values(release.jobs)) {
      for (const step of job.steps ?? []) {
        expect(step.uses?.includes('/cache@')).not.toBe(true)
        if (step.uses?.startsWith('actions/setup-node@')) {
          expect(step.with?.['package-manager-cache']).toBe(false)
          expect(step.with?.cache).toBeUndefined()
        }
      }
    }
  }
})

test('production packaging requires the security fuse policy', () => {
  const config = load(readFileSync('electron-builder.yml', 'utf8')) as { electronFuses: Record<string, boolean> }

  expect(config.electronFuses).toMatchObject({
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    grantFileProtocolExtraPrivileges: false,
  })
})

test('packaged execution runs on a separate read-only runner without signing credentials', () => {
  const execution = Object.entries(workflow.jobs).filter(([, job]) =>
    job.steps.some((step) => step.run?.includes('scripts/packaged-smoke.mts')),
  )

  expect(execution.map(([name]) => name)).toEqual(['verify'])
  expect(verify['runs-on']).toBe('macos-15')
  expect(verify.permissions).toEqual({ contents: 'read', actions: 'read' })
  expect(JSON.stringify(verify)).not.toContain('secrets.')
  expect(JSON.stringify(verify)).not.toContain('electron-builder')
  expect(verify.outputs).toBeUndefined()
  for (const job of [sign, verify, upload]) {
    expect(job.steps.some((step) => step.with?.cache !== undefined || step.uses?.includes('/cache'))).toBe(false)
    expect(job.steps.some((step) => step['continue-on-error'])).toBe(false)
  }
  expect(verify.steps.some((step) => step.uses?.includes('/upload-artifact'))).toBe(false)
  const run = verify.steps.find((step) => step.run?.includes('packaged-smoke.mts'))!.run!
  expect(run).toContain('hdiutil attach "$DMG_FILE" -readonly -nobrowse')
  expect(run).toContain('ditto "$mount_dir/Tree.app" "$app_dir/Tree.app"')
  expect(run).toContain('trap \'hdiutil detach "$mount_dir"\' EXIT')
  expect(run).toContain(
    'env -i PATH="$PATH" HOME="$HOME" TMPDIR="$RUNNER_TEMP" node scripts/packaged-smoke.mts "$app_dir/Tree.app"',
  )
  expect(readFileSync('scripts/packaged-smoke.mts', 'utf8')).toContain('env: packagedSmokeEnvironment(process.env)')
})

test('only the signer references Apple secrets and it cannot write releases or run Tree', () => {
  expect(
    Object.entries(workflow.jobs)
      .filter(([, job]) => JSON.stringify(job).includes('secrets.'))
      .map(([name]) => name),
  ).toEqual(['sign'])
  expect(sign.permissions).toEqual({ contents: 'read', actions: 'read' })
  expect(sign.needs).toEqual(['candidate', 'reserve'])
  expect(sign.if).toBe("needs.reserve.outputs.ready == 'true'")
  const secretSteps = sign.steps.filter((step) => JSON.stringify(step).includes('secrets.'))
  expect(secretSteps).toHaveLength(1)
  const build = secretSteps[0]!.run!
  expect(build).toContain('electron-builder --mac dmg zip --arm64 --publish never')
  expect(build).not.toContain('packaged-smoke')
  expect(build).toContain('node scripts/stapler-validate.mts dist/Tree-*.dmg')
  expect(build).toContain('spctl --assess --type execute')
  expect(build).toContain('trap \'rm -f "$APPLE_API_KEY"\' EXIT')
  const caller = load(readFileSync('.github/workflows/release-new-app-version.yml', 'utf8')) as {
    jobs: { macos: { secrets: Record<string, string> } }
  }
  expect(Object.keys(caller.jobs.macos.secrets).sort()).toEqual([
    'APPLE_API_ISSUER',
    'APPLE_API_KEY',
    'APPLE_API_KEY_ID',
    'CSC_KEY_PASSWORD',
    'CSC_LINK',
  ])
})

test('upload cannot consume verifier-controlled bytes and only follows successful verification', () => {
  expect(upload.needs).toEqual(['candidate', 'reserve', 'sign', 'verify'])
  expect(upload.if).toBeUndefined() // Default success() rejects failed, skipped and cancelled prerequisites.
  expect(verify.needs).toEqual(['candidate', 'sign'])
  expect(verify.if).toBeUndefined()
  expect(upload['runs-on']).toBe('ubuntu-24.04')
  expect(upload.permissions).toEqual({ contents: 'write', actions: 'read' })
  expect(sign.outputs?.artifact_id).toBe('${{ steps.artifact.outputs.artifact-id }}')
  expect(sign.outputs?.sha256).toBe('${{ steps.digest.outputs.sha256 }}')
  const artifact = sign.steps.find((step) => step.uses?.includes('/upload-artifact'))!
  expect(artifact.with?.name).toBe('macos-signed-${{ github.run_id }}-${{ github.run_attempt }}')
  expect(artifact.with?.path).toBe('dist/Tree-*.dmg\ndist/Tree-*.zip\ndist/latest-mac.yml\n')
  expect(artifact.with?.overwrite).toBeUndefined()
  for (const job of [verify, upload]) {
    const download = job.steps.find((step) => step.uses?.includes('/download-artifact'))!
    expect(download.with).toEqual({
      'artifact-ids': '${{ needs.sign.outputs.artifact_id }}',
      path: 'dist',
      'merge-multiple': true,
    })
    const digest = job.steps.findIndex((step) => step.run === 'node scripts/release-artifact.mts verify')
    expect(digest).toBeGreaterThan(job.steps.indexOf(download))
    expect(job.steps[digest]!.env).toEqual({
      EXPECTED_DMG_SHA256: '${{ needs.sign.outputs.sha256 }}',
      EXPECTED_ZIP_SHA256: '${{ needs.sign.outputs.zip_sha256 }}',
      EXPECTED_METADATA_SHA256: '${{ needs.sign.outputs.metadata_sha256 }}',
    })
    expect(digest).toBeLessThan(
      job.steps.findIndex((step) =>
        step.run?.includes(job === upload ? 'scripts/release-draft.mts upload' : 'hdiutil attach'),
      ),
    )
    expect(JSON.stringify(job)).not.toContain('needs.verify.outputs')
  }
  expect(upload.steps.some((step) => /npm ci|packaged-smoke|electron-builder/.test(step.run ?? ''))).toBe(false)
})

test('publication follows upload and receives only the original signer digests', () => {
  const uploadIndex = upload.steps.findIndex((step) => step.run === 'node scripts/release-draft.mts upload')
  const publishIndex = upload.steps.findIndex((step) => step.run === 'node scripts/release-draft.mts publish')
  expect(uploadIndex).toBeGreaterThan(-1)
  expect(publishIndex).toBe(uploadIndex + 1)
  for (const step of upload.steps.slice(uploadIndex, publishIndex + 1)) {
    expect(step.env).toEqual({
      GH_TOKEN: '${{ github.token }}',
      RELEASE_ID: '${{ needs.reserve.outputs.release_id }}',
      EXPECTED_DMG_SHA256: '${{ needs.sign.outputs.sha256 }}',
      EXPECTED_ZIP_SHA256: '${{ needs.sign.outputs.zip_sha256 }}',
      EXPECTED_METADATA_SHA256: '${{ needs.sign.outputs.metadata_sha256 }}',
    })
    expect(step['continue-on-error']).toBeUndefined()
  }
  for (const job of [candidate, reserve, sign, verify]) {
    expect(job.steps.some((step) => step.run?.includes('release-draft.mts publish'))).toBe(false)
  }
})

test('release retains authenticated source, reservation and immutable artifact gates', () => {
  expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read' })
  expect(candidate.if).toContain("github.event_name == 'workflow_dispatch'")
  expect(candidate.if).toContain("github.ref == 'refs/heads/main'")
  expect(candidate.steps.some((step) => step.run === 'node scripts/release-draft.mts plan')).toBe(true)
  expect(reserve.needs).toBe('candidate')
  expect(reserve.if).toBe("needs.candidate.outputs.ready == 'true'")
  expect(reserve.steps.some((step) => step.run === 'node scripts/release-draft.mts reserve')).toBe(true)
  expect(reserve.steps.some((step) => step.run === 'npm ci')).toBe(false)
  expect(upload.steps.at(-1)?.env?.RELEASE_ID).toBe('${{ needs.reserve.outputs.release_id }}')
  for (const job of [reserve, sign, verify, upload]) {
    const checkout = job.steps.find((step) => step.uses?.includes('/checkout'))!
    expect(checkout.with?.ref).toBe('${{ needs.candidate.outputs.sha }}')
    expect(checkout.with?.['persist-credentials']).toBe(false)
  }
  expect(text).toContain('group: release-macos-main')
  expect(text).toContain('cancel-in-progress: false')
  expect(text).not.toContain('--draft=false')
  expect(text).not.toContain('--clobber')
})
