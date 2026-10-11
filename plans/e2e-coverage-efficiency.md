# E2E Coverage Efficiency

## Objective and Authorization

Reduce redundant Electron test execution and the cost of validating ordinary changes as the application grows. Keep exhaustive rule coverage at the lowest faithful layer, with real Electron coverage for integration and behavior that lower layers cannot reproduce. A smaller E2E suite is an intended result, not a quota that permits deleting useful coverage.

The Product Owner requested analysis and a recorded initiative on 2026-10-11, for execution in a separate session. This session is limited to analysis and planning; recording the plan does not change validation policy or authorize runtime implementation. A subsequent request to continue this initiative authorizes its next ready task within the scope below. The resume prompt explicitly authorizes the proposed test and workflow changes. Current rules apply until their replacement is committed.

Preserve the earlier decisions recorded in [ADR 0021](../docs/decisions/0021-worker-owned-e2e-application-reuse.md): editing-mode reductions were declined, and new duration budgets/reporting were deferred. Do not drop one mode from a retained mode-sensitive scenario, introduce duration gates or reporting infrastructure, widen shared-application eligibility, or relax isolation. Removing a demonstrably redundant scenario with coverage transferred to a lower layer is distinct from keeping that scenario in only one editing mode.

No product behavior, persistence model, process boundary, technology stack, or production test hook changes are in scope. Do not change product requirements to make tests dispensable. If a migration needs production refactoring or a new browser/component runner, retain the E2E case and record the separate proposal. Ordinary test and workflow choices are for the implementing agent to resolve; product or architectural changes remain reserved for the Product Owner.

## Analysis and Evidence

Inspection baseline: clean HEAD `552037d`, authored by `abtv` on 2026-10-11. Sources below were read in this planning session; their current status is tracked repository content. No fresh runtime measurement or exhaustive redundancy audit was performed. An independent planner inspected the policies and candidate test families.

