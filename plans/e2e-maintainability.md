# Electron E2E maintainability follow-up

Status: **In progress**. The initial items are delivered at `52d85cd` and
`1875860`. On 2026-11-06 the owner authorized the deeper layering work below,
in this session with logical commits and the existing npm advisory exception.

## Authorization and boundaries

On 2026-11-05 the owner authorized all five follow-up items in the same session,
with logical commits as needed. The five items are stable clipboard selection,
helper-safe Linux snapshot protection, existing hosted-run analysis, flaky-test
inspection, and test-level redundancy inspection. Preserve coverage, product
behavior, dependencies, snapshot baselines and CI cadence. Do not expand Linux
allocation without measured benefit. No publication or extra hosted runs are needed.
The owner accepts minimatch advisory GHSA-g3hv-75wg-m249 and its transitive audit
entries for this work; this is not a passing audit or permission to suppress it.

## Tasks

The initial scope had five substantive implementation/investigation items. The
authorized extension below brings the count to eight and permits more than four
logical commits in this session. Final
owner acceptance is required before retiring this plan. No manual product check
is expected because product behavior is unchanged.

| Item | Scope and acceptance | Status |
| --- | --- | --- |
| 1 | Replace title-based clipboard selection in platform configs and `clipboard.spec.ts`; discovery must retain both scenarios in both editing modes | Done |
| 2 | Reject Linux snapshot assertions even through helpers; focused negative regression, full local macOS and Linux validation, independent review for shared assertion fixture | Done |
| 3 | Read existing GitHub runs and record whether more allocation changes are justified; do not dispatch more runs | Done; retain allocation |
| 4 | Inspect hosted failures and timer-sensitive E2E; correct confirmed test defects with regression evidence, preserve meaningful waits | Done; full suite passed, no new reproduced defect |
| 5 | Inspect representative E2E rule matrices against focused coverage; remove only proven duplication while retaining real boundary coverage | Done; retain existing boundary cases |

## Validation and capabilities

Repository reads, Git history, GitHub run listing and npm audit work in this
session. Audit reports only the accepted advisory (17 transitive package entries).
`npm run fix:history` for platform selection, allocation tests, clipboard and
fixtures found no fixes in the 14-day window. Shared assertion fixture changes
use High Risk validation: `npm run check`, full local Electron E2E, Linux subset,
audit (accepted exception) and independent review. No performance run is needed:
production timing, state and process lifecycle are unchanged.

## Next action

Complete tasks 9–12 below in this session. Final owner acceptance applies to
the combined delivered result; no manual application check is expected for
test-only changes. Continue autonomously unless a critical blocker arises.

## Authorized layering work (2026-11-06)

The owner approved the deeper analysis recommendation: reduce repeated visual
states, move completion rule matrices into real App/store integration tests,
then simplify Agenda command matrices while strengthening their no-op oracle.
This expands the prior no-baseline-change boundary only for the selected
visual families. Preserve real native input, caret/selection, popup placement,
clipboard, persistence/restart and failure coverage. No production behavior,
dependencies, browser test framework, process reuse, CI cadence or blanket
editing-mode reduction is authorized. Do not use GitHub logs. The accepted
minimatch advisory remains an explicit exception, not a clean audit result.

| Item | Scope and acceptance | Status |
| --- | --- | --- |
| 9 | Reduce repeated breadcrumb, completion-popup, Insert-date and typography PNGs; retain mode-sensitive rendering and geometry. Own the corresponding Electron specs/baselines and Development guidance. Inspect new cropped popup baselines and run all affected specs. | Done |
| 10 | Add real App/NodeInput/popup/store completion integration coverage before reducing grammar/refinement E2E combinations in `agenda-completion.spec.ts`; preserve unique native paths and exact replacement/Undo. No replacement UI or production test hook. | Done |
| 11 | Add real App/store Agenda command no-op coverage, shorten the repeated Electron command table, and ensure retained disk assertions wait for saves. Preserve native focus/caret and both modes. | In progress |
| 12 | Validate the complete result, independently review coverage ownership, record measured costs and lasting guidance in Development, and commit remaining work. | Ready |

These are four additional substantive tasks. Use Low Risk affected checks for
test-only changes: types, scoped lint/format/governance, focused unit and E2E.
Run the complete local `npm run check` and Electron suite for the final combined
coverage migration. Reuse Linux validation when its exercised inputs remain
unchanged; otherwise run its affected allocation. No product performance suite
is needed. New visual baselines require real Electron capture and inspection.
The prior 979-case report at `1875860` remains the full baseline. Use matched
focused local measurements for selected families, without concurrent test
processes. Temporary evidence lives in `.scratch/e2e-layering/`.

