# Linux Electron E2E allocation

Status: **Awaiting owner acceptance**. All three implementation tasks are complete.

## Objective and authorization

Reduce macOS GitHub runner consumption by executing portable functional tests in
Linux Electron while retaining macOS visual and native integration coverage.
The owner approved this three-task initiative in conversation on 2026-11-05.
Approval covers implementation, validation, review corrections and task commits;
it does not authorize publication or Linux desktop product support.
The owner subsequently instructed the agent to complete all remaining tasks in
the same session without requesting session rotation or renewed task approval.
The owner additionally granted standing authorization for Linux Electron E2E in
Docker on 2026-11-05; the durable record is in the development guide's container
testing section. The earlier canceled execution request is superseded by this
explicit permission, not bypassed.

On 2026-11-05 the owner explicitly accepted the risk of the existing minimatch
advisory GHSA-g3hv-75wg-m249 for this initiative and instructed the agent not to
ask about it again. Treat this advisory and its transitive audit entries as an
accepted exception to the initiative's audit gate. Keep audit results truthful;
do not describe a failing audit as passing. This decision does not authorize
dependency changes, global audit suppression or exceptions for other advisories.

Use Codex. Preserve product behavior, Apple shortcut semantics in the Electron
renderer, existing screenshot baselines, editing-mode coverage and failure paths.
Do not increase scheduled execution frequency or add full E2E to ordinary PRs.
Do not weaken assertions to accommodate Linux. Keep a full local macOS command.
New dependencies, product changes and weakened native coverage remain reserved.

Sources: [development](../docs/DEVELOPMENT.md),
[workflow](../docs/AGENT_WORKFLOW.md), [roles](../docs/AGENT_ROLES.md),
[Electron test rules](../e2e/electron/AGENTS.md),
[rendering scale](../docs/decisions/0019-canonical-e2e-rendering-scale.md),
[application reuse](../docs/decisions/0021-worker-owned-e2e-application-reuse.md).

## Tasks

| ID | Outcome and expected files | Dependencies | Validation and acceptance | Status |
| --- | --- | --- | --- | --- |
| L1 | Portable fixture and bounded Linux pilot: `e2e/electron/fixtures.ts`, process cleanup, `config/testing/`, isolated container runner under `scripts/web/`, npm command and development instructions | None | High Risk: static/check stages, full local macOS E2E, Linux pilot and independent review passed; existing advisory accepted by owner | Done |
| L2 | Allocate portable functional coverage and split suitable mixed specs without losing macOS visual/native checks: selected `e2e/electron/*.spec.ts`, platform selection and selection guards | L1 | Low Risk tooling/tests; both platform subsets, discovery union/overlap guards, unchanged baselines and independent review passed | Done |
| L3 | Replace redundant macOS CI execution with measured Linux/macOS allocation: `.github/workflows/run-electron-e2e-tests.yml`, development documentation and related CI guards | L2 | Low Risk tooling: full check, selection/gate tests and independent review/verification passed; local platform evidence reused; hosted savings explicitly unverified | Done |

There are three substantive working tasks. Execute within this scope, using the
standard limit of two unsuccessful recovery attempts at one unchanged blocker
and at most four task commits per primary session. No numeric time or token
budget was requested. Closure is a separate documentation-only step after owner
acceptance; waiting does not consume implementation work.

## Findings and capabilities

- Starting commit: `c14861f`; working tree was clean.
- Test discovery listed 979 cases in 84 functional spec files. Thirty-six files
  contain screenshot comparisons and collectively contain 639 cases, many of
  which are functional. These are discovery counts, not duration estimates.
- CI previously ran six macOS shards; the delivered workflow uses four macOS
  shards and one Linux job, four workers each, weekly/manually and for release
  candidates. Ordinary PRs still use Linux and macOS smoke checks.
- Docker and its Linux ARM64 daemon are available. The current prepared dependency
  image exists. The existing isolated Linux smoke command passed both Electron
  and Chromium on 2026-11-05. Agents must not prepare replacement images.
