# Fold/Expand Test Pilot

Status: Preparation complete; implementation awaits an explicit continuation request.

## Objective and authorization

Reduce expensive Electron checks where existing fast tests can faithfully protect the same rule. The owner wants ordinary local feedback around one minute and lower macOS CI costs as the editor grows. This pilot tests one bounded migration; it does not promise that duration or a significant full-suite speedup.

On 2026-10-14 the owner authorized preparing and recording this handoff for another model. No test or application changes are authorized in the preparation session. An explicit request to execute FP-2 authorizes the bounded migration below, validation, corrections and commit. Merely reading this plan does not authorize execution. Use the owner's chosen coding tool/model; no runner or model configuration changes are needed.

This is separate from the deferred [E2E Coverage Efficiency](e2e-coverage-efficiency.md) initiative. Its tasks, harness work and readiness preparation remain deferred. Do not resume or recreate them through this pilot.

Sources: [Product §2.4](../docs/PRODUCT.md#24-inline-expansion), [Architecture](../docs/ARCHITECTURE.md), [validation mechanics](../docs/DEVELOPMENT.md#9-full-validation), [workflow](../AGENTS.md), and [E2E rules](../e2e/AGENTS.md).

## Established evidence and limits

- Historical measurement, recorded by `abtv` on 2026-10-11 in `95e8b7f:plans/e2e-suite-time.md`: 746 cases, 795 launches; launch plus teardown consumed 62.8% and 64.3% of summed test time in two runs. These percentages are not wall-time savings or current measurements.
- The later bounded reuse rollout passed 773 cases in 254.01/257.30 seconds versus 280.51/280.37-second fresh controls, excluding build time. See [Development §8](../docs/DEVELOPMENT.md#8-tests) and [ADR 0021](../docs/decisions/0021-worker-owned-e2e-application-reuse.md). General E2E cost has already been investigated; do not repeat that audit.
- Inspection baseline: clean `1372c4d`, 2026-10-14. A fresh configured planner independently inspected the candidate. Preparation ran no application tests or timing measurements.
- Fold/Expand was selected for bounded scope, not because it is the largest cost center. Inspection supports only one removal candidate. The benefit is one fewer fresh Electron case/launch, with total elapsed-time improvement still unmeasured. Do not extrapolate a full-suite speedup or use the budget to hunt for more removals.

## Concrete transfer

Candidate: [inline-expansion.spec.ts](../e2e/inline-expansion.spec.ts), mode-independent test **“restores nested expansion choices when re-expanding”**. It opens `a`, opens `a1`, collapses `a`, and reopens `a`. It asserts the complete ordered text rows, the collapsed root rows, then the restored complete rows. It has no screenshot, restart or explicit caret assertion. Both it and the breadcrumb case were introduced by feature commit `8466b34`; the inspected title history does not identify a separate defect regression.

The rule already has these fast tests:

| Owner | Existing coverage | Action |
| --- | --- | --- |
| [expansion-state.test.ts](../src/application/expansion-state.test.ts) | “retains a descendant choice across a collapse/expand round trip” | Keep unchanged; verifies retained child choice using real expansion functions. |
| [editor-store.test.ts](../src/application/editor-store.test.ts) | “collapses a distant ancestor onto its own row and preserves nested expansion choices” | Keep unchanged; verifies collapse/reopen row projection and hidden-descendant selection through the real store. |
| [App.test.tsx](../src/renderer/App.test.tsx) | Existing inline-expansion tests use real `App`, `EditorStore` and disclosure controls, but lack this exact nested round trip | Add the candidate's ordered-row sequence here before deleting the E2E. Use existing `createSeededStore`, the same synthetic tree shape and `fireEvent.click` on accessible disclosure buttons. Assert full/collapsed/full rendered text order, not only store state. |

Use the existing jsdom environment and I/O fakes. Do not mock `App`, `EditorStore`, fold commands, visible rows or disclosure handlers. Do not introduce a new fixture library. Match the original case's Vim Normal mode (`activeEditingMode` defaults to `vim` in `e2e/fixtures.ts`); render with `initialVimEnabled`. Assert the current location remains top level. Retained mode-sensitive E2E still run in both modes.

The fast App test preserves renderer-to-store composition. It does **not** reproduce native pointer event ordering, browser layout or native focus. The exact nested pointer round trip will no longer run in Electron; retaining its rule and composition coverage is the deliberate test-layer tradeoff, not a claim of identical environments.

Retain every other case in the E2E file, including:

- “expands and collapses a node’s children inline without entering it or moving the caret”: real disclosure activation and focus in both modes;
- the hidden-caret and unrelated-branch collapse cases: actual focus consequences;
- Cmd+E, arrows, Vim folds, Visual, deletion/undo and sibling-scope cases: distinct input paths;
- “keeps each node’s expansion when entering and leaving a node” and “keeps expansion when navigating via the location breadcrumb”: location transitions and distinct breadcrumb wiring;
- both relaunch cases, old-document startup, virtualization, appearance and screenshot checks.

The retained Vim fold test is **not** equivalent evidence for remembered nested reopening: its `zM` and `zC` operations intentionally clear choices. Do not cite it as such. No screenshots or baselines are candidates for removal in this pilot.

## Tasks and budget

Total ceiling: **90 minutes across all sessions**, including preparation, implementation, verification, corrections and handoff. Reserve/charge 15 minutes for FP-1; FP-2 has at most 75 minutes. This is an allocation, not a claim that preparation took exactly 15 minutes. Stop early when finished. Track actual active execution time and remaining allowance in the plan when handing off; never reset the allowance on restart. Owner waiting is excluded. There are two substantive tasks; no separate three-task final-acceptance gate or closure allowance applies. Do not split implementation and its validation into administrative tasks.

| ID | Outcome and expected files | Acceptance evidence | Tier | Status |
| --- | --- | --- | --- | --- |
| FP-1 | Inspect one bounded family and record handoff; this plan and `plans/README.md` | Exact transfer, retained boundaries, independent planning and documentation checks | Minimal | Done |
| FP-2 | Implement and measure the single transfer; `e2e/inline-expansion.spec.ts`, `src/renderer/App.test.tsx`, initiative records | Faithful fast assertions, one removed case, passing focused checks, matched before/after measurements and primary coverage review | Low | Planned; awaiting execution request |

Exact next task: **FP-2**, only after an explicit execution/continuation request. No full-suite inventory, additional migration family, product change, production refactor, shared fixture, performance test, policy rewrite, CI scheduling, dependency, test-selection mapping or new testing tool is in scope. Editing-mode reductions and concatenating E2E scenarios to reduce counts are prohibited. A future policy change is a separate proposal after the result, not part of FP-2.

### FP-2 execution

1. Reconcile current Git and this plan with the inspected tests. Confirm the same candidate and retained coverage still exist. If new code invalidates the mapping, stop and report it rather than expanding the investigation.
2. Measure the unmodified focused E2E file and existing fast suites with the commands below. Keep raw baseline output in `.scratch/fold-expand-test-pilot/`, outside tool-cleared `test-results/`. Record host, workers, source commit, complete command elapsed time and test-only timing separately.
3. Add the fast App test first. Run the affected fast suites; inspect that they exercise real owners and assert every removed outcome. Then remove only the named mode-independent E2E case. Do not require production fault injection or mutation infrastructure for this small transfer.
4. Run the final focused E2E measurement and Low Risk checks. Compare counts, launches, summed test time and wall time; include added fast-test cost and build cost separately. One pair is descriptive evidence, not a statistically established speedup. Do not repeat merely to obtain a favorable number.
5. Review the diff against the transfer and retained-case list. Report unchanged, slower or inconclusive timing honestly. Commit the validated logical change. On completion retire this plan/index entry under the existing workflow; the commit and handoff carry the result. An incomplete task keeps its plan and temporary working evidence.

Suggested allocation inside FP-2: 10 minutes baseline, 25 minutes transfer, 25 minutes validation/comparison, 15 minutes corrections and handoff. These are ceilings to guide stopping, not a reason to consume all 75 minutes. If faithful coverage requires production changes or a new harness, keep the E2E and report a no-go. If the baseline reveals a failing test or required runtime capability is unavailable, do not remove the case based on an unvalidated replacement. Budget exhaustion never waives required checks or makes unfinished work complete.

### Validation and measurement commands

Run actual Electron invocations outside the Codex sandbox through the supported approval mechanism, serially. The existing diagnostic workflow builds before running tests. Use the same host and workers for both commands:

```sh
npm run test:e2e:diagnose -- --json-output=.scratch/fold-expand-test-pilot/before.json e2e/inline-expansion.spec.ts --workers=6 --reporter=dot,json
npm run test:e2e:diagnose -- --json-output=.scratch/fold-expand-test-pilot/after.json e2e/inline-expansion.spec.ts --workers=6 --reporter=dot,json
node scripts/e2e-timing.mjs .scratch/fold-expand-test-pilot/before.json
node scripts/e2e-timing.mjs .scratch/fold-expand-test-pilot/after.json
```

The final diagnostic run also supplies the focused Electron validation. Do not run another identical E2E command solely for validation. Measure the following focused fast-suite command before and after; run the remaining static/governance checks after editing:

```sh
npm test -- src/application/expansion-state.test.ts src/application/visible-rows.test.ts src/application/editor-store.test.ts src/renderer/App.test.tsx
npm run typecheck:renderer
npm run typecheck:e2e
npx eslint src/renderer/App.test.tsx e2e/inline-expansion.spec.ts
npm run format:check:changed
npm run check:requirements
npm run check:e2e-modes
npm run check:docs
```

These are tests-only changes with unchanged production, fixture and tooling inputs. Under the current Low Risk matrix, no full `check:full`, performance suite or new screenshot inspection is required. Existing screenshot assertions still execute in the retained focused E2E file. Runtime changes would invalidate this classification and exceed the approved pilot scope. Primary diff/coverage review suffices; no independent implementation review or product-verification round is required for this contained internal test change. Preserve valid results across handoff.

## Owner involvement and handoff

| Stage | Checks and owner action |
| --- | --- |
| FP-1 | Read-only independent planner and automated documentation checks; no manual product verification. |
| FP-2 authorization | Start the new session with the prompt below. This supplies implementation authority that preparation did not grant. |
| FP-2 verification | Automated focused suites, static/governance checks and primary diff review; zero planned manual product checks. |
| Capability limit | Electron launch, GUI availability and test execution are unverified in this planning session. The first necessary baseline run verifies them in the implementing session. A denied permission or missing capability blocks dependent work; report the supported next action. No unattended-runner readiness work is needed. |

No product requirement gaps or architecture decisions were resolved. The agent may make reversible test implementation choices within the named files; widening scope, weakening boundary protection or increasing the total budget requires the owner.

Copy into the new session:

> Execute FP-2 in `plans/fold-expand-test-pilot.md`. I authorize the bounded test-only migration, its required validation and commit within the remaining 75-minute ceiling. Preserve the documented retained Electron coverage and scope limits. Stop with an honest result if the transfer is not faithful or the budget/capabilities are insufficient; do not expand to other families or resume deferred initiatives.
