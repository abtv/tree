# Development Reference

Read this document on demand: it holds CI, Linux container, README media, agent tool configuration and historical-measurement material, while the [Development Guide](DEVELOPMENT.md) owns the rules that every session needs.

## 1. Validation Infrastructure

### Chromium container tests

The Product Owner granted standing authorization on 2026-11-05 to run Linux
Electron E2E tests in Docker through the project's isolated
`npm run test:e2e:linux` workflow. Do not request conversational approval again
for these runs. This authorization covers using the prepared local dependency
image with the runner's fixed isolation settings; dependency preparation remains
owner-operated as described below. Platform sandbox permissions remain enforced.
If a client has not loaded a matching command rule, use its supported execution
approval mechanism; the absence of that rule does not revoke the owner's decision.

Use `npm run test:web:chromium` for the full built-browser suite in Linux arm64 Chromium. It copies current source into a disposable container and runs `test:web:built` there. It accepts no arguments, disables external networking, drops all capabilities, prohibits privilege escalation, and limits processes, memory, and CPUs. It mounts no host directories or Docker socket and publishes no ports. Build output, browser profiles, and failure artifacts remain inside the container and disappear after exit; test results stream to the terminal. This does not replace macOS Electron validation or Chrome-specific checks.

Use `npm run test:smoke:linux` for both Linux smoke checks in the same prepared image; `make test-smoke` includes these after the macOS checks. This command also accepts no arguments and retains the full-suite runner's isolation settings. It transfers the current sources, smoke configuration and the Electron launch helpers without Electron screenshot baselines or host build output. The container builds Electron and the browser package, runs Electron under Xvfb, then runs Chromium even if the Electron check failed. Any failed check fails the command. The entry point permits only the fixed full-browser, smoke, Electron E2E or memory modes; it cannot select external scripts, profiles, origins or Docker options.

Use `npm run test:e2e:linux`, without arguments, for the Linux Electron functional
subset. The same prepared image receives current sources and builds
Electron before running `config/testing/playwright.linux.config.ts` under Xvfb.
It uses four workers, no retries and a 15-minute child-process deadline. Failure
or timeout fails the command; remaining descendants are removed with the container.

Use `npm run test:e2e:memory`, without arguments, for the Linux Electron memory
guards and detector self-checks in the same prepared image. It selects a fixed `memory` container mode,
builds Electron, and runs `config/testing/playwright.memory.config.ts` under Xvfb
with the same isolation and 15-minute deadline. No dependencies are installed and
no host environment overrides are forwarded. The host preserves a unique output log
under `reports/electron-memory/`; CI also retains sample attachments and failure traces.

`config/testing/electron-platforms.ts` owns the explicit Linux file list and the
small shared launch/reset/text-clipboard overlap. In mixed specs, `{ tag: '@linux' }`
selects independent functional cases. New files and untagged cases in mixed files
default to macOS; tests added to a Linux-owned file inherit that file's ownership.
Keep image clipboard, native selection, window/updater integration and all screenshot
comparisons on macOS. A passing Linux run does not establish native macOS behavior.
The discovered union and exact overlap are checked by
`scripts/electron-platforms.test.mts`. Shared clipboard scenarios use stable
`@shared-clipboard-text` and `@shared-clipboard-link` tags; discovery requires
both editing modes on both platforms, independently of test titles.
Electron tests and helpers import `expect` from `fixtures.ts` or
`platform-expect.ts`. The latter rejects `toHaveScreenshot` and `toMatchSnapshot`
on Linux at runtime, including assertions called through helpers; macOS keeps
the original Playwright matchers. ESLint rejects direct Playwright `expect`
imports and re-exports outside that owner. Diagnostic `page.screenshot()` calls
remain available on both platforms. Do not add conditional skips or weaken
assertions to move a case.

The complete local command remains `npm run test:e2e`. Run just the macOS
complement with `npm run test:e2e -- --config=config/testing/playwright.macos.config.ts`.
It preserves the original projects and snapshot paths. The allocation changes
where functional cases run, not their bodies or editing-mode parameterization.

Linux uses its native scrollbar geometry; the zero-width overlay-scrollbar
assertion and Apple user-defaults argument remain macOS-only. Both platforms
retain the canonical renderer scale assertion, hidden-window and shortcut guards,
clipboard lock and process ownership. The renderer keeps its Apple shortcut
profile, including `Meta`. Linux image clipboard, native pointer selection and
macOS screenshot comparisons are outside the Linux subset. No screenshot baselines are
transferred or generated intentionally, and no production CSS is changed.