The review-before-removal rule is coverage based: identify the retained fast
test and the distinct real-boundary representative for every removed matrix.
Demonstrate that new assertions detect controlled wrong outcomes before relying
on them. Do not trade a lower test count for long coupled scenarios.

Task 9 reduced the selected families from 32 PNGs to 14 (238 to 220 overall).
Both new cropped popup baselines were captured and inspected in Electron.
The six affected specs retained all 131 cases and passed without retries:
matched six-worker runs took 80.55 seconds before and 80.05 seconds after.
This reduces baseline maintenance, not demonstrated runtime cost. Native
geometry, both editing modes and distinct Vim rendering remain covered.
Affected E2E types, lint, formatting, documentation and mode checks passed.

Task 10 adds 38 real App/store completion checks (1.6 seconds locally), covering
all five migrated grammar families in both views and modes. A temporary no-op
Undo mutation failed the exact restored-text assertions in both modes; the
mutation was removed and all 38 cases passed. The shared test fixture supplies
host services, a fixed date and missing jsdom geometry only. It does not replace
the actual popup, editor, handlers, store or their dispatch wiring.
Twenty Electron grammar cases became four native Tab/visibility/caret cases;
the retained completion spec passed all 22 cases in 12.1 seconds. Native
mouse/keyboard, paste, hyperlink, focus, plain/rich and geometry checks remain.
Renderer/E2E types, scoped lint, requirements and editing-mode guards passed.

## Authorized local cost review

The owner authorized continuation in this session, including more than four
logical commits if needed, and accepted the existing minimatch advisory for
this extension. Do not access GitHub logs; collect timings locally. The owner
will be away: interrupt only for completion or a critical blocker. Preserve
production behavior, native boundary coverage, editor modes, failure paths,
snapshots, CI allocation and frequency. No new dependencies or wider process
reuse are implied. Current local capabilities were verified earlier this session.

| Item | Scope and acceptance | Status |
| --- | --- | --- |
| 6 | Measure the full local suite with the existing diagnostic runner, choose a bounded set of costly scenarios, map their unique risks to lower-level coverage | Done |
| 7 | Simplify repeated setup or proven redundant matrices in selected specs, preserve boundary assertions; use focused before/after timings and affected validation | Done |
| 8 | Review the complete result, verify affected suites/platforms, document lasting test ownership and measurement limits | Done |

Initial measurement: `npm run test:e2e:diagnose -- --json-output=.scratch/e2e-cost-review/baseline.json --workers=6 --reporter=dot,json`.
This is measurement, not repetition solely for reassurance. The prior full run
had no retained timing report. Keep before/after inputs and worker counts matched.
No product performance suite is needed for test-only setup changes. Do not
introduce new fixture lifecycle machinery merely to reduce launch counts.

### Local selection and coverage mapping

The baseline passed 979 cases in 223.05 seconds, with 1184.92 summed test
seconds, 905 launches and no skips/retries. Launch phases accounted for 645.65
summed seconds; widening process reuse is outside this bounded review.

| Selected area | Baseline cost | Decision and retained evidence |
| --- | --- | --- |
| Quit failure/retry | Five slow cases total 35.32 seconds across shutdown, persistence reliability and lock specs | Use the existing captured quit timer instead of wall-clock expiry; retain menu/window, IPC, save/attachment failure, cancellation, retry and disk/restart assertions. `quit-handshake.test.ts` owns timer/duplicate rules. |
| Drag setup | `drag-and-drop.spec.ts` totals 34.52 seconds | Measure replacing repeated typed sibling setup with synthetic seeds; preserve actual pointer gestures and pre-action focus, caret and mode. Enter/type/history remain in editing/history suites. |
| Hierarchy drag | Highest file total: 112.47 seconds | Seed the expanded depth-limit tree instead of 19 disclosure clicks per case; retain real row/gap targeting, scrolling and depth errors. `inline-expansion.spec.ts` owns disclosure interactions. Keep remount, editor state, screenshots and restart cases; existing App/store matrices own abstract move combinations. |
| Recent-node scrolling | Slowest case: 11.17 seconds | Retain frame-by-frame invariant and both appearances; unit tests cannot prove transient selection visibility. |
| Vim wrapped-line scrolling | Two cases: 9.07 and 7.62 seconds | Retain real plain/rich geometry across both directions and oversized nodes; this is not a redundant rule matrix. |

