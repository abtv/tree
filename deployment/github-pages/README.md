# Automatic browser publication

The source is `abtv/tree`; the application destination is
<https://tree-editor.github.io>, owned by the separate
`tree-editor/tree-editor.github.io` repository. `release.yml` runs on a source
push to main. PRs check code but cannot publish or receive publishing secrets.

## Release checks

The release workflow calls standard validation, all six Electron E2E shards and
their aggregate, the high-severity dependency audit, and the Chrome static-package
check. It also calls the existing memory and demo workflows when their suite-input
path selectors apply to the current push or to the changes since a fully successful
source release. Selection reads the latest page of successful `release.yml` pushes
to source main and uses the first ancestral commit, excluding the current run.
A failed or canceled release cannot advance that baseline, so a later
documentation-only push retains checks required by unpublished changes. If the
bounded history has no suitable baseline, both checks run. Changes to
`scripts/web-release/` or `release.yml` also require both checks; this establishes
a checked baseline when migrating from the old last-push-only selector.
Failed, missing or canceled checks block publication.
Only a deliberately unselected memory/demo job may be skipped. The gate also
requires successful change selection, so unavailable API history or a required
Git revision fails closed. History is unnecessary when the current push already
requires both checks. Nightly/manual performance, property soak and mutation runs remain separate.
Chrome on macOS is the current browser gate; Safari and full browser parity remain
later work. The source demo workflow keeps publishing to its existing media site.

Chrome builds and tests `out/web/` once. An artifact named with source SHA and run
attempt contains exactly those files and a per-file SHA256 manifest. After the
gate succeeds, a separate signing job authenticates retained old assets and
commits every current and retained file's size/hash to one complete manifest.
It signs the exact manifest through GitHub OIDC/Sigstore using `actions/attest`.
The signed manifest plus detached bundle independently authenticate the package;
target-provided hashes or a green source run alone are insufficient. Only the
later transfer job receives the App key. Nothing rebuilds from a moving branch.

## One-time repository setup

Configure GitHub through its UI. In the target repository, open Settings → Pages
and select GitHub Actions before adding the workflow. Copy `pages.yml` from this
directory to target `.github/workflows/pages.yml`. Copy `dependabot.yml` to target
`.github/dependabot.yml`. The old four-file `.github/scripts/web-release/` copy
from commit `1e5bd76` is obsolete; remove it in the same normal target commit.
Do not amend or reset that earlier commit. Preserve README and application data.
The workflow-only update does not publish a package.

The protected target workflow resolves `abtv/tree` main through GitHub's API,
then checks out verifier code at that immutable SHA. The signed manifest must
name the same source SHA. It never executes target scripts, local Actions or
target dependency metadata. Source main maintainers are the explicit trust root;
a target-only publisher cannot choose the tool SHA. No publisher-selected ref or
manifest URL is used for executable code.

In source Settings → Environments, create `web-publication` with a deployment
branch policy allowing only main. In target Settings → Environments, ensure
`github-pages` permits only main. Preserve existing protection rules. If an
environment requires review, that review still applies; do not remove it to bypass
approval. No GitHub CLI authorization or automatic repository setup script is used.

## One-time GitHub App setup

1. Create a GitHub App in the `tree-editor` organization settings. Use a unique
   name such as `tree-editor-web-publisher`, homepage <https://tree-editor.github.io>,
   and disable its webhook. It needs no OAuth callback or user authorization flow.
2. Give it only repository **Contents: Read and write**; Metadata read is automatic.
   Do not grant Actions, Workflows, Pages or administration write permissions.
3. Install it on **Only select repositories → tree-editor.github.io**.
4. Generate its private key. Do not commit it or paste it into a chat.
5. In `abtv/tree` → Settings → Environments → `web-publication`, create environment
   variable **WEB_PUBLISH_APP_ID** with its numeric App ID. Create environment
   secret **WEB_PUBLISH_APP_PRIVATE_KEY** containing the complete PEM private key.
6. Keep the App installed and its key valid. Rotate/revoke the key through GitHub
   settings when needed, updating the environment secret directly.

