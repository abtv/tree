# macOS releases

After successful checks of a version commit on `main`, `Release new app version` builds Tree
for Apple Silicon and uploads a verified DMG, update ZIP and metadata to a **draft** GitHub Release.
Only the owner publishes the draft for users.

## Create a release

Commit reviewed changes, then prepare the next patch version locally:

```bash
npm run release
```

The command updates package.json and package-lock.json and creates a version
commit. It runs no tests, makes no network requests and creates no tag.
Optional `-- minor` and `-- major` select those increments. Push or merge the
commit into `main` using the normal development workflow.

The `Test and build app` main workflow runs code checks, audit, browser and Linux/macOS Electron E2E, Linux Electron memory measurements, and
Linux/macOS smoke once. After success it dispatches the versioned release, whose
Web and macOS branches run independently. The macOS branch calls
`create-macos-release-draft.yml`.
Desktop preflight rechecks the upstream repository, workflow path, push event,
main branch, SHA, run attempt and successful `Check release version` gate through
the GitHub API. Failed, canceled, forked or superseded runs cannot reserve a
release. No upstream artifacts or default-branch checkout supply release bytes:
every downstream desktop job checks out the exact validated source SHA.

A lightweight `v<version>` tag and owned draft are created only for a version
higher than all existing valid SemVer tags and releases, or the first version.
Drafts reserve their numbers too. Same-version commits and older versions skip
the expensive macOS job. New reservations require the source still to be current
main. One global desktop concurrency group serializes reservations and uploads.
Arbitrary external tag pushes and manual draft publication are outside that lock.

After a failed build, select **Re-run failed jobs** in `Release new app version`. It reuses only
the same tag/SHA and its own empty draft; no deletion or version increment is
needed. Dispatch verification rejects stale source main and changed validation attempts;
a newer reserved version also prevents uploading the older one. Published releases and
complete uploaded artifact sets are skipped. Unknown drafts or partial/unknown assets
stop for inspection. Existing tags and assets are never replaced. No automated
step publishes a release or changes its published/draft state after creation.

## Release notes

Draft reservation generates notes from Conventional Commits between the previous
published macOS version (identified by its versioned DMG asset) and the exact
validated source SHA. Drafts and tags without a published desktop release do not
advance this baseline. The highest lower semantic version is used; a missing or
non-ancestor baseline fails reservation before any write. The reservation checkout
includes full history and tags. The first release uses all history through its SHA.

Notes group features, fixes and performance changes, omit known internal scopes,
and highlight breaking-change markers regardless of commit type. Repeated identical
entries are removed. Dependency notes compare locked versions of Electron and direct
production dependencies, including Electron despite its development dependency placement.
The first release has no dependency baseline. Other development dependencies are omitted.
The full comparison is linked; no generated changelog is stored in Git.

Review the draft before publishing: remove internal changes whose scopes were not
recognized, combine related entries, rewrite technical subjects for users, and add
any known limitations or required user actions. Deterministic filtering cannot judge
the significance of every commit. Retries reuse existing draft text without regeneration,
preserving manual edits and the hidden source ownership marker. Keep that marker.
The publication reminder appears in the reservation job summary, not in release notes.

## Signing and packaging

