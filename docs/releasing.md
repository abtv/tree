# macOS releases

The tag-only `release.yml` workflow builds Tree for Apple Silicon and uploads a
verified DMG to a **draft** GitHub Release. It never publishes on a main push.

## Create a release

Commit reviewed changes first. For the initial package version (0.1.0):

```bash
git push origin HEAD
git tag -a v0.1.0 -m "Tree 0.1.0"
git push origin v0.1.0
```

For subsequent releases, update `package.json` and `package-lock.json` together
using `npm version <version> --no-git-tag-version`, validate and commit, then push
the matching `v<version>` tag. The workflow rejects mismatches. It reserves a draft
before building; an existing release makes it fail instead of replacing assets.
After a failed run, inspect and manually delete only its incomplete draft before
rerunning the tag workflow. Never move a published tag. Concurrent runs for a tag
are serialized. All releases remain drafts until explicitly published.

## Signing and packaging

After `npm ci`, the release audits the tagged lockfile with
`npm run audit -- --audit-level=high`. High or critical advisories and audit service
failures stop the job before signing or uploading. No dependency upgrades are automatic.

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

The lockfile currently installs electron-builder 26.18.0 and Electron 44.9.3.
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
a draft. Upload does not use `--clobber`.
Missing credentials or any failed verification prevent asset upload. The built-in
GitHub token has only `contents: write` in the release job. No auto-updater is added.

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