Focused repeated baseline (four workers, three repetitions):
`npm run test:e2e:diagnose -- --json-output=.scratch/e2e-cost-review/focused-before.json shutdown-failures.spec.ts persistence-reliability.spec.ts persistence-lock.spec.ts drag-and-drop.spec.ts --repeat-each=3 --workers=4 --reporter=dot,json`.
No product, architecture or dependency decision is needed. The configured planner
confirmed the bounded timer and setup approach; no additional process reuse,
test framework or speculative E2E deletion is planned.

### Local implementation and validation

- Five quit-failure cases now expire the original captured main-process timer
  after observing the failure/cancellation and absence of a timeout message.
  The duplicate-request case gates only the first production save, verifies the
  disk write and rejected stale confirmation, then retries through the menu.
  Its two obsolete shared delay helpers were removed. No quit callback or
  persistence implementation was substituted.
- Seven drag declarations use a seeded sibling document with explicit focus and
  caret preparation. The gesture assertions and both editing modes remain.
  Depth-limit tests share one expanded seed; all three real drag cases remain.
  No E2E cases, restart checks, screenshots or matrix combinations were removed.
- The focused baseline passed 138 executions in 56.24 seconds (205.96 summed
  seconds); the identical command with `focused-after.json` passed in 42.73
  seconds (136.34 summed). Both used four workers and three repetitions, with
  zero retries/skips. The drag file alone did not improve (72.85 to 76.50 summed
  seconds); launch time also increased. Keep that seed change for simpler,
  independent preparation, without claiming a measured drag speedup.
- Hierarchy comparison commands:
  `npm run test:e2e:diagnose -- --json-output=.scratch/e2e-cost-review/hierarchy-before.json drag-and-drop-hierarchy.spec.ts --grep over-depth --repeat-each=3 --workers=4 --reporter=dot,json`
  and the identical command with `hierarchy-after.json`. Both passed nine
  executions, using three effective workers, without retries/skips. Wall time
  fell from 6.85 to 5.07 seconds; summed time from 19.58 to 13.94 seconds, with
  essentially unchanged launch time (4.14 versus 4.21 seconds).
- Measurements are local same-machine samples, not a hosted CI savings
  guarantee. Slow frame/geometry tests and lifecycle restarts remain because
  they detect failures the lower-level suites cannot reproduce.
- `npm run fix:history -- e2e/electron/shutdown-failures.spec.ts e2e/electron/persistence-reliability.spec.ts e2e/electron/persistence-lock.spec.ts e2e/electron/drag-and-drop.spec.ts e2e/electron/fixtures.ts`
  found only the already-corrected pointer-hold fix `2fbdab2`, with no recurring
  bucket. The separate hierarchy-spec check found no fixes in the window.
- Shared helper removal uses High Risk validation: full `npm run check`, full
  macOS E2E, and independent review. Reuse the same-session audit exception;
  dependency inputs are unchanged. Linux allocation does not select any edited
  spec, and the deleted exports had only the removed macOS consumer; the prior
  Linux runtime result remains applicable to its exercised behavior. No new
  product/native UI behavior requires manual verification.
- `npm run check` passed type checks, lint, formatting, documentation/requirement
  and editing-mode guards, all 5898 tests in 307 files, coverage and build.
  Implementation snapshot: HEAD `52d85cd05fb3e98c04b220a09cd638f9a92285c7`,
  `sha256:df80cef30c050645c85a10d5ed8544c80fc3528647b27ed608e80ef1a0c55e26`.
  Subsequent evidence-only plan edits do not invalidate runtime results.
- Final full measurement/validation command:
  `npm run test:e2e:diagnose -- --json-output=.scratch/e2e-cost-review/full-after.json --workers=6 --reporter=dot,json`.
  Passed all 979 cases without retries/skips in 255.32 seconds, against the same
  production inputs and six-worker macOS environment as baseline. Summed time
  was 1355.63 seconds; launches remained 905. Launch-phase total rose from
  645.65 to 774.26 seconds, and unchanged suites also slowed. This broader run
  proves retained coverage, not a measured whole-suite speedup. The narrower
  repeated comparisons above isolate the useful timer and depth-setup savings.
- Independent review of the full diff, save/quit ordering, drag preparation and
  retained coverage returned `No meaningful issues found`. Primary diff review
  and final documentation/formatting checks also passed. No unresolved check
  failure remains except the explicitly accepted, unchanged npm advisory.
  Lasting guidance is in `docs/DEVELOPMENT.md` §8; scratch reports are disposable
  measurement evidence and are not required to understand the delivered result.