Each smoke invocation reports elapsed time including its runner, application/browser startup and successful cleanup, and fails if it exceeds 20 seconds. Dependency-image preparation, source transfer, container startup and production builds are outside that budget. At 25 seconds the container supervisor forcibly kills a hung command so it can report failure and run the other target. Any remaining descendants stay inside the disposable container and are destroyed when its entry process exits after both bounded invocations. The container sets `CI=1` for smoke children so Linux Electron can run without its Chromium sandbox in this offline disposable environment. Linux arm64 container timings are local evidence, not measurements of the GitHub runner. The smoke scenario is described under [Cross-platform smoke checks](#cross-platform-smoke-checks).

Browser tests run files across four workers locally and in CI, with tests inside each file remaining sequential. Each worker owns its browser and virtual clipboard; persistent profiles use test-specific output paths. The local container is limited to four CPUs, 4 GiB of memory, and 2048 processes/threads; the former 512-task limit exhausted Chromium's thread budget with four workers. OrbStack's global resource limits must allow those resources.

Docker must be running. The Product Owner prepares dependencies manually from the repository root:

```bash
make setup
```

This builds the dependency image using Docker's cache and needs network access. Agents must not execute this target, build or pull images, or install dependencies for this workflow. If the image is missing or stale, the test command stops and asks the owner to run `make setup`. The Makefile defaults to help, not a build. The former `chromium-image` and `chromium-image-rebuild` targets are replaced by `setup`.

Preparation uses `scripts/web/chromium.Dockerfile` and installs locked dependencies with lifecycle scripts disabled, then explicitly downloads the locked Electron binary through its installer. The Playwright base image supplies Chromium, Xvfb and browser system libraries; preparation adds the `xauth` utility needed by `xvfb-run` and installs `libbrotli1=1.1.0-2ubuntu0.1`, the Ubuntu 24.04 security update for the system Brotli decoder used by curl and Git. The Dockerfile replaces the base image's Node.js binary with Node.js 24.22.1 from a digest-pinned official Node image, so runtime security updates do not depend on a Playwright release. That binary replacement does not update Electron's embedded Node.js or the operating-system libraries. The Dockerfile-specific ignore file limits the build context to the package manifests. Both runners require an existing image and never build, pull or install dependencies. The image tag depends on dependency-related package fields, the parsed lockfile excluding the application version at its root and in `packages[""]`, the Dockerfile, its ignore file, and the separate build recipe in `scripts/web/chromium-image.mk`. The root Makefile includes that recipe; edits to its other commands or help do not change the image tag. Code, documentation, npm-script edits, and application version bumps alone reuse the image; dependency, other lockfile, or recipe changes require owner preparation. Each runner resolves the tag to a local immutable image ID before execution. Normalizing the lockfile changes the tag once; run `make setup` again for an image prepared before this change. Later `make release` runs do not require preparation unless installation inputs also change.

In Codex, use host execution (`sandbox_permissions: "require_escalated"`) from the first invocation. `.codex/rules/chromium.rules` approves only the named full-browser, Linux-smoke and Linux Electron E2E npm workflows, not general Docker access. As with the existing npm permissions, the rule trusts mutable repository scripts and matches command arguments, not the working directory. Review runner, package script, Dockerfile, and rule changes together. It is not a security boundary against an agent that changes those files. Trust the project configuration and restart Codex after rule changes; native rule matching alone does not prove the current session loaded the rule.

The folder-backup picker stub returns OPFS handles. Its reload cases in `e2e/web/backup.spec.mts` run on both Linux Chromium and macOS Chrome, checking persisted handles across documents and backup recovery. Playwright 1.63.0's Linux arm64 Chromium crashed when reading a stored OPFS handle after reload; the crash canary stopped reproducing in the Playwright 1.64.1 CI run. The canary and Linux skips were removed together so the backup scenarios now guard this behavior directly.

The container's network restriction applies to test execution. It does not disable the coding agent's other network tools or revoke existing Docker permissions. Owner-only preparation is a workflow rule; enforcing it against an agent that can change the runner requires a separately protected launcher and host access controls.

### GitHub Actions

On each PR and push to main, `Test and build app` runs code/documentation/unit checks
alongside one high-severity dependency audit. After both succeed, Linux/macOS smoke runs on every change.
After both platform smoke jobs succeed, browser E2E, full Electron coverage across Linux
and macOS, and Linux Electron memory tests run in parallel when the main push has an
unpublished release version. A failed smoke job prevents these release suites from starting.
Release eligibility follows the tag rules in [macOS releases](releasing.md#create-a-release);
an ineligible push still runs ordinary checks and smoke.
Browser E2E also
runs weekly on Sunday at 03:00 UTC and on manual dispatch. The final `Check release version`
job requires checks, audit, version detection and smoke to succeed, plus browser E2E,
Electron E2E and Linux Electron memory tests for a release. A non-release run requires
all three release suites to be skipped.
PRs never dispatch publications or receive release credentials.

A successful main run dispatches `Publish demo video and screenshots` and, only for
a new version, `Release new app version`. Both consumers verify the exact successful
main validation run, attempt and source SHA before publication. Browser bytes come
from that validation run's artifact, without rebuilding. A shared gate reserves the
immutable version tag at the validated SHA before Web and macOS release branches
run independently; either failure makes the release red while preserving the other result.
The source Web job waits for target deployment and checks every hosted byte.

The built-in source token gets Actions write only in the publication dispatcher, to start
these two source workflows. The cross-repository publishing App remains Contents-only.
Failed-job retries and validation-artifact reuse are described in [macOS releases](releasing.md#signing-and-packaging);
a failed target deployment follows the recovery in [Browser publication](../deployment/github-pages/README.md).

Scheduled/manual dependency audits and Electron E2E/memory suites retain separate runs.
Property soak and mutation testing remain separate.
Timing suites stay local. New source validation cancels superseded validation, but release
publication is serialized without canceling in-flight work. Required checks and artifacts
must remain available; an expired artifact or changed validation attempt fails closed.

Full Electron CI runs weekly on Sunday at 02:00 UTC, manually, and for release
candidates. Four `macos-15` shards run `playwright.macos.config.ts`; one
`ubuntu-24.04` job runs `playwright.linux.config.ts` under Xvfb. Each macOS shard uses
three workers; Linux uses four. Both have 12-minute job limits. Linux retains zero retries; macOS retains the
regression configuration's single CI retry. The stable
`Require all Electron E2E shards to pass` check requires both platform groups to
succeed, including every macOS shard. Failure, cancellation and unexpected skips
fail the gate. Failure artifacts include the platform, shard and run attempt.
The separate Linux memory workflow also gates release candidates; its scope and
limitations are described under [What the memory suite can detect](DEVELOPMENT.md#what-the-memory-suite-can-detect).

This allocation replaces six macOS preparations with four plus one Linux
preparation. Independent functional tests move to Linux; macOS retains native
integration and screenshot checks. The initial allocation has 219 Linux cases,
782 macOS cases and 22 shared boundary cases, covering all 979 original cases.
These counts describe the migration, not quotas. Keep long functional/visual
sequences together on macOS when splitting would duplicate their interactions.

Measure savings from actual job start/completion durations, summing each
platform separately and including dependency installation, builds and retries.
Keep queue delay and total workflow elapsed time separate. Compare the same
source snapshot and runner configuration when making a controlled claim. Local
ARM64 Docker and macOS results verify execution but do not establish hosted
AMD64 Linux timings or a percentage saving in GitHub runner-minutes.
The first [hosted run](https://github.com/abtv/tree/actions/runs/42101828682)
validated the allocation: its macOS jobs totaled 17.25 runner-minutes and Linux
4.33, compared with 22.78 macOS runner-minutes in the earlier six-shard run.
Those runs used different source snapshots, so this observation does not establish
a controlled savings percentage. Keep the initial allocation until further
hosted evidence justifies changing it.

#### Scroll rendering regressions

`tree-scroll-rendering.spec.ts`, `agenda-scroll-rendering.spec.ts`,
`scroll-frames.spec.ts` and the search selection case in `recent-nodes.spec.ts`
belong to the ordinary Electron E2E suite. Run them through `npm run test:e2e`
or `make test-e2e`, or select a spec with `npm run test:e2e -- <spec>`.
The existing full Electron CI workflow includes them for release candidates,
weekly runs and manual dispatch. They have no separate PR/main invocation and
are not included in `make test-smoke` or the `test:smoke:*` commands.
The existing platform allocation keeps the Tree/Agenda and pixel-frame specs on
macOS; `recent-nodes.spec.ts` runs on Linux. Browser smoke does not check scroll frames.

The first two check continuous row coverage after large scroll jumps and preserve
the pinned editor/caret in both editing modes. Coverage sums the union of visible
row intervals, so internal holes cannot pass through their outer bounding box.
The frame checks exercise wheel direction changes, wrapped rows, window resizing
and delayed attachment growth in Tree and Agenda. Search (`Cmd+;`) additionally
checks painted result content during arrows, wheel reversal, query refinement and
resizing. Its sampled region lies inside the results list, excluding the header,
footer, edge fades and underlying document. They decode sampled compositor
PNGs through Electron and require ink in every 48-pixel band of a fixed central
viewport region with dense synthetic text in light appearance. A painted blank
band is the negative control: row geometry remains unchanged, but the detector
must reject the captured pixels. Failure artifacts retain frame samples and traces.
This detects empty sampled regions; it does not prove glyph fidelity, observe every
presented frame, reproduce physical trackpad inertia, or enforce frame-time budgets.
Timing checks remain local.

The `recent-nodes.spec.ts` case matching
`keeps selection visible in every animation frame` is mode-independent and runs in both
appearances. It checks selected-row geometry on animation-frame callbacks;
the light-appearance pixel case complements that check. The ordinary Electron E2E
workflow retains failure artifacts. Neither check observes every presented frame.

#### Cross-platform smoke checks

Electron smoke logs the start and elapsed duration of startup, the Tree/Agenda scenario,
Apple Vision OCR (on Apple Silicon), and cleanup. The last started phase identifies
where a test timeout occurred; phase completion logs also run on failure and do not imply success.
Electron launch uses the test timeout rather than a shorter startup deadline, so cold
CI startup can use the available scenario budget without extending the overall smoke limit.

`Run smoke tests` is reusable and runs inside `Test and build app` after code checks
and audit pass. Its Linux and macOS jobs run in parallel with each other;
release browser E2E starts only after both succeed.
Linux checks Electron under Xvfb and Chromium; macOS checks Electron and real Safari.
A failed Electron smoke does not skip browser smoke when its build succeeded.
Both platform results gate publication. They supplement, rather than replace, full E2E.

The shared happy path opens the production build with isolated synthetic data, types a parent, creates a sibling with Enter, and indents it with Tab. In the child it types `today`, checks the selected date suggestion, and accepts it with Enter without creating a node. It then types ` :cat`, checks the selected emoji suggestion, and accepts 🐱 with Tab without changing the child's depth. Both acceptances close their popup and retain editor focus. Additional text crosses the normal word-volume save threshold; the checks verify the persisted text and parent/child relationship through the real platform adapter without waiting for the idle timer or mocking persistence. Each target enables Vim through its menu and checks Quit/reopen as described below, including the restored text, hierarchy and Normal mode. It enters Insert with `i`, types a prefix, and returns to Normal with Escape, asserting both the text and mode transitions. Vim `/` search must then move from the child to its parent in Tree. The check opens the command panel with `:`, types `agenda`, verifies that `show-agenda` is the single selected result, and executes it with Enter. It requires the panel to close and Agenda to show the child dated with today's local canonical date and its selectable, read-only parent path, searches from the day header to the child, and returns to Tree through its menu with the original selection. Both local searches assert a unique match count, confirmed current highlight and destination focus. Electron uses the existing test entry for hidden windows and a stubbed global shortcut; its production main, preload, renderer and file storage still run. Browser checks use fresh contexts/origins. Safari uses an isolated automation session and native WebDriver input, not Playwright WebKit.

After the volume-triggered save, the scenario replaces the child's final punctuation in Vim Replace and verifies both the visible buffered text and the unchanged stored document. It quits without blurring or ending Replace and requires the replacement to survive reopening. Ordinary autosave cannot persist that renderer buffer, including with the browser's shorter save interval. Electron uses the application-menu Quit and requires a clean process exit before fixture cleanup. Chromium uses the primary-modifier Quit shortcut. Safari invokes the production `treeApi.quit()` adapter while keeping editor focus because SafariDriver does not deliver that shortcut to the application. Both browsers require the script-opened application window to close, then reopen the same origin through an isolated launcher window. This Safari check verifies the real save-and-close boundary, not native Quit shortcut delivery. There is no mocked persistence, explicit test flush, clock override or idle wait.

The scenario edits the dated child in Agenda, undoes and redoes that text edit, and verifies the resulting text after returning to Tree. It also opens Search with `Cmd+;` (`Ctrl+;` outside Apple platforms), moves between the recent nodes with ArrowDown/ArrowUp, cancels with Escape and checks restored focus, then reopens and confirms the child with Enter, checking its real parent context and focused text. It then returns to the root, searches for the parent, checks the matching parent and child results, and confirms that opening the parent focuses its first child in Tree.

Build first with `npm run build` (Electron) or `npm run build:web` (browser), then run `npm run test:smoke:electron`, `npm run test:smoke:chromium`, or `npm run test:smoke:safari`. The Chromium command uses Chrome on macOS for local diagnosis and Playwright Chromium on Linux. The Safari command takes no arguments. On a local Mac, Safari Remote Automation must already be enabled by the owner; CI enables it only on its disposable runner. Linux Electron requires a display (CI supplies Xvfb), and disables Chromium's sandbox only in Linux CI.

The same scenario also checks standard ArrowUp/ArrowDown selection, empty-node Backspace deletion, structural undo/redo, and Shift+Tab outdent followed by reindent. Structural history assertions require the deleted row to reappear and disappear, so native browser text undo cannot satisfy them. In Vim Normal, `k`/`j` move between the parent and child, `za` hides and restores the child, and `gd`/`Ctrl+o` enter the parent and return with its selection restored (Safari reserves `Cmd+,` for browser settings). Each transition asserts the resulting focus, row count or depth, allowing for the browser's initial sample nodes. Playwright polls the resolved condition value, including asynchronous persistence reads; a truthy Promise is not a successful assertion. Keep these representative editing and navigation checks in one small document and one application session (plus the required persistence reopen); detailed command matrices, clipboard/attachments, failure paths and visual regressions belong to the focused suites.

Linux Electron and Chromium smoke invocations have a 20-second budget including application/browser startup and successful cleanup, with a 15-second Playwright test timeout. macOS Electron uses a 45-second test timeout and a 60-second global timeout to accommodate hosted-runner startup, restart and native OCR. Its npm command selects `config/testing/playwright.smoke-electron.config.ts`, which preserves the Linux limits; Chromium retains the base smoke configuration and its 20-second global timeout on both platforms. Safari has a 100-second budget. Safari uses the same 100-second limit for aborting operations and checking total elapsed time after cleanup. Individual SafariDriver requests, including session creation, have a 30-second timeout; cleanup requests retain a 5-second timeout. On disposable GitHub Actions runners only, Safari retries once after a session-creation request timeout, after stopping the owned SafariDriver and Safari. Each attempt refuses pre-existing Safari/SafariDriver processes before claiming exclusive ownership of Safari on that runner. Local runs never terminate personal Safari processes and do not retry. Other failures, application assertions, interruption, exhausted total budget, or failed cleanup do not trigger retries. Failure cleanup is bounded and may extend beyond the successful-run budget. Safari reports startup phases and elapsed times in the job output; CI does not enable SafariDriver diagnostic logging or upload diagnostic log artifacts. Dependency installation, builds, runner allocation and the prerequisite audit are outside these budgets; the entire CI job therefore takes longer. Smoke commands do not capture screenshots, browser traces, videos or performance measurements, and do not retry application checks.

Release checks are isolated from standalone manual and scheduled check cancellation;
the concurrency rules are described in [Browser publication](../deployment/github-pages/README.md#failures-and-ordering).

Browser smoke additionally types a URL into a rich editor, switches Vim Insert → Normal → Insert, and checks the link, text, focus and caret. It then selects a character with the keyboard, opens the Tree menu, dismisses it with Escape and replaces the restored selection. Chromium and real Safari share these assertions; Electron retains its existing scenario because its editing policy and menu differ. These checks use native keyboard and pointer events, without clipboard access, extra jobs or larger time budgets.

Safari installs error and unhandled-rejection listeners after each application document becomes ready. Errors during the interactions are retained in the isolated origin's local storage across reload and Quit/reopen, and fail the smoke check. This observes interaction errors; it does not claim coverage of errors before the document becomes ready. Playwright smoke retains its page-error and renderer-crash checks.

When opening the Safari smoke application window, the runner selects the same window before each readiness probe. A `no such window` response is recoverable within the 15-second readiness deadline only if that window's handle still exists. A missing handle or any other error fails immediately. This does not reopen a failed application or repeat its interactions; the overall smoke budget remains unchanged.

#### Workflow and job naming policy

Name GitHub Actions workflows by the work they perform, using an imperative verb
and its object in English sentence case. Use the same principle for job display
names. A reader should understand the purpose without opening the YAML.

* Use direct actions such as `Release new app version`, `Audit dependencies`, and
  `Publish demo video and screenshots`. Use `Run` with established test names, including
  `Run mutation testing` and `Run property tests`; preserve those terms rather
  than inventing synonyms for grammatical uniformity.
* Distinguish a release pipeline from its individual suites. `Release new app version`
  consumes the exact successful main validation run and tested artifact. Web and macOS
  branches are independent. The source Web job waits for the separate hosting deployment.
* Keep names concise. Do not add category prefixes, local jargon such as
  `property soak`, or execution settings merely to describe implementation.
  Increased property-test counts and memory-report thresholds belong in suite
  documentation. Use `memory tests` for the memory suite and describe its actual
  assertions and detection limits in that documentation.
* Add a platform, browser, tool, or build-mode qualifier when it distinguishes
  the work. Use the actual implementation: the Linux web job uses Chromium,
  not Google Chrome. Put execution-specific detail in job names and descriptions
  when the workflow's broader purpose is already clear.
* Derive YAML filenames from the workflow display name: lowercase, remove
  punctuation, replace spaces with hyphens, and append `.yml`. Keep the same
  words and order; do not introduce a second vocabulary of abbreviations.

Source filenames below are relative to `.github/workflows/`. The hosting
workflow is maintained as `deployment/github-pages/deploy-web-app.yml` and
installed separately in the hosting repository.

| Workflow name | Filename |
| --- | --- |
| Release new app version | `release-new-app-version.yml` |
| Test and build app | `test-and-build-app.yml` |
| Publish macOS release (reusable) | `create-macos-release-draft.yml` |
| Run smoke tests (reusable) | `run-smoke-tests.yml` |
| Run web E2E tests | `run-web-e2e-tests.yml` |
| Run Electron E2E tests | `run-electron-e2e-tests.yml` |
| Run Electron memory tests | `run-electron-memory-tests.yml` |
| Run mutation testing | `run-mutation-testing.yml` |
| Run property tests | `run-property-tests.yml` |
| Audit dependencies | `audit-dependencies.yml` |
| Scan code with CodeQL | `scan-code-with-codeql.yml` |
| Enforce agent attribution policy | `enforce-agent-attribution-policy.yml` |
| Publish demo video and screenshots | `publish-demo-video-and-screenshots.yml` |
| Deploy web app (hosting repository) | `deploy-web-app.yml` |

Give every job an explicit display name. Name reusable-workflow calling jobs by
the work they invoke, and execution jobs by the stage they perform. For example,
`Run web E2E tests / Test production build (Chromium)` explains both the suite
and the execution stage. Avoid generic names such as `Check`, `generate`, or
`chrome`, and avoid repeating the entire workflow name at every nesting level.
Matrix jobs include the distinguishing shard or layer, such as
`Run macOS Electron E2E tests (shard 1/4)` or `Run mutation testing (domain)`; aggregate
jobs state their role, such as `Require all Electron E2E shards to pass`.

Review the complete set of names together, including PR checks and nested
release jobs. Keep check names unambiguous across workflows; repeated audit
calls need caller context in their composed names. Technical job IDs may remain
stable when display names change. Playwright project names are test-report
identifiers, not workflow or job names.

When applying a rename, update reusable-workflow paths, scripts, tests, and
documentation that consume the old names or paths. Check required status-check
settings before changing their names. In particular, release verification
matches `Check release version` in `test-and-build-app.yml`, while the current
signer is `release-new-app-version.yml`;
those are functional contracts, not cosmetic labels. A naming change must
preserve the release verification contract and existing triggers and dependencies.

### Build and test configuration

Build configurations live in `config/build/` and test configurations in `config/testing/`.
Vite 8, `@vitejs/plugin-react` 6 and `electron-vite` 6 form the compatible build toolchain.
Use `build.rolldownOptions` for bundle inputs and `oxc.jsx.runtime` for the web JSX transform.
Electron main and preload dependencies use `electron-vite`'s default externalization.
The npm scripts select them explicitly; use those scripts instead of relying on tool discovery.
Keep ESLint and the TypeScript solution entry point in the repository root for editor discovery.
TypeScript target configurations live in `config/typescript/`; the root `tsconfig.json` references them.
Tooling tests live alongside the maintained scripts, including `scripts/vitest-config.test.mts`.
Their test, setup and output paths must continue to resolve to the existing repository directories.

## 2. README Media

### README Screenshot Maintenance

The README gallery uses [the synthetic demo document](images/demo-document.json). It is a documentation resource, not a copy of a user's application data. Preserve its contents across captures; changes to the example itself should be deliberate and reviewed. The capture script launches the built Electron application with a newly created temporary profile and never opens the normal profile. It captures the overview and then enters the meetup branch in the same running application without editing the document or changing that branch's expanded state. In the dark appearance with Vim enabled, it captures the focused branch, a search for `book` with two highlighted matches, and the unfiltered command panel. It finally fixes only `Date` to Thursday 2026-10-08, opens the Agenda with `Cmd+P` in the light appearance, and captures it; the document's dated nodes (2026-10-08 through 2026-10-15) surround that fixed Today, so the Agenda shows the same node text as the Tree images.

The `Publish demo video and screenshots` workflow described below captures the images after recording the video and publishes them to GitHub Pages with it. The README shows the latest successful capture, refreshed after successful validation of each push to `main`; publication can lag while the workflow runs or if it fails. The images are not stored in Git. The script refuses to write any image when the focused branch's nodes differ from the overview or when the capture changed the document. Like the E2E fixture, it passes `-AppleShowScrollBars WhenScrolling` so CI runners without a trackpad draw overlay scrollbars.

Run `npm run screenshots:readme` on macOS to build and capture the images locally, for example after changing the capture script. It writes `tree-overview.png`, `tree-focus-dark.png`, `agenda-light.png`, `tree-search.png`, and `tree-commands.png` to ignored `reports/readme/`, replacing that directory only after every capture succeeds. Capture uses a verified device scale factor of 2 and lossless PNG output; README images keep their logical width of 860 pixels so high-density displays receive sharp text. Inspect all images, including matching node text and order, before relying on a script change. The command never stages or commits files.

The README maintenance rules are owned by `AGENTS.md` §11. This documentation gallery is separate from visual regression baselines: it is not a pixel acceptance test.

### Demo Video Generation

Run `npm run demo:video` on macOS to build the app, install Playwright's recording encoder, and record the predefined sequence in `scripts/record-demo.mts`. The script uses the committed synthetic screenshot document in a fresh temporary profile and opens a visible window so native keyboard input reaches the editor. The entire demo must use dark appearance, including window creation and closing, regardless of the machine's system appearance. Vim editing must remain enabled throughout the demo. The sequence opens Agenda from Root with `Cmd+P`, shows dated nodes from both the Work and neighborhood reading club branches, and returns to Tree. It then uses the keyboard for the Tree walkthrough: `zo` opens the root fold, `3j` selects the meetup branch, `zO` opens its nested folds, `gd` enters the branch, and `3j` selects the note. `A` appends in Insert mode and Escape returns to Normal mode. `0vw` demonstrates character Visual selection; `Vj` selects two sibling nodes; `>` and `<` move the selected nodes into and out of a parent; `u` and `Ctrl+r` demonstrate undo and redo of a move. No mouse clicks are used. Pauses are brief so the demo shows these actions within its duration budget. The original fixture and normal application profile are never edited.

`npm install` or `npm ci` installs Playwright. The command downloads Playwright's recording encoder when needed; no Homebrew installation or additional conversion encoder is required. Dependency installation and the first recording-encoder download require network access.

After inline editing, the demo opens search with `/`, types `book`, and shows two highlighted matches and their count. Escape cancels search. It then opens the command panel with `:`, shows the command list, types `show` to filter it to the Tree and Agenda commands, and cancels with Escape before continuing the editing walkthrough. Representative frames include `search.png`, `commands.png`, and `commands-filtered.png`.

After the move and undo/redo sequence, `gv` restores the two-node Visual selection and `d` cuts the selected discussion topics from the meetup's conversation outline. `Ctrl+o` returns to the overview, `zc` folds the meetup, `2j` selects “Ideas for later”, and `gd` enters that different branch. The destination is shown before `P` pastes the topics above its existing ideas. The capture verifies that the topics disappear from the source and appear together in the destination, with its existing children preserved.

Recording begins after the renderer and fonts are ready. Playwright's screencast captures at maximum frame quality, with a rendering scale of 1.5 and a 1500-by-1080 recording of the 1000-by-720 window. This improves source text clarity without enlarging the logical interface. The output remains a WebM video with standard playback controls.

The WebM video, representative PNG frames, and source metadata are written to ignored `reports/demo/`. Each run replaces that directory. Open `reports/demo/tree-demo.webm` in a compatible browser or video player to review playback and inspect the PNGs for text readability. This documentation demo does not replace visual regression tests. The video must be smaller than 5 MB (5,000,000 bytes) and shorter than 30 seconds. The script rejects empty recordings, missing or invalid WebM duration metadata, and recordings reaching either limit. The measured duration and file size are recorded in the output metadata.

The separate `Publish demo video and screenshots` workflow is dispatched after successful validation of a push to `main`. It also runs the README screenshot capture and assembles both outputs into ignored `reports/site/`. Successful runs upload that directory as a downloadable artifact with one-day retention. Runs on `main` also deploy it to GitHub Pages, keeping the README's video and image URLs stable without storing generated files in Git. A Pages deployment replaces the whole site, so any other published file must be added to this workflow's site directory rather than deployed by a separate workflow. Dispatch verifies the successful main run and exact SHA; arbitrary branch publication is rejected. A failed run deploys nothing, and Pages keeps the previous video and images.

## 3. Agent Tool Configuration

### Codex execution rules

Procedure §4 of `docs/AGENT_WORKFLOW.md` routes Codex sessions here. These rules are binding in Codex:

* For routed policy reads through the shell fallback, locate section boundaries with `rg -n '^## ' <file>` and return the required sections with read-only `sed -n`. For example, when procedure §4 routes here, read this subsection through the next heading. Keep track of sections already returned in the current context. Request missing sections or truncated lines separately. When reading for a role, include the shared inspection rules and all applicable role and tool sections.
* Run `npm run test:property` in the default workspace sandbox, including during full-project validation. This Vitest command needs no host execution permission.
* Check the current session's approved command prefixes before requesting a new allowance. Reuse a matching approval through the supported host-execution mechanism; do not ask the owner again in conversation. For a missing named npm workflow allowance, propose the reusable `npm run <script>` prefix rather than including a task-specific file or concurrency argument. Keep temporary probe approvals scoped to their script path; never replace them with unrestricted `node` permission. A platform prompt or denial remains authoritative even when a matching approval was expected.
* Request host execution from the first invocation of `npm run test:web:chromium`.
* Run Electron E2E tests outside the sandbox from the first invocation, using `sandbox_permissions: "require_escalated"` and the named npm workflows allowed by `.codex/rules/tests.rules` and `.codex/rules/e2e.rules`. Project rules require trusted `.codex/` configuration and are loaded at session startup; restart Codex after changing them. If a rule is unavailable, follow the platform approval flow rather than bypassing it.
* Retire a finished scratch task with `npm run retire:scratch -- <task>` outside the sandbox from the first invocation, using `sandbox_permissions: "require_escalated"`. `.codex/rules/scratch.rules` allows this guarded command, including the Git metadata updates needed for temporary worktrees. Let the command inspect and remove worktrees; do not precede it with raw `git worktree remove --force` or bypass a refusal with recursive deletion. Rule loading and trust requirements are the same as for the test commands above.

### Process interruption permissions

In Codex, `.codex/rules/processes.rules` allows `kill -INT <pid>` and `kill -TERM <pid>` outside the sandbox; in Claude Code, `.claude/settings.json` allows the same two forms and runs them outside the sandbox. Both refuse the all-process target `-1` and the process-group target `0`; Claude Code refuses any negative target, while Codex prefix rules check only the first target. The ownership and signal rules are in procedure §4.

### Tool rules and checks

Codex's project rules in `.codex/rules/tests.rules` allow the named Electron workflows of [Development Guide §8](DEVELOPMENT.md#8-tests), plus `npm run test:e2e:changed` and `npm run test:e2e:diagnose`, outside the sandbox, including their spec paths and flags. They load at startup when the project's `.codex/` configuration layer is trusted; restart Codex after adding or changing rules. More restrictive user or administrator rules still take precedence. These allowances authorize the complete npm scripts outside the sandbox, including their builds; review script changes with that permission in mind.

For process inspection in both tools, run `ps -axo pid=,ppid=,command=` by itself and inspect the returned text for the task's processes. Codex allows it through `.codex/rules/processes.rules`; Claude Code explicitly allows it and excludes it from the Bash sandbox in `.claude/settings.json`. Piping it into `rg` introduces a separate command requiring its own allowance. Verify task ownership before using the existing termination rules. Rules saved using Codex's terminal persistent-approval option belong to the user's Codex configuration; shared project allowances belong in the tracked `.codex/rules/` files. Check a Codex rule without executing the target command using `codex execpolicy check --rules .codex/rules/tests.rules npm run test:e2e:diagnose -- --shared-reset=reload --workers=6`.

The diagnostic and changed-spec workflows are shared entry points for Codex and Claude Code. Claude Code's existing `npm run test:e2e*` allowance and sandbox exclusion cover both. Configuration checks do not establish that a live tool has loaded these settings. In a fresh session of each tool, run `npm run test:e2e:changed -- --list`, a focused `npm run test:e2e:diagnose` invocation with JSON output, and the standalone process-inspection command. Record whether each ran without a prompt separately from its exit status. Do not save new personal approvals during this check or substitute another command after a denial. A successful check in one tool is not evidence for the other.

The root `CLAUDE.md` imports `AGENTS.md` so Claude Code sessions load the same repository policy as Codex, including versions that do not load `AGENTS.md` directly. Keep the shared policy in `AGENTS.md`; the import is only a compatibility adapter.

`npm run check:permissions` (`scripts/check-agent-permissions.mts`) checks the declared configuration of both tools. Every `npm run` workflow named in the Development Guide or this document must be a `package.json` script. Claude Code and Codex must run every standalone package workflow without a new approval; lifecycle hooks are exempt. The exception is the release: only the Product Owner runs it, and agents do not. The check therefore requires both tools to deny every local entry point into the release or its parts: `npm run release` and `make release` with any arguments, direct runs of the release and web-publication scripts, `gh release` and the dispatch of `Release new app version`. Claude Code denies them in `.claude/settings.json` (and denies every `node` invocation); Codex forbids them in `.codex/rules/release.rules`. A prefix rule matches the command as typed, so another spelling, such as a different runner or working directory, is not covered. For Claude Code the check applies deny, ask and allow rules in that precedence, then the sandbox exclusions and the sandbox auto-allow; for Codex it uses the literal `.codex/rules/` declarations and the sandbox-tooling exemptions in `scripts/codex-rules.mts`. It also checks the Claude Code Safari and mutation host allowances and the shell-editing deny category below. It establishes declared configuration, not live prompt behavior.

Codex's tracked `.codex/rules/` files allow the named host workflows independently of saved personal approvals. `scripts/codex-permissions.test.mts` checks package-script coverage against literal repository declarations, with explicit exemptions for sandbox tooling and lifecycle hooks. The coverage test is not a Starlark evaluator: validate effective matching with `codex execpolicy check` when changing rules. Project rules load only from a trusted project configuration layer at startup; restart Codex before checking live prompt behavior. A native policy match establishes rule matching, not whether an existing session loaded the updated files.

Mutation testing uses the named `npm run test:mutation` host allowance, including the local `--shard application` selector and ordinary Stryker arguments such as `--mutate` and `--concurrency`. Use the argument selector for local layer runs instead of a shell environment prefix, which does not match the named npm permission rule in Codex. It is not exempt sandbox tooling: the test runner needs local worker communication. Saved approvals for individual scratch probes remain separate from tracked project rules; they do not establish access to other probes.

Use `npm run test:safari` for the maintained real-Safari smoke checks on macOS. It builds the static package and checks typing, synthetic URL paste and reload persistence through SafariDriver. The command uses a fresh loopback origin and an isolated WebDriver session, leaves the system clipboard untouched, and closes its session, driver and server on completion or interruption. Its only optional argument is `-- --help`; it does not accept external scripts, origins or browser profiles. The screenshot is saved to `test-results/safari/smoke.png`. Synthetic paste checks the application handler, not native clipboard integration. The owner must enable Safari Remote Automation once; the runner never changes that setting. Codex allows this named command; Claude also excludes it and mutation testing from its Bash sandbox. Restart the relevant client after configuration changes. Configuration checks do not establish live approval behavior in another client.

`AGENTS.md` §4 requires repository edits to go through the agent's own file-editing tool rather than shell scripting. Claude Code enforces this category through interpreter and in-place stream-editing deny rules in its configuration. In Codex, the edit-tool requirement is instruction-enforced: `sandbox_mode = "workspace-write"` in `.codex/config.toml` restricts filesystem scope, not the choice of editing command. See `docs/AGENT_ROLES.md` for each role's mechanical and instruction-only boundaries. Read-only stream editing and search stay available in Claude Code, because the requirement concerns writes. `npm run check:permissions` checks this deny category in `.claude/settings.json`. It does not establish Codex command restrictions or verify that a running tool loaded its configuration. Keep exact patterns in each tool's configuration rather than duplicating them here.

Claude Code is configured in `.claude/settings.json` for sessions that run with few or no approval prompts:

* **Mode and boundary.** Sessions start in auto mode, and Bash commands run inside Claude Code's macOS sandbox. Sandboxed commands may write only inside the repository and `$TMPDIR`, may not read the rest of the home directory, may reach only the npm registry and GitHub, and do not see the secret environment variables listed in `sandbox.credentials`. Inside that boundary, Bash commands run without a prompt.
* **Electron workflows.** Electron cannot start under the sandbox, so the end-to-end, performance, and `check:full` workflows are listed in `sandbox.excludedCommands`. They run outside the sandbox, still without a prompt, because they are in the allow list.
* **Browser workflows.** The sandbox forbids binding local ports and reaching Docker, so `npm run test:web`, `npm run test:web:built` and `npm run test:web:chromium` fail inside it. Run them outside the sandbox through the platform approval flow.
* **Safari workflows.** `npm run test:safari` and `npm run test:smoke:safari` start a loopback server and SafariDriver, so they are listed in `sandbox.excludedCommands`; the `npm run test:perf*` exclusion covers `npm run test:perf:safari`. They run outside the sandbox without a prompt. Safari Remote Automation remains an owner-enabled prerequisite.
* **npm cache.** Commands that write the npm cache under the home directory, such as `npm view` or `npm install`, fail inside the sandbox with an `EPERM` error. That error is the sandbox boundary, not a broken cache.
* **Denied operations.** Replaceable operations are denied outright so the agent switches to the dedicated tool: `cat`, `tee`, `curl`, `wget`, `env`, interpreter wrappers, history rewrites, and writes under `/tmp`. `PreToolUse` hooks also deny `&&` and `||` chains, shell loops, file redirection and heredocs, and `find` with `-exec` or `-delete`. Redirection to `/dev/null` and `2>&1` stays allowed.
* **Release commands.** Only the Product Owner runs a release; the release entry points listed above are denied.
* **Prompts that remain.** Pushing, dependency changes, and recursive deletion keep a prompt.
* **Agent self-modification.** In auto mode, the auto-mode classifier refuses an agent's attempt to edit Claude Code's own permission settings. The sandbox also denies Bash writes to the settings files. A change to this policy therefore needs the Product Owner to leave auto mode and approve the edit.

Allowed npm scripts and Git hooks execute mutable repository code with the host user's authority. The policy assumes this repository is trusted and reduces accidental or unexpected shell use; it does not protect the host from deliberately malicious repository code.

## 4. Historical Measurements

### Historical macOS memory evidence

The memory separation on 2026-10-15 preserved the original combined coverage as disjoint sets of 785 ordinary and two memory cases, including all 16 ordinary shared-application infrastructure cases. Both memory controls passed with their sample attachments; the shared and fresh controls took 32.12 s and 74.55 s. One sequential same-host hidden six-worker comparison passed the original 787 cases in 219.31 s and the 785 ordinary cases in 195.45 s, excluding builds of 0.61 s and 0.70 s. Ordinary launches fell from 802 to 705. The 23.86 s / 10.9% wall-time reduction is one local comparison with host variance; separate scheduling moves the memory work rather than eliminating it. This result is separate from the reuse rollout measured in [Development Guide §8](DEVELOPMENT.md#choosing-test-coverage).

The test-cost investigation on 2026-11-06 evaluated 33 hypotheses and experiments against baseline `d02aa39`, including rejected migrations and a failed concurrent-validation run. It removed two Electron cases (952→950), added eight net focused cases, and simplified unrelated setup in deletion, empty-row and reorder-history tests. Both editing modes and native focus destinations remain. The complete-document App history oracle detected a deliberately broken Redo; all four filesystem version/enumeration variants detected a reversed generation comparator. Both production faults were restored. Literal numeric/signed emoji expectations and exact Backspace Undo content/identity assertions strengthened protection without additional Electron launches. These results support the coverage ownership described in [Development Guide §8](DEVELOPMENT.md#choosing-test-coverage), not a target test count.

The isolated local macOS comparison used `deletion.spec.ts history.spec.ts empty-node.spec.ts persistence-reliability.spec.ts spellcheck.spec.ts --workers=4 --repeat-each=3 --reporter=dot,json` through `test:e2e:diagnose`. Only the four changed specs were temporarily restored to the baseline for the control run; `spellcheck.spec.ts` was unchanged. No other test runner overlapped.

| Measure | Baseline | Candidate |
| --- | ---: | ---: |
| Passing cases, including three repetitions | 141 | 135 |
| Failures / retries / skips | 0 / 0 / 0 | 0 / 0 / 0 |
| Wall time | 36.61 s | 32.28 s |
| Summed test time | 134.86 s | 116.65 s |
| Fresh launches | 150 | 144 |
| Summed launch phases | 100.15 s | 87.52 s |
| Unchanged spellcheck control, summed | 2.52 s | 2.15 s |

The observed 11.8% wall reduction is not attributable entirely to the changes: the unchanged control also improved 14.7%, and mean launch cost fell. Two fewer fresh launches per full run are established; a substantial whole-suite speedup is not. An isolated empty-row comparison was effectively unchanged (9.85→9.78 s). The complete candidate measured 254.52 s wall with 878 launches and no retries or skips; it has no matched full-suite baseline. Launch/setup cost remains a useful optimization target, but confidence and isolation take precedence over case count.

Several apparently cheaper substitutions did not establish equivalent protection:

* The real App Agenda Replace prototype lost Replace mode during readonly-row focus/click setup, while the native cases passed. Keep those cases until the harness can establish the production precondition without fabricated state; distinct command dispatches still need coverage.
* Long wrapped/nested scroll walks assert intermediate caret context and virtualization transitions; final `gg/G` geometry does not replace them. Negative autoscroll waits observe absence over time. Native hold margins exceed the production activation interval, but a smaller reliable margin was not established.
* Signed emoji samples already share an application launch and exercise punctuation input and acceptance. Browser storage tests still cover production composition because startup unit tests mock the storage policy. Before considering storage migration, strengthen the refused-request case to assert an actual edit, not only successful startup and absence of errors.
* Broader application reuse still requires ADR 0021 reset, recovery and memory evidence. Lowering coverage floors would not accelerate existing tests. Neither isolation nor thresholds, retries, timeouts, dependencies or screenshot tolerances changed.

The instruction audit clarified property-test reuse, representative IPC boundary coverage and shared Vim native evidence in their owning policy files. Existing coverage must be assessed rather than edited or duplicated merely to satisfy a quota. The investigation did not establish that those earlier instructions caused the current suite size.

Overlapping full coverage with Electron caused ten unrelated unit timeouts; sequential coverage passed unchanged in 28.20 s versus 122.11 s under contention. Treat this as evidence against competing local runners, not a product regression or justification for larger timeouts. The investigation also exposed a timing-command path defect: Playwright resolved the relative JSON output under the configuration directory. `test:e2e:timing` now uses the existing diagnostic wrapper's absolute-path resolution before summarizing the report.