- The allocated Linux functional subset is verified; new GitHub Linux AMD64
  resource measurements remain unverified. Local ARM64
  timings do not establish hosted runner savings.
- The initial fixture used macOS scrollbar defaults and Darwin-only stale-process
  cleanup. L1 preserves the macOS geometry contract, uses native Linux scrollbar
  geometry and supports owned Linux processes plus known macOS bundle helpers.
  Native shortcuts, updater activation and screenshot coverage need
  explicit macOS ownership. Do not replace renderer `Meta` shortcuts globally.
- Standing Docker authorization is committed as `7f7e3ee`, including Codex and
  OpenCode command rules. The live session also saved the execution prefix.
- L1 is delivered with this plan update. The revised Linux pilot passed 46 cases;
  the full macOS suite passed 979. All static/check stages and isolated coverage
  passed (5882 tests). An initial coverage timeout under concurrent E2E load
  resolved without changing tests. A reviewer-found macOS helper-matching omission
  was corrected with a failing-then-passing regression and 20 passing affected
  lifecycle cases. Independent review and workflow verification found no remaining
  meaningful issues. The reusable validation record is below.
- The first exploratory Linux run exposed native image clipboard, pointer
  selection and one Vim linked-caret difference. Those cases remain macOS-owned;
  no assertions, production code or baselines were weakened. The bounded pilot
  proves text clipboard, Tab, initial persistence, archive workers and shared reset.