## Investigation outcomes

- GitHub run listing on 2026-11-05 still contains only one hosted allocation run,
  [42101828682](https://github.com/abtv/tree/actions/runs/42101828682), at `243c5ff`.
  Job timestamps confirm 1035 macOS seconds plus 260 Linux seconds. Its Linux E2E
  step took 184 seconds; macOS E2E steps took 186–278 seconds. Preparations and
  worker utilization differ, so moving more cases or reducing shards is not
  justified by these measurements. No new hosted runs were dispatched.
- Older failing runs were inspected: 40951994246 failed menu screenshots and
  native mouse selection; 40171790510 failed image-caret Tab and Agenda emoji
  selection. The menu inputs were stabilized in `b29b6b4`; the latest recorded
  allocation run passed these boundaries. The newer pointer-hold flake was
  already corrected in `2fbdab2`. Current local validation will exercise all of
  them; historical success does not establish that intermittent failures cannot
  recur.
- Inspected explicit waits in Agenda dragging, scrolling/windowing, recent-node
  frame capture and Vim selection. They observe negative behavior or successive
  rendered frames, not merely wait for a positive assertion. No new reproduced
  timing defect justifies changing them. The bounded geometry-settlement helper
  in Vim navigation remains a diagnostic candidate, not a demonstrated failure.
- Reviewed emoji/date/tag completion and Vim-counter E2E against domain
  recognizer/catalog tests, completion source/controller tests and existing
  hook/store coverage. The existing development guide already defines the rule
  versus integration split. Retain real keyboard acceptance of signed emoji
  shortcodes, textarea/rich-editor differences, popup scrolling, focus/Undo,
  restart/MRU and counter caret projection. Their small repeated input samples
  do not justify another abstraction or deletion of boundary evidence. Future
  rule variants belong in the focused tests already named in that guide.

## Regression evidence

- Renaming the two clipboard descriptions reproduced missing Linux execution;
  the new discovery assertion failed on the missing selected key before the
  semantic tag selector was applied. After it, union and overlap passed.
- The helper snapshot regression failed with the original Playwright matcher;
  the runtime guard then passed helper, negated, configured and soft assertions,
  ordinary matcher preservation, and original macOS identity checks.
- ESLint regression checks cover direct, aliased, namespace and re-exported
  Playwright `expect`, plus legitimate fixture/helper/type imports.
- Initial `npm run check` caught the deliberately inert test receiver's missing
  Page type. The test now explicitly types that receiver; no production change.
- Primary review found that the smoke container's explicit source list also
  needs the new assertion owner. The source-transfer test failed before adding
  it, then passed. `fix:history` for that runner found one prior preparation-file
  inclusion fix (`ba68b81`), not a recurring-fix bucket. Keep the bounded source
  list; a generic import graph is not justified by this small new dependency.
- `npm run check` passed all stages, 307 files / 5898 unit tests, coverage and
  production build. The subsequent source-transfer addition and stronger
  editing-mode discovery assertions passed all 11 focused tests via
  `npm test -- scripts/web/chromium.test.mts scripts/electron-platforms.test.mts`.
  They do not change product sources or the ongoing macOS E2E inputs.
- `npm run test:e2e` passed all 979 cases in 3.8 minutes on the local macOS host,
  six workers, without retries, skips or failures. This includes historical
  menu, clipboard, emoji/image-caret and corrected pointer-hold cases. No further
  flaky-test correction is supported by the inspected history and current run.
- Final affected `npm run typecheck:scripts`, scoped ESLint and
  `npm run format:check:changed` passed after the source-transfer/discovery edits.
  The full-check results for unchanged code remain valid.
- `npm run test:e2e:linux` passed all 219 cases in 1.9 minutes in the prepared
  Linux ARM64 container, four workers and zero retries. All four tagged
  clipboard cases ran. Case allocation and snapshot baselines remain unchanged.
- `npm run test:smoke:linux` passed Electron and Chromium smoke in the same
  isolated image (2.22 and 2.66 seconds including their runners and cleanup).
  This verifies the added assertion module is transferred to the smoke container.
- Independent review inspected the full diff and all new files after validation:
  `No meaningful issues found`. The primary diff review also found no remaining
  issue. No product behavior, dependency version, baseline, case allocation,
  runner count, schedule or audit policy changed. No unresolved validation
  failure remains apart from the explicitly accepted audit advisory.