The gated transfer job obtains a short-lived installation token restricted to
that single repository. The ordinary source `GITHUB_TOKEN` cannot write the target.
App-triggered target pushes can trigger the Pages workflow. These are GitHub's
[App authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow)
and [workflow trigger](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
mechanisms. The private key is a publishing credential; protect source main and
review trusted workflow changes. No repository secret is needed for PR checks.
The App's lack of Workflows write is mandatory. Each transfer creates a uniquely
named temporary probe branch and first writes an ordinary file through the
Contents API. It then attempts to add a harmless dispatch-only workflow on that
same branch with the same token and requires a recognized permission denial.
The accepted HTTP 403 messages are GitHub's documented `Resource not accessible
by integration` or its explicit refusal naming the workflow and missing
`workflows` permission. Rate limits, missing resources and unrecognized responses
stop publication; an HTTP status alone is not proof. See GitHub's
[REST permission-error documentation](https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api#resource-not-accessible).
It removes the probe branch before
transferring the package. If workflow write succeeds or any other error/cleanup
failure occurs, publication stops; main and the live release are untouched by
the probe. Contents write alone can
alter target scripts, which is why the workflow never executes them. Public-repo
file-path push rules are not assumed available. Optional main rulesets can block
force pushes/deletion; do not give the App a blanket bypass of protections.

Actions reachable in source publication and the target template are pinned to
full commit SHAs verified in the official action repositories. Source Dependabot
already monitors Actions; install the target configuration above as well. Review
updates before merging. The template in this repository is updated deliberately
when target pins or workflow logic change; no automatic cross-repository workflow
administration permission is granted to the publisher.

## First activation and normal use

**Before publishing:** localhost and the HTTPS destination have separate browser
storage. Existing localhost notes stay there and do not move automatically. Do
not clear that site's storage. There is no account, synchronization, export/import
or migration in this version.

After access setup, push the intended source commits to main. In source Actions,
wait for **Browser release** and its **Release gate** and transfer job. In target
Actions, wait for **Publish Tree**. Its read-only job independently authenticates
the manifest with `gh attestation verify --bundle`, enforcing source repository,
signer workflow, main ref, source digest and GitHub-hosted runner. It verifies every
file, the source gate/run/attempt, and both current heads. A separate Pages/OIDC
write job checks heads again and deploys only the verified artifact; it has no
checkout or repository script execution. A final read-only job checks hosted bytes.
Inspect its final
hosted-file verification and open the HTTPS site in Chrome. Use a separate test
profile for synthetic edits when verifying hosted persistence.

The source publisher replaces `site/` with exactly the complete authenticated set,
plus root `provenance.json` and `provenance.sigstore.json`, in a normal fast-forward
target commit. Its implementation cannot replace `.github/` or README; GitHub
additionally denies workflow writes to the Contents-only token. Previously published
hashed assets remain available only after authenticating the old manifest/bundle
and verifying their bytes before the new manifest is signed. Unlisted target files
are removed by the whole-tree replacement, and target verification rejects extras.
Only JavaScript, CSS and font assets are accepted; HTML/SVG assets are rejected.
No archive is extracted, and no transferred JavaScript is executed in CI.
If retained assets eventually exceed those bounds, publication fails safely;
review a source-side retention-policy change before retrying. Manually deleting
files from an already signed package makes verification fail; it does not prune
the authenticated manifest.

## Failures and ordering

A failed check, missing credential, invalid digest, stale source/target head,
rejected target update or failed pre-deployment verification leaves the live
release unchanged. Target commits and source history remain append-only. Branch
updates never use force. Source and target publication are serialized; queued
older candidates are rejected using current heads. A new source push can supersede
a checked candidate, in which case its transfer/deployment fails closed.

Reusable checks include their suite prefix and `github.workflow` in concurrency
groups. GitHub supplies the caller's workflow name during reuse, so release checks
cannot be canceled by standalone manual or scheduled checks, or by another suite
inside the release. Existing standalone cancellation and PR/branch separation
remain in place. The release workflow itself preserves in-flight publication.

The target also checks public source run metadata over GitHub's API, including its
current attempt and successful gate. Public API rate limits or unavailable GitHub
services stop the deployment. Anonymous public-source API reliability remains a
deliberately deferred concern; the target token is used only within its own scope
and by detached-proof verification. No new source-reading credential is introduced.

A stolen target-only publisher token cannot sign arbitrary bytes or change the
protected workflow/source tools. It can still delete files, replay an old signed
release or otherwise stop publication; authenticity does not guarantee availability
or preserve all compatibility assets against a malicious writer. Source maintainers,
target workflow administrators, GitHub/Sigstore and hosted runners remain trusted.

After switching Pages, hosted checks compare every runtime file's bytes with the
signed manifest and retry boundedly for CDN propagation. The `.nojekyll` control
file is checked before deployment but need not be publicly served. A failure at this stage reports
an already-switched release; it cannot promise automatic rollback. Investigate the
target Actions log and ship a verified forward correction. To restore an earlier
version, restore the corresponding source code in a new source commit and let it
pass the same checks; do not force-reset target history or bypass the gate.

Missing credentials can be added without source edits. Then choose **Re-run all
jobs** on the source workflow, rather than only failed jobs: each attempt must
regenerate and sign its own artifact. After modifying
trusted target workflow/scripts, copy and commit the reviewed files again. The
setup commit itself does not publish a package; a later valid transfer does.

Before calling activation secure, run a real signed source publication and hosted
check. Then open target Actions → Publish Tree → Run workflow on main and enable
`rejection_probe`. This read-only run first authenticates the valid package, corrupts
one file in its isolated checkout, confirms rejection, and restores the local copy.
It uploads no deployable artifact and skips deployment, leaving the live site intact.
The ordinary source transfer already verifies workflow-write denial using its
temporary probe branch. These are real-boundary acceptance checks; local mocked
tests and configured permission labels do not replace their successful results.

An implementation tested only locally is **prepared**, not an operationally
verified deployment. Record the first real source run, target run and hosted
verification before claiming the automation works. GitHub's
[Pages Actions guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
describes the target's Pages permissions and environment.
