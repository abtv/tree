# Linux Electron E2E allocation

## Objective and authorization

Reduce macOS GitHub runner consumption by executing portable functional tests in
Linux Electron while retaining macOS visual and native integration coverage.
The owner approved this three-task initiative in conversation on 2026-11-05.
Approval covers implementation, validation, review corrections and task commits;
it does not authorize publication or Linux desktop product support.
The owner additionally granted standing authorization for Linux Electron E2E in
Docker on 2026-11-05; the durable record is in the development guide's container
testing section. The earlier canceled execution request is superseded by this
explicit permission, not bypassed.

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
| L1 | Portable fixture and bounded Linux pilot: `e2e/electron/fixtures.ts`, process cleanup, `config/testing/`, isolated container runner under `scripts/web/`, npm command and development instructions | None | High Risk: `npm run check`, full local macOS E2E, audit, real Linux pilot and process/reset coverage; independent review | Blocked |
| L2 | Allocate portable functional coverage and split suitable mixed specs without losing macOS visual/native checks: selected `e2e/electron/*.spec.ts`, platform selection and selection guards | L1 | High Risk where shared fixtures change; otherwise Low Risk tooling/tests with complete affected suites on both platforms. Demonstrate coverage union, intentional overlap and unchanged baselines; independent review | Planned |
| L3 | Replace redundant macOS CI execution with measured Linux/macOS allocation: `.github/workflows/run-electron-e2e-tests.yml`, development documentation and related CI guards | L2 | Low Risk tooling: `npm run check`, selection/gate tests, platform runs, resource measurements with environment limits; retain release gating and execution cadence | Planned |

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
- CI currently runs six macOS shards, four workers each, weekly/manually and for
  release candidates. Ordinary PRs already use Linux and macOS smoke checks.
- Docker and its Linux ARM64 daemon are available. The current prepared dependency
  image exists. The existing isolated Linux smoke command passed both Electron
  and Chromium on 2026-11-05. Agents must not prepare replacement images.
- Full Linux fixture execution and GitHub Linux AMD64 resource measurements remain
  unverified. Local ARM64 timings do not establish hosted runner savings.
- The full fixture enforces macOS scrollbar defaults and Darwin-only stale-process
  cleanup. Native shortcuts, updater activation and screenshot coverage need
  explicit macOS ownership. Do not replace renderer `Meta` shortcuts globally.
- Standing Docker authorization is committed as `7f7e3ee`, including Codex and
  OpenCode command rules. The live session also saved the execution prefix.
- L1 implementation is uncommitted. The revised Linux pilot passed 46 cases;
  the full macOS suite passed 979. All static/check stages and isolated coverage
  passed (5882 tests). An initial coverage timeout under concurrent E2E load
  resolved without changing tests. A reviewer-found macOS helper-matching omission
  was corrected with a failing-then-passing regression and 20 passing affected
  lifecycle cases. Independent review and workflow verification found no remaining
  meaningful issues. Exact temporary evidence is in `WORKING_PLAN.md`.
- The first exploratory Linux run exposed native image clipboard, pointer
  selection and one Vim linked-caret difference. Those cases remain macOS-owned;
  no assertions, production code or baselines were weakened. The bounded pilot
  proves text clipboard, Tab, initial persistence, archive workers and shared reset.
- `npm run audit` fails on existing minimatch advisory
  [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
  Dependencies and lockfile are unchanged. npm reports no available fix for this
  graph; the advisory lists upstream 11.0.1 as patched. The owner has been asked
  whether to accept an initiative-scoped exception for this advisory, without
  suppressing audit or changing dependencies. No response has been received.

## Owner involvement

| Stage | Expected owner action | Gate |
| --- | --- | --- |
| L1–L2 | No manual product checks currently expected; automation exercises test infrastructure | Pre-commit automated validation and independent review |
| L3 | Hosted CI access/run may require owner action if unavailable; report before claiming hosted measurements | Capability unresolved |
| Final result | Accept the delivered initiative, or identify remaining issues | One planned acceptance round after all three tasks |

Additional permission prompts use the tool's supported approval mechanism. A
missing dependency image requires owner preparation with `make setup`.

## Next task

L1 cannot be committed or marked complete until the owner resolves the audit
gate. If the owner authorizes the requested advisory-specific exception, record
its exact scope, reuse valid evidence, remove `WORKING_PLAN.md` before the L1
implementation commit and advance to L2. Otherwise retain the uncommitted work;
dependency remediation is not authorized by the Linux migration scope. The
planning record can be committed independently of the blocked implementation.

## Resume prompt

Continue the approved Linux Electron E2E allocation initiative from
`plans/linux-electron-e2e.md`. Resume its exact next task and preserve the recorded
coverage, execution-cadence and final-acceptance boundaries.
