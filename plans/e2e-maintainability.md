# Electron E2E maintainability follow-up

Status: **Awaiting owner acceptance**. All five items are complete.

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

There are five substantive implementation/investigation items. Complete them in
this session, grouping related changes into at most four logical commits. Final
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

The owner can inspect the semantic tags and discovery guard in
`config/testing/electron-platforms.ts` and `scripts/electron-platforms.test.mts`,
and the runtime assertion owner in `e2e/electron/platform-expect.ts`.
Accept the delivered five-item result or identify remaining issues. No manual
application check is required. After acceptance, retire this plan and its index
entry; no implementation or additional hosted run remains.

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