The successful source workflow already checked code and audited its lockfile.
Desktop preparation does not repeat formatting, lint, type checks, ordinary
tests, audit or development Electron smoke. It installs the same locked
dependencies, builds the checked source and verifies the newly packaged artifact.
Full Linux/macOS Electron E2E and Linux Electron memory measurements gate every new release version in the source workflow.
The memory suite enforces sampled memory-growth and footprint budgets and verifies its detector with retained allocations.
See [memory detection limits](DEVELOPMENT.md#what-the-memory-suite-can-detect).
Local E2E and timing suites follow the development change-risk rules. No dependency upgrades are automatic.

If E2E or another validation prerequisite fails, select **Re-run failed jobs** in `Test and build app`.
Successful prerequisite results and their outputs are reused for the same source SHA.
The release gate reruns, downloads the successful browser job's package by immutable
artifact ID, verifies its original run/SHA/attempt and file hashes, and records the
current validation attempt before preserving the release package. Missing or expired
artifacts block release; rerun their producer and dependent jobs, or all jobs.
No new version or tag is needed. A newer main commit still supersedes the candidate.
If only the final publication-dispatch job fails after the release gate succeeded,
rerun all jobs so the successful gate and release package belong to the new attempt.

Production fuses disable RunAsNode, NODE_OPTIONS, Node CLI inspection and extra
file-protocol privileges, and require ASAR integrity and ASAR-only loading.
The archive worker uses `worker_threads`, not `child_process.fork`; the renderer
uses `app://tree/`. Development Electron binaries are not modified. The workflow
reads back fuses from the packaged app. A separate macOS runner mounts the signed
DMG read-only, copies Tree.app to an isolated installation directory, checks its
signature, ticket, Gatekeeper acceptance and fuses, then runs the renderer smoke
test using Chromium CDP. Playwright's Electron launcher requires the disabled
Node inspector. Neither test relaxes production fuses.

Reservation, signing, application verification and draft upload use separate
GitHub-hosted runners. Only the signing step receives the explicitly mapped Apple
credentials, and the signing job has no repository write permission. It never
runs Tree. Verification has read-only permissions, no signing secrets, no shared
dependency cache and no artifact output consumed by upload. Both the smoke runner
and its application child receive only explicitly allowed startup variables.

After notarization and stapling, the signer records each file's SHA-256 and uploads
the DMG, ZIP and metadata as an immutable Actions artifact. Verification downloads its
artifact ID and rejects a digest mismatch before mounting or extracting. Upload runs on a fresh
Ubuntu runner only after successful verification, downloads the original signer
artifact independently and checks all signer digests again. It never consumes
bytes or a digest supplied by the application-testing runner. Only reservation
and upload have Contents write permission; neither installs dependencies or runs
the application. Source code, signing tools and GitHub remain trusted.

Artifact names include the release workflow run ID and attempt. Failed-job retries
reuse successful prerequisite outputs; a rerun of signing creates a new immutable
artifact. Expired artifacts require rerunning their producer and dependent jobs.

Explicit ticket validation and DMG stapling use `scripts/stapler-validate.mts`
(with `--staple` for stapling). It makes at most
three attempts, waiting 15 and then 30 seconds, only when stapler exits with 68
and reports an NSURLErrorDomain timeout (-1001) or lost connection (-1005).
Other failures stop immediately; an exhausted retry returns the last failure.
Signing, notarization submission and Gatekeeper checks are not retried
by this wrapper. No verification failure is ignored.

An ad-hoc signed local build can be inspected with
`node scripts/verify-release-fuses.mts <path-to-Tree.app>`, but Hardened Runtime
may refuse to launch its framework because ad-hoc signatures have no matching
Developer ID team. Do not add library-validation exceptions to work around this.
The packaged smoke test must pass on the Developer ID build in Actions before
any DMG is uploaded. A local fuse check alone does not establish launch readiness.

See `package.json` and `package-lock.json` for the exact installed versions.
The configuration deliberately uses v26 flat `mac` signing options. In v27 these
move under `mac.sign`; validate the installed schema when upgrading, rather than
copying the v27 documentation into this v26 configuration.

In v26, `notarize: true` alone can silently skip notarization when credentials
are absent. The `beforePack` credential guard rejects that case before packaging,
including direct builder invocations. Run its negative-path tests with
`npm test -- scripts/release-guard.test.mts`. Node 24 loads the TypeScript hook
through the v26 loader. Local packaging now requires credentials as well.

The stable bundle identifier is `io.github.abtv.tree`. The existing PNG icon is
converted by electron-builder. Only compiled `out` files and production packages
are included; the archive worker remains included. Application name, sandbox,
context isolation, CSP and local storage code are unchanged.

Hardened Runtime uses only `com.apple.security.cs.allow-jit`, needed by Electron's
V8 runtime on arm64. There are no unsigned native add-ons or external plugin
loaders requiring library-validation exceptions. No camera, microphone,
debugger, unsigned executable memory, or Apple Events entitlements are granted.

The five repository secrets are `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_API_KEY`,
`APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`. The certificate is passed to builder.
The Base64 API key is decoded to a private temporary file and removed on exit.
Builder notarizes and staples the app; the workflow verifies its Developer ID
signature, ticket and Gatekeeper acceptance, then notarizes and staples the DMG.
The DMG is explicitly signed and its Developer ID authority and Gatekeeper
acceptance are checked too. Immediately before upload, the release must still be
a draft owned by the checked source run, with the pinned tag/SHA and no assets.
Upload does not use `--clobber`.
Missing credentials or any failed verification prevent asset upload. The built-in
GitHub token has `contents: read` and `actions: read` in preflight, signing and
verification; only reservation and upload add `contents: write`.

Releases include the DMG, a signed application ZIP, and `latest-mac.yml` for desktop
updates (PRODUCT §26). The artifact recorder creates metadata from the final ZIP,
and the verifier and uploader independently check all three signer-provided digests.
The isolated verifier also checks and launches the ZIP application. Metadata points
only to the ZIP, so later DMG stapling cannot invalidate its update hash.
Publish the complete draft; a partial artifact set fails closed. The first build
containing the updater must be installed manually. Before declaring signed updates
verified, test an actual older-to-newer signed installation with synthetic notes in
a separate macOS account, confirming restart, version change and preserved edits.

## Verify and publish

Download the draft DMG on an Apple Silicon Mac:

```bash
xcrun stapler validate Tree-0.1.0-arm64.dmg
spctl --assess --type open --context context:primary-signature --verbose=2 Tree-0.1.0-arm64.dmg
hdiutil attach Tree-0.1.0-arm64.dmg
codesign --verify --deep --strict --verbose=2 /Volumes/Tree\ 0.1.0-arm64/Tree.app
codesign -dv --verbose=4 /Volumes/Tree\ 0.1.0-arm64/Tree.app
xcrun stapler validate /Volumes/Tree\ 0.1.0-arm64/Tree.app
spctl --assess --type execute --verbose=2 /Volumes/Tree\ 0.1.0-arm64/Tree.app
```

Use the actual mount path reported by `hdiutil` if different. Confirm Developer ID
Application authority and your team identifier. Test launch and normal workflows
in a separate macOS test account to avoid touching personal Tree data. After the
workflow succeeds and testing passes, open the draft on GitHub and select
**Publish release** (or run `gh release edit v0.1.0 --draft=false`).

## Troubleshooting

* Certificate import failure: check the Base64 P12 contains the private key, its
  password is correct, and the Developer ID certificate is valid.
* Apple authentication failure: check key ID, issuer, API key contents and team
  access. Do not use an Apple ID password or log secret values.
* Notarization rejection: use the submission ID with `xcrun notarytool log`,
  authenticated with the same API key, and inspect Apple's reported paths.
* Timeout: Apple can take longer on initial submissions. Inspect submission
  status before retrying; the workflow never uploads unverified artifacts.
* Stapler or Gatekeeper failure: stop publication and inspect the signature and
  Apple response. Do not disable Gatekeeper or add broad entitlements.

Local `npm run check` validates code and builds without credentials. Actual Apple
signing and notarization can only be established by a successful credentialed run.