* [Development §8](../docs/DEVELOPMENT.md#8-tests) records two same-host full-suite pairs at runtime commit `3dff3bf`: 773 passing cases, adopted wall times 254.01/257.30 seconds, 788 launches, and 8.2–9.4% improvement over fresh controls. These exclude build time and are historical measurements, not promised current performance.
* [Playwright configuration](../playwright.config.ts) already uses six local hidden workers; [E2E CI](../.github/workflows/e2e.yml) runs six macOS shards. More concurrency and broader reuse are not the first proposed interventions.
* [Development §9](../docs/DEVELOPMENT.md#9-full-validation) already allows focused local E2E below High Risk. The High Risk row nevertheless assigns complete local validation to every listed boundary category. The Moderate Risk row requires E2E for every affected user-visible requirement even when an edit only changes a pure calculation. Inference: these triggers can require more work than the changed failure mechanisms justify. This is not a claim that agents currently rerun everything for every change; actual frequency has not been measured.
* [AGENTS §9](../AGENTS.md#9-tests) requires automated coverage of every behavior, not an E2E test for every behavior. Its boundary obligations remain valuable. The proposed clarification concerns coverage ownership and execution scope, not abandoning boundary tests, defect regressions, property tests, or visual evidence.
* [Shared application tests](../e2e/shared-application.spec.ts) contain paired twelve-burst memory investigations. The fresh control contributes 96 launches per full run. They collect useful evidence but are not ordinary short product regressions. A small number of cases can therefore dominate work; raw case count is an incomplete cost measure. Their individual wall-time contribution must be measured before claiming a saving.
* [Vim text E2E](../e2e/vim-text-editing.spec.ts) and [text-command tests](../src/renderer/vim-text-commands.test.ts) overlap in insert-entry, motion/range and surround topics. This is a candidate for migration, not established assertion equivalence. Keyboard dispatch, session transitions and caret projection can justify retaining otherwise similar cases.
* [Agenda E2E](../e2e/agenda-editing.spec.ts) repeats command-by-row restrictions also represented by [handler matrix tests](../src/renderer/agenda-command-matrix.test.ts). The latter use a real store but also keyboard doubles; they do not automatically replace real focus, contenteditable, pending-prefix or save behavior. Review those differences before transferring assertions.
* [Development §8](../docs/DEVELOPMENT.md#8-tests) already defines layered Vim coverage and distinct editing-mode categories. Preserve this useful guidance and extend its coverage-ownership reasoning. Do not add another framework, a fixed testing-pyramid percentage, a parallel policy document, or a permanent per-test approval ledger.

External guidance consulted on 2026-10-11: Mike Wacker's Google Testing Blog article, [Just Say No to More End-to-End Tests](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html?hl=ja_JP), published 2015-04-22, recommends focused integration tests where they detect the same failures more cheaply. Current [Playwright best practices](https://playwright.dev/docs/best-practices) recommend independent tests and user-visible assertions. These support migration with equivalence evidence and retained integration coverage; neither establishes the right case count for this application.

## Acceptance and Boundaries

The initiative succeeds when audited redundant scenarios have been removed or migrated, long diagnostic probes have an explicit execution owner, and ordinary bounded changes have a documented focused validation path. Report actual before/after case counts, launches, summed time and wall time, including build and required local checks separately. Do not claim a speedup from case-count reduction alone or claim a focused pass as a full-suite pass.

For each removed scenario, record temporarily in this plan or task evidence: original test and assertions, failure mechanism, replacement test, retained Electron representative, editing modes, relevant requirement/conformance references, and any unique historical regression. Verify replacement assertions, not just file names or requirement markers. Use an existing historical failing revision or a small reversible fault experiment for representative migrated families where practical; do not introduce mutation infrastructure. Never replace integration coverage with mocks that bypass the failure being protected.

Keep real Electron coverage of distinct keyboard routes and physical modifier order, browser default suppression, native focus/blur and pointer timing, contenteditable and decorated text, caret/selection projection, geometry/screenshots, clipboard/IPC, restart/save/recovery and shutdown failures. Preserve both modes and differing appearances where required. Exhaustive calculations and state combinations may move down; do not assume every command or state shares the same wiring. Splitting tests into projects or merging unrelated tests into long scenarios does not count as reducing redundant coverage.

Use existing measurement commands and save raw task evidence under `.scratch/e2e-coverage-efficiency/<task>/`. Compare runs on the same host with the same worker count and record runtime/test changes. Never overlap Playwright invocations. No numerical test-count cap, duration budget, new CI reporting system or performance-threshold relaxation is authorized by this plan.

## Ordered Tasks

| ID | Outcome | Depends on | Status | Acceptance evidence |
| --- | --- | --- | --- | --- |
| EC-1 | Audit coverage ownership and establish comparable costs | None | Ready | All spec families classified; concrete migration list and protected boundaries; baseline and candidate costs |
| EC-2 | Make validation scope follow changed mechanisms | EC-1 | Planned | Consistent policy with worked examples, preserving full-local exceptions and complete regression CI |
| EC-3 | Give long memory investigations a dedicated workflow | EC-2 | Planned | Both controls executable; normal reset/failure guards retained; explicit CI and local triggers verified |
| EC-4 | Migrate redundant Vim text scenarios | EC-1, EC-2 | Planned | Assertion mapping, faithful replacement tests, retained real dispatch/caret coverage and measured reduction |
| EC-5 | Reduce exhaustive Agenda E2E command matrices | EC-1, EC-2, EC-4 | Planned | Complete lower-layer matrix plus distinct real renderer/boundary paths in both modes |
| EC-6 | Verify overall reduction and finish or enumerate remaining migrations | EC-3, EC-4, EC-5 | Planned | Comparable complete results, coverage audit, honest remaining gaps and durable guidance |

Tasks execute in listed order. EC-1 may add bounded migration tasks for other justified families before EC-6; each must name concrete files, assertion-transfer evidence, dependencies and validation tier before becoming ready. It must not authorize an unspecified bulk deletion pass. Preserve cases when equivalence is uncertain. This is a complete proposed initiative, not a review batch with an unknown external task list.

### EC-1 — Audit and Baseline

Expected changes: this plan only, with temporary inventory/results in `.scratch/e2e-coverage-efficiency/ec-1/`. Inspect `e2e/*.spec.ts`, matching `src/domain`, `src/application` and `src/renderer` tests, `docs/VIM_CONFORMANCE.md`, `scripts/check-requirement-coverage.mjs`, existing timing tooling and validation policy. Read nested instructions for inspected/changed layers.

Inventory each spec family by assertions and reason for Electron: native/process boundary, actual browser semantics, visual/geometry, integrated user flow, or rule-only candidate. Expand test titles/modes using the existing Playwright listing; text searches alone miss parameterized cases. Prioritize by measured cost and faithful replacement opportunity. Specifically inspect Vim insert-entry/motion/surround cases, Agenda forbidden-command matrices and long memory probes. For other families, either name concrete candidates or record why Electron remains necessary. Do not infer duplication from similar test titles.

Run the existing timing workflow on the current baseline and summarize it with `scripts/e2e-timing.mjs`; obtain focused timings for candidate families. Reuse valid same-input results when available. Record build time and test time separately and the cost of a representative contained-change validation command. No new timing tooling is needed. Update later tasks with exact candidate assertions and files so the next session can proceed without reconstructing the audit.

Validation tier: Minimal Risk for the committed plan edits (`npm run format:check:changed`, `npm run check:docs`, `npm run check:opencode`); measurements are explicit task acceptance work, not a reason to run unrelated performance suites. No test or runtime edits. No product requirement gaps are resolved here.

### EC-2 — Coverage and Validation Policy

Expected files: `AGENTS.md` §§9–10 and, only for consistency, §13; `docs/DEVELOPMENT.md` §§8–9 and §12; `e2e/AGENTS.md`. Edit owning sections, not new policy documents. Keep existing proof/reuse rules and the canonical commands.

Proposed policy to implement upon continuation:

* Choose the smallest faithful test layer. Every affected requirement needs appropriate coverage; every changed boundary mechanism needs real-boundary evidence. Adding a variant does not automatically require another Electron launch or a newly written test when existing assertions cover it.
* Separate risk of the change from breadth of execution. A contained clipboard transformation with an unchanged adapter is different from changing clipboard dispatch or IPC. Test-only transfers with unchanged fixtures do not become High Risk merely because the retained tests use Electron.
* Pure rule changes use affected unit/property coverage and a retained E2E representative when integration can be affected; no new E2E case per arithmetic variant. Bounded renderer or boundary consumers use explicit owning E2E specs and adjacent affected flows.
* Keep complete local validation for shared fixtures, shared cross-feature interaction infrastructure, lifecycle/startup/shutdown, persistence/durability, security, dependencies/toolchain and unbounded impact. Keep independent review requirements for actual process/persistence boundary changes. Do not use a smaller scope merely because the implementing agent feels confident.
* Complete ordinary E2E regression coverage still runs in CI. Automatic import-based selection remains advisory for the compiled Electron app; identify owning specs explicitly, and treat an empty selection as missing evidence. Reuse valid checks and do not rerun them solely for role handoff.

Include worked classifications for a pure text transform, a renderer caret fix, an unchanged-boundary clipboard consumer, an actual IPC contract change, a persistence change and a shared-fixture change. State required static, unit/contract, E2E, visual, review and performance checks without expanding unaffected checks. Distinguish these proposed changes from policies already in force.

Validation tier: Minimal Risk while documentation only. Run formatting, docs and OpenCode governance checks. Review examples against retained requirements and ADRs. If executable enforcement must change, create a separate named Low Risk task with its owning tests before editing it. No change to editing-mode eligibility or budgets.

### EC-3 — Separate Long Memory Investigations

Expected files: `e2e/shared-application.spec.ts`, a dedicated diagnostic spec/config under `e2e/`, `package.json`, a dedicated `.github/workflows/` workflow, `docs/DEVELOPMENT.md` §8, and the execution guidance in ADR 0021 if needed. Keep existing `e2e/fixtures.ts` behavior unchanged. Any named workflow permission adapters and their tests must be updated together if a new command needs them; inspect `.codex/rules/`, `.claude/settings.json`, `opencode.json` and `scripts/check-opencode-permissions.mjs` before choosing the command.

Move only the paired repeated-cycle memory investigations out of ordinary discovery. Retain reset/recovery, IPC drain, seed validation, ownership/disposal, poison/successor and visible/fresh-control regressions in ordinary E2E. Preserve both memory experiments and their raw artifacts, warm-up handling and fresh/shared comparability; do not invent a memory threshold.

Provide a documented explicit local command and scheduled/manual macOS CI execution. Require the dedicated probes locally when changing reuse/reset/lifecycle infrastructure or adoption eligibility. Add a path-triggered CI run for those owners, including diagnostic/config changes, alongside normal regression CI. Inspect the actual import graph to define triggers; broad/unclassified fixture changes must not bypass them. Document what ordinary `test:e2e` and `check:full` now cover and the additional required command. Do not silently exclude the probes everywhere or leave them undiscoverable.

Validation tier: High Risk under current shared-fixture coverage policy. Run `npm run check:full`, dedicated probes and relevant discovery/selection checks sequentially; inspect diagnostic artifacts. Verify ordinary test listing excludes only the intended long probes and the dedicated listing includes both controls. Required independent reviewer checks coverage and scheduling. Measure normal-suite savings separately from total diagnostic workload. No production performance claims or fixture reset changes.

### EC-4 — Vim Text Migration

Expected files: `e2e/vim-text-editing.spec.ts`, `src/renderer/vim-text-commands.test.ts`, `src/renderer/vim-editing.test.ts`, relevant existing Vim session/handler/property tests identified by EC-1, and `docs/VIM_CONFORMANCE.md`. Keep snapshots unless their only scenario is validly retired and no visual obligation remains.

Start with EC-1's insert-entry (`A`/`I`), count/motion/range and surround candidates. Establish faithful lower-layer assertions first, then remove only redundant variants. Keep every distinct keyboard-dispatch route, physical shifted sequence, caret projection and pending-session transition unless another named Electron case proves it. Do not replace rendered image/decorated-text or clipboard checks with calculation-only tests. Update conformance references and requirement markers with the transfer; markers alone are not proof.

Validation tier: Low Risk for tests/docs only with unchanged fixtures and runtime. Run affected Vitest suites, E2E/renderer type checks, affected lint/format checks, `npm run check:docs`, `npm run check:requirements`, `npm run check:e2e-modes`, and focused Vim Electron specs after building through the named workflow. Apply the committed EC-2 matrix if it requires more. Inspect representative screenshots if rendered-state coverage changes. Record before/after counts, launches and timing. Independent coverage review is task acceptance: verify removed assertions and historical regressions against replacements, without rerunning valid results.

### EC-5 — Agenda Matrix Migration

Expected files: `e2e/agenda-editing.spec.ts`, `src/renderer/agenda-command-matrix.test.ts`, `src/renderer/agenda-row-keyboard.test.ts`, related existing policy/property/hook tests identified by EC-1. Do not modify production command policy.

Cover exhaustive forbidden-command × row-role combinations below Electron using real store/state where the rule depends on them. Retain Electron representatives for distinct handler routes, both editing modes, actual focus/caret continuity, command-prefix sequences and browser behavior. Treat doubles in the existing handler matrix as an equivalence limitation to resolve, not evidence that real wiring is covered. Retain clipboard and restart/save tests.

When an assertion claims persisted state is unchanged, verify it after the relevant save opportunity and queued work drain, following `e2e/AGENTS.md`; an immediate file snapshot does not prove absence of a delayed edit. Preserve assertions that distinguish row selection from text selection. Do not combine unrelated scenarios merely to reduce reported count.

Validation tier: Low Risk for isolated test transfers with unchanged fixtures/runtime, using EC-4's checks for the affected Agenda suites. If the work crosses a higher-risk boundary, apply the matrix rather than expanding scope silently. Independent coverage review verifies the complete matrix and retained real-renderer paths. Measure actual work reduction even if fewer loop iterations do not reduce Playwright case count.

### EC-6 — Verify and Close

Expected files: this plan, `plans/README.md`, and concise durable testing guidance in `docs/DEVELOPMENT.md` if not already recorded by EC-2/EC-3. No permanent audit ledger or new reporting automation.

Reconcile every removed assertion with its replacement and remaining Electron boundary. Complete any concrete migration tasks added by EC-1 before closure. Run complete ordinary E2E twice sequentially on the baseline host/workers to expose gross variability, plus required dedicated probes once unless valid final-input evidence exists. Run the final applicable static/unit/governance checks; reuse still-valid stage results. Compare full-suite and representative focused validation costs, separating build, tests, diagnostic relocation and actual removal. Report failures/retries, case/launch counts and all unsupported combinations; never call relocation alone a reduction in total coverage cost.

Validation tier: Minimal Risk for closure documentation, with the explicit runtime acceptance runs above and any outstanding checks from implementation tasks. Seek an independent final coverage review of cumulative migrations and retained boundaries. If useful reductions cannot be demonstrated, report that finding rather than deleting necessary coverage to meet a target. Remaining confirmed redundant families need explicit follow-up tasks before claiming the objective complete; justified retained coverage does not need a count cap.

Move enduring guidance to its existing owner, then remove this plan and its index row in the closure commit. Git retains the analysis and completed task record.

## Next Task and Resume Prompt

Next task: EC-1. No implementation or policy change has started. No product requirement gaps have been identified for this test/workflow-only scope. Runtime access for future Electron measurements must be verified in that execution session; repository read access and planner inspection succeeded in the planning session.

```text
Continue plans/e2e-coverage-efficiency.md, starting with EC-1. I authorize the
test-coverage and development-workflow initiative described there. Preserve
product behavior, real-boundary coverage, existing editing-mode obligations,
and ADR 0021 isolation constraints. Do not introduce duration budgets or new
reporting infrastructure. Audit assertions and measure costs before removing
tests; move redundant rule coverage to faithful lower-layer tests and retain
distinct Electron integration paths. Execute the next ready task, validate and
commit it with the plan status update. Resolve ordinary engineering choices
autonomously; do not expand into production refactoring or product changes.
```
