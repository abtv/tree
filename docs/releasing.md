# macOS releases

After successful checks of a version commit on `main`, `release.yml` builds Tree
for Apple Silicon and uploads a verified DMG to a **draft** GitHub Release.
Only the owner publishes the draft for users.

## Create a release

Commit reviewed changes, then prepare the next patch version locally:

```bash
npm run release:electron
```

The command updates package.json and package-lock.json and creates a version
commit. It runs no tests, makes no network requests and creates no tag.
Optional `-- minor` and `-- major` select those increments. Push or merge the
commit into `main` using the normal development workflow.

The existing `Release web app` main workflow runs code checks, the shared audit
and browser tests once. Its successful completion triggers `Release macOS`.
Desktop preflight rechecks the upstream repository, workflow path, push event,
main branch, SHA, run attempt and successful `Approve web release` gate through
the GitHub API. Failed, canceled, forked or superseded runs cannot reserve a
release. No upstream artifacts or default-branch checkout supply release bytes:
both desktop jobs check out the exact validated source SHA.

A lightweight `v<version>` tag and owned draft are created only for a version
higher than all existing valid SemVer tags and releases, or the first version.
Drafts reserve their numbers too. Same-version commits and older versions skip
the expensive macOS job. New reservations require the source still to be current
main. One global desktop concurrency group serializes reservations and uploads.
Arbitrary external tag pushes and manual draft publication are outside that lock.

After a failed build, rerun the failed `Release macOS` workflow. It reuses only
the same tag/SHA and its own empty draft; no deletion or version increment is
needed. Once reserved, advancing main does not invalidate that draft, but a newer
reserved version prevents uploading the older one. Published releases and
complete uploaded DMGs are skipped. Unknown drafts or partial/unknown assets
stop for inspection. Existing tags and assets are never replaced. No automated
step publishes a release or changes its published/draft state after creation.

## Signing and packaging

The successful source workflow already checked code and audited its lockfile.
Desktop preparation does not repeat formatting, lint, type checks, ordinary
tests, audit or development Electron smoke. It installs the same locked
dependencies, builds the checked source and verifies the newly packaged artifact.
Full E2E and timing suites follow the development change-risk rules; a release
alone does not add another full run. No dependency upgrades are automatic.

Production fuses disable RunAsNode, NODE_OPTIONS, Node CLI inspection and extra
file-protocol privileges, and require ASAR integrity and ASAR-only loading.
The archive worker uses `worker_threads`, not `child_process.fork`; the renderer
uses `app://tree/`. Development Electron binaries are not modified. The workflow
reads back fuses from the packaged app and runs an isolated renderer smoke test
using Chromium CDP, since Playwright's Electron launcher requires the disabled
Node inspector. Neither test relaxes production fuses.

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
GitHub token has `contents: read` and `actions: read` in preflight; only the
macOS preparation job adds `contents: write`. No auto-updater is added.

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