- `npm run audit` fails on existing minimatch advisory
  [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  Dependencies and lockfile are unchanged. npm reports no available fix for this
  graph; the advisory lists upstream 11.0.1 as patched. The owner accepted this
  risk as recorded above. It no longer blocks initiative progress or task commits.

## L1 validation reuse

All results apply to the L1 source delivered with this plan update. The final
correction only extends macOS stale-process matching to known helper paths in
the same bundle; Linux behavior, production sources and snapshots are unchanged.

| Check | Result and scope |
| --- | --- |
| `npm run test:e2e:linux` | 46 passed, 17.8 seconds; isolated Linux ARM64, four workers, no retries |
| `npm run test:e2e` | 979 passed, 4.5 minutes; full macOS suite, six workers, unchanged snapshots |
| `npm run check` | Static/governance stages passed; one coverage test timed out under simultaneous E2E load; later stages resolved below |
| `npm run test:coverage` | Isolated retry: 304 files, 5882 tests and coverage thresholds passed in 22.86 seconds; no test weakening |
| Production build | Passed within the full and final focused Electron commands on unchanged production inputs |
| `npm test -- scripts/electron-process.test.mts scripts/web/chromium.test.mts scripts/web/container-entry.test.mts` | 24 passed before helper correction; then matcher-only run passed all three tests, including the new failing-before-fix regression |
| `npm run test:e2e -- shared-application.spec.ts window-visibility.spec.ts renderer-failures.spec.ts` | After helper correction: 20 passed in 8.3 seconds |
| `npm run typecheck:e2e`, `npm run typecheck:scripts`, focused ESLint and `npm run format:check:changed` | Passed after helper correction |
| `npm run audit` | Existing minimatch advisory reported; owner-accepted risk, not a passing audit |
| Independent review and workflow verification | No remaining meaningful issues; reviewer confirmed helper correction |

`npm run fix:history` flagged repeated package.json fixes. Those dependency/release
changes do not share the introduced process-matcher omission; no additional
structural initiative is needed for that bucket. No Electron product performance
suite applies because no production performance path changes.

## Owner involvement

| Stage | Expected owner action | Gate |
| --- | --- | --- |
| L1–L2 | No manual product checks currently expected; automation exercises test infrastructure | Pre-commit automated validation and independent review |
| L3 | No manual product check; distinguish historical hosted timings from local measurements of the new allocation | Read access verified; new hosted execution unverified |
| Final result | Accept the delivered initiative, or identify remaining issues | One planned acceptance round after all three tasks |

Additional permission prompts use the tool's supported approval mechanism. A
missing dependency image requires owner preparation with `make setup`.

## Next task

No implementation task remains. The owner can inspect the platform allocation in
`config/testing/electron-platforms.ts`, the two platform configurations, and
`.github/workflows/run-electron-e2e-tests.yml`. The unchanged complete local command
is `npm run test:e2e`; the approved isolated Linux command is `npm run test:e2e:linux`.
Accept the delivered result or identify remaining issues. After acceptance, close
this initiative by removing its plan and index entry. Do not request renewed
Docker, minimatch or session-continuation approval. No publication is authorized.

## L2 result and reusable evidence

The allocation contains 219 Linux cases and 782 macOS cases, with 22 intentional
shared launch/reset/text-clipboard cases. Their union is the original 979 cases.
Fifteen files are Linux-owned; 62 test declarations in five mixed specs opt in via
tags. New files and untagged mixed cases stay on macOS. No test bodies, production
sources, dependencies or snapshot baselines changed. The exploratory attachment
cleanup case failed at native image paste and remains wholly macOS-owned.

`npm run check` passed every stage (305 files, 5884 unit tests). Final
`npm run test:e2e:linux` passed 219 cases in 1.9 minutes, four workers, zero retries,
inside the isolated Linux ARM64 container. The macOS complement passed 782 cases
with four workers in 197.2 seconds, no skips, retries or flaky cases:
`npm run test:e2e:diagnose -- --json-output=.scratch/linux-electron-e2e/macos.json --config=config/testing/playwright.macos.config.ts --workers=4 --reporter=list,json`.
The report sums test durations to 734.8 worker-seconds; this is not hosted billing.
After a final allowlist assertion, the focused allocation guard passed again.
Independent review found no meaningful issues. L1's full local macOS result remains
valid for unchanged scenario bodies; platform ordering was exercised by both subsets.

Read-only GitHub access is verified. Historical
[run 41289362290](https://github.com/abtv/tree/actions/runs/41289362290), SHA
`572e1e6`, used 1367 seconds across six macOS jobs (22.78 runner-minutes), with
individual job durations of 107–317 seconds. It is an older source snapshot, not
a controlled comparison. New hosted savings require the first updated workflow
run; local ARM64 numbers cannot establish them. No publication is authorized.

## L3 result and limitations

Four macOS shards use the validated complement; one Linux job uses Xvfb and the
validated Linux configuration. Each has a 12-minute deadline and four workers.
The stable aggregate check requires both platform groups to succeed. Platform,
shard and attempt distinguish failure artifacts. Scheduled/manual/release cadence,
audit behavior, full local macOS validation and the memory workflow are unchanged.

`npm run check` passed every stage (306 files, 5886 tests, coverage and build).
`npm test -- scripts/electron-workflow.test.mts scripts/web-release/workflows.test.mts scripts/electron-platforms.test.mts`
passed all ten focused tests. The workflow guard executes the actual aggregate
shell for all 16 combinations of success, failure, cancellation and skip. The
allocation guard loads the real Playwright configurations and test declarations.
L2 platform runs remain valid: L3 changes neither tests nor their runtime inputs.
Independent code review and workflow verification found no meaningful issues.

This replaces 197 macOS case executions with Linux execution, reducing the macOS
case count by about 20%, and reduces macOS dependency/build preparations from six
to four. These facts do not establish a hosted time or monetary saving. The new
workflow has not been published or executed on GitHub; observe its first hosted
run before claiming runner-minute savings or tuning shard counts again.

Implementation commits: L1 `b2ec40d`, L2 `004cb1f`, and the L3 commit containing
this final status. The standing Docker authorization is `7f7e3ee`. No unresolved
local validation failures remain; the earlier Linux native-image failure is
covered by the retained, passing macOS scenario. The accepted minimatch risk
remains as recorded above. Final owner acceptance is the only closure gate.

## Resume prompt

Continue the approved Linux Electron E2E allocation initiative from
`plans/linux-electron-e2e.md`. Resume its exact next task and preserve the recorded
coverage, execution-cadence and final-acceptance boundaries.
