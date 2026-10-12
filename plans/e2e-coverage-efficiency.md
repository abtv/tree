# E2E Coverage Efficiency

Prerequisite: [Runner Readiness](runner-readiness.md) is proposed separately. Its preparation does not authorize runner implementation, runtime probes or this initiative's execution.

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

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| EC-1 | Audit coverage ownership and establish comparable costs | None | All spec families classified; concrete migration list and protected boundaries; baseline and candidate costs | Ready |
| EC-2 | Make validation scope follow changed mechanisms | EC-1 | Consistent policy with worked examples, preserving full-local exceptions and complete regression CI | Planned |
| EC-3 | Give long memory investigations a dedicated workflow | EC-2 | Both controls executable; normal reset/failure guards retained; explicit CI and local triggers verified | Planned |
| EC-4 | Migrate redundant Vim text scenarios | EC-1, EC-2 | Assertion mapping, faithful replacement tests, retained real dispatch/caret coverage and measured reduction | Planned |
| EC-5 | Reduce exhaustive Agenda E2E command matrices | EC-1, EC-2, EC-4 | Complete lower-layer matrix plus distinct real renderer/boundary paths in both modes | Planned |
| EC-6 | Verify overall reduction and finish or enumerate remaining migrations | EC-3, EC-4, EC-5 | Comparable complete results, coverage audit, honest remaining gaps and durable guidance | Planned |

Tasks execute in listed order. The runner projection fixes these six tasks. EC-1 records additional candidates in execution findings; it cannot add task rows or alter later task scopes during this run. Additional migrations require a separately reviewed plan and authorization. Preserve cases when equivalence is uncertain. If confirmed redundant families remain outside the fixed projection, report the unfinished objective rather than claiming closure. This is a complete proposed initiative, not a review batch with an unknown external task list.

### EC-1 — Audit and Baseline

Expected changes: this plan only, with temporary inventory/results in `.scratch/e2e-coverage-efficiency/ec-1/`. Inspect `e2e/*.spec.ts`, matching `src/domain`, `src/application` and `src/renderer` tests, `docs/VIM_CONFORMANCE.md`, `scripts/check-requirement-coverage.mjs`, existing timing tooling and validation policy. Read nested instructions for inspected/changed layers.

Inventory each spec family by assertions and reason for Electron: native/process boundary, actual browser semantics, visual/geometry, integrated user flow, or rule-only candidate. Expand test titles/modes using the existing Playwright listing; text searches alone miss parameterized cases. Prioritize by measured cost and faithful replacement opportunity. Specifically inspect Vim insert-entry/motion/surround cases, Agenda forbidden-command matrices and long memory probes. For other families, either name concrete candidates or record why Electron remains necessary. Do not infer duplication from similar test titles.

The primary inventories assertions without launching validation. After staging, the host runs the projected listings, baseline and candidate timings and summarizes them with `scripts/e2e-timing.mjs`. Its retained command logs establish build/check wall time separately from the JSON test duration. EC-2 consumes those observed costs. Record candidate assertion mappings in execution findings, without changing later task scopes or the projection. No new timing tooling is needed.

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

Expected files: `e2e/shared-application.spec.ts`, `e2e/shared-application-memory.ts`, `e2e/shared-application-memory.config.ts`, `.github/workflows/e2e-memory.yml`, `docs/DEVELOPMENT.md` §8, and the execution guidance in ADR 0021 if needed. The dedicated test filename avoids ordinary `*.spec.ts` discovery; its configuration imports the ordinary configuration and replaces projects with one matching that file. Explicitly rebase inherited `testDir`, `globalSetup`, and any relative output/snapshot paths against the dedicated configuration's directory; otherwise inherited `./e2e` paths resolve to `e2e/e2e`. Reuse `test:e2e:diagnose` with the dedicated configuration instead of adding an npm command or permission rule. Keep fixtures and ordinary Playwright configuration unchanged. Inspect permission adapters and their governance checks to confirm the existing workflow covers the arguments; a denial blocks the stage rather than authorizing permission edits.

Move only the paired repeated-cycle memory investigations out of ordinary discovery. Retain reset/recovery, IPC drain, seed validation, ownership/disposal, poison/successor and visible/fresh-control regressions in ordinary E2E. Preserve both memory experiments and their raw artifacts, warm-up handling and fresh/shared comparability; do not invent a memory threshold.

Provide a documented explicit local command and scheduled/manual macOS CI execution. Require the dedicated probes locally when changing reuse/reset/lifecycle infrastructure or adoption eligibility. Add a path-triggered CI run for those owners, including diagnostic/config changes, alongside normal regression CI. Inspect the actual import graph to define triggers; broad/unclassified fixture changes must not bypass them. Document what ordinary `test:e2e` and `check:full` now cover and the additional required command. Do not silently exclude the probes everywhere or leave them undiscoverable.

Validation tier: High Risk under current shared-fixture coverage policy. Run `npm run check:full`, dedicated probes and relevant discovery/selection checks sequentially; inspect diagnostic artifacts. Verify ordinary test listing excludes only the intended long probes and the dedicated listing includes both controls. Required independent reviewer checks coverage and scheduling. Measure normal-suite savings separately from total diagnostic workload. No production performance claims or fixture reset changes.

### EC-4 — Vim Text Migration

Expected files: `e2e/vim-text-editing.spec.ts`, `src/renderer/vim-text-commands.test.ts`, `src/renderer/vim-editing.test.ts`, `src/renderer/vim-edit-session.test.ts`, `src/renderer/vim-surround.test.ts`, `src/renderer/vim-editing.property.test.ts`, `src/renderer/vim-edit-session.property.test.ts`, and `docs/VIM_CONFORMANCE.md`. EC-1 selects candidates within these owners. Retain scenarios whose replacement requires another owner or changes a snapshot; report the limitation instead of expanding scope.

Start with EC-1's insert-entry (`A`/`I`), count/motion/range and surround candidates. Establish faithful lower-layer assertions first, then remove only redundant variants. Keep every distinct keyboard-dispatch route, physical shifted sequence, caret projection and pending-session transition unless another named Electron case proves it. Do not replace rendered image/decorated-text or clipboard checks with calculation-only tests. Update conformance references and requirement markers with the transfer; markers alone are not proof.

Validation tier: Low Risk for tests/docs only with unchanged fixtures and runtime. Run affected Vitest suites, E2E/renderer type checks, affected lint/format checks, `npm run check:docs`, `npm run check:requirements`, `npm run check:e2e-modes`, and focused Vim Electron specs after building through the named workflow. Apply the committed EC-2 matrix if it requires more. Inspect representative screenshots if rendered-state coverage changes. Record before/after counts, launches and timing. Independent coverage review is task acceptance: verify removed assertions and historical regressions against replacements, without rerunning valid results.

### EC-5 — Agenda Matrix Migration

Expected files: `e2e/agenda-editing.spec.ts`, `src/renderer/agenda-command-matrix.test.ts`, `src/renderer/agenda-row-keyboard.test.ts`, `src/renderer/agenda-row-keyboard.property.test.ts`, `src/renderer/agenda-key-policy.test.ts`, and `src/renderer/agenda-editing-handlers.test.ts`. Do not modify production command policy. Retain candidates needing other owners and report them.

Cover exhaustive forbidden-command × row-role combinations below Electron using real store/state where the rule depends on them. Retain Electron representatives for distinct handler routes, both editing modes, actual focus/caret continuity, command-prefix sequences and browser behavior. Treat doubles in the existing handler matrix as an equivalence limitation to resolve, not evidence that real wiring is covered. Retain clipboard and restart/save tests.

When an assertion claims persisted state is unchanged, verify it after the relevant save opportunity and queued work drain, following `e2e/AGENTS.md`; an immediate file snapshot does not prove absence of a delayed edit. Preserve assertions that distinguish row selection from text selection. Do not combine unrelated scenarios merely to reduce reported count.

Validation tier: Low Risk for isolated test transfers with unchanged fixtures/runtime, using EC-4's checks for the affected Agenda suites. If the work crosses a higher-risk boundary, apply the matrix rather than expanding scope silently. Independent coverage review verifies the complete matrix and retained real-renderer paths. Measure actual work reduction even if fewer loop iterations do not reduce Playwright case count.

### EC-6 — Verify and Close

Expected files: this plan, `plans/README.md`, and concise durable testing guidance in `docs/DEVELOPMENT.md` if not already recorded by EC-2/EC-3. No permanent audit ledger or new reporting automation.

Reconcile every removed assertion with its replacement and remaining Electron boundary. Report additional migrations identified by EC-1 without adding them to this execution. Run complete ordinary E2E twice sequentially on the baseline host/workers to expose gross variability, plus required dedicated probes once unless valid final-input evidence exists. Run the final applicable static/unit/governance checks; reuse still-valid stage results. Compare full-suite and representative focused validation costs, separating build, tests, diagnostic relocation and actual removal. Report failures/retries, case/launch counts and all unsupported combinations; never call relocation alone a reduction in total coverage cost.

Validation tier: Minimal Risk for closure documentation, with the explicit runtime acceptance runs above and any outstanding checks from implementation tasks. Seek an independent final coverage review of cumulative migrations and retained boundaries. If useful reductions cannot be demonstrated, report that finding rather than deleting necessary coverage to meet a target. Remaining confirmed redundant families need explicit follow-up tasks before claiming the objective complete; justified retained coverage does not need a count cap.

Move enduring guidance to its existing owner and commit EC-6 as Done while retaining the plan and index. The host validation and independent review retain the final timing and coverage comparison; the outer coordinator presents those observed results to the owner. Retirement is reserved pending the closure decision described below. Git retains the analysis and completed task record.

## Sources and Constraints

Preparation snapshot: clean HEAD `645aa79`, authored by `abtv` on 2026-10-12. This preparation authorizes planning only. The execution projection below is proposed, not approved. Approval must cover the six-task initiative, the finite host allowance and host execution explicitly. This initiative has six working tasks and requires final owner acceptance under `AGENTS.md` §8. The later request to add those rules authorizes policy documentation only; it does not approve this initiative or runner implementation.

The objective, this section, task headings/scopes, task-table descriptions and execution projection are immutable for a run. Only the selected task's status, its projected next task's Planned-to-Ready status, and progress/evidence outside those scopes may change. Preserve assertions when faithful migration needs an unlisted owner. Additional migration or executable policy-enforcement tasks require separate authorization; report them and leave coverage intact. Do not silently claim the overall objective complete while confirmed redundant families remain unaddressed.

Use the existing runner described in [Development §11](../docs/DEVELOPMENT.md#11-multi-session-initiatives), with a fresh primary per task, host-observed serial commands, independent configured roles, acceptance and one append-only commit per task. Primary sessions inspect/edit only; they must not run validation, nested roles or commits. Host baseline measurements therefore occur after the EC-1 inventory candidate; EC-2 consumes those results. Final measured comparisons belong to retained command/reviewer evidence and the outer-host handoff, not invented pre-measurement plan numbers. Independent reviewers inspect raw assertions, launch/timing annotations, memory attachments and CI trigger/import ownership. A passing requirement marker alone does not establish equivalence.

The fixed EC-3 layout uses a non-spec test filename and a dedicated configuration through the existing diagnostic workflow. No new npm command, permission rule, package dependency, ordinary discovery configuration or fixture change is authorized. Preserve ADR 0021 isolation and both editing modes, all existing thresholds and complete ordinary CI regression. Inspect dedicated configuration inheritance and discovery: only the two long memory controls move. Verify the scheduled/manual/path-triggered workflow definition locally; a successful hosted CI execution remains unverified until a permitted push/dispatch, which this plan does not authorize.

All Playwright invocations are serialized and comparisons use six hidden workers on this host. Timing output paths are unique per task/run; preserve baseline artifacts outside tool-cleared `test-results/`. Build and complete command elapsed time are available in host process records; test-only wall/summed times and launches are in JSON and timing summaries. Diagnostics, failures and relocation are reported separately from actual coverage-work reduction. Fault experiments are optional bounded evidence, not authorization to mutate production code or launch unprojected commands.

Proposed implementation allowance: **8 hours elapsed (28,800,000 ms)** from first coordinator construction, including implementation pauses, retries, independent roles and task commits. Suggested allocation: EC-1 90 minutes, EC-2 45, EC-3 90, EC-4 90, EC-5 75, EC-6 30, contingency 60. Final owner waiting is excluded and preserves the remaining implementation allowance and recovery counters for any authorized repairs. A separate small closure allowance must be proposed and approved after runner readiness is established. These are planning estimates, not measurements or E2E duration gates. Maximum two recoveries per task; never renew an allowance by deleting a ledger. The current host cannot suspend its original deadline for final owner waiting, so the proposed projection is not launch-ready under the new policy. Permission/authentication/capability blocks require supported external resolution immediately. Budget exhaustion preserves unfinished work and evidence.

### Owner Involvement

There are **zero mandatory manual product-verification checks and one required final owner acceptance round** for the six working tasks. No runtime UI or native input behavior changes. The initial execution approval is separate: it covers scope and allowances only after unattended preflight passes. Existing task `ownerChecks` remain empty because they are pre-commit gates, not final initiative acceptance. After EC-6, retain this plan/index as `Awaiting owner acceptance` and present the audited assertion transfers, actual before/after costs, retained boundaries, validation/review evidence and remaining limitations against the delivered commit. Explicit owner acceptance permits closure; rejection records issues and requires repair and renewed acceptance. Possible additional rounds arise from rejected results, scope-changing discoveries or new native-verification obligations. Setup interventions for permissions, authentication/trust and unrelated process quiescence must be resolved and rechecked without intervention before launch.

Capabilities checked in this preparation session:
* `git status --short`: clean before edits; repository inspection and process inspection succeeded.
* `npm run doctor`: passed on macOS arm64; Node/npm/Git, Electron/Playwright, display, registry and existing build reported ready.
* `codex --version`: CLI 0.162.1 available; sandbox reported it could not create PATH aliases. This proves executable presence, not authenticated child-session access.
* `npm run test:e2e -- e2e/navigation.spec.ts --grep 'arrow keys move selection between siblings' --workers=1`: build succeeded and two real Electron cases passed, one per editing mode. This is bounded preflight only, not EC-1 baseline or initiative execution.
* Independent native Planner inspection succeeded. Reviewer/Product Verifier are configured, but their new-host launch and runtime access remain to be established on first invocation.
* Native image inspection is exposed; no rendering/snapshot change is authorized and no screenshot preflight is required.
* No coordinator was constructed and no budget ledger was started. Host launch permissions, authentication, fresh/resumed primary execution and quiescence must be checked at authorized launch; historical pilot success is not current proof.
* Existing `.scratch/autonomous-initiatives-pilot/` records are unrelated and must be preserved. The proposed execution namespace is `.scratch/e2e-coverage-efficiency/`; confirm it remains unstarted before construction.

Launch is currently blocked. A separately authorized runner task must implement and verify the missing preflight, final acceptance, waiting-budget and closure behavior described in Development §11. No such implementation is authorized by this policy edit. Then complete the unattended preflight of Development §10, revise this projection to the supported contract, obtain attributable execution approval, and launch only from a clean committed plan. The invocation below is a future template, not a readiness claim; never use the pre-preparation HEAD as the approved source:

```text
node scripts/initiative-runner-host.mjs --authorized-plan /Users/andrew/work/tree plans/e2e-coverage-efficiency.md EC-1 <full-approved-starting-commit> <owner-approval-reference>
```

The CLI advances EC-1 through EC-6 only. **Current host closure is blocked:** `executeInitiative` in `scripts/initiative-runner-host.mjs:98` replaces a supplied completed EC-6 starting commit with that task's persisted original starting commit. That original plan marks EC-6 Ready, whereas closure projection requires Done. The independently inspected code therefore does not support the proposed same-namespace closure replay; the CLI also has no closure flag. No closure contract is projected and no runner correction is authorized here.

Final owner acceptance is mandatory after EC-6 and cannot be granted in the initial execution approval. Retire only this plan and its index row after explicit acceptance of the unchanged delivered result, within the separately approved closure allowance and through a verified supported closure path. Until runner readiness and owner acceptance are satisfied, retain the plan/index and do not claim fully autonomous closure.

## Proposed Runner Projection

Adding this block does not authorize execution. Exact argv arrays are host validation contracts; all commands run sequentially after staging. Role passes consume observed results and report uncovered/stale evidence. The host stages only the listed files, checks unknown dirty work, and commits; preserve other changes and stop instead of stashing, resetting or including them.

```initiative-runner
{
  "version": 1,
  "tool": "codex",
  "initiative": "e2e-coverage-efficiency",
  "budgetMs": 28800000,
  "tasks": {
    "EC-1": {
      "files": [
        "plans/e2e-coverage-efficiency.md"
      ],
      "commands": [
        {
          "id": "format",
          "argv": [
            "npm",
            "run",
            "format:check:changed"
          ]
        },
        {
          "id": "docs",
          "argv": [
            "npm",
            "run",
            "check:docs"
          ]
        },
        {
          "id": "permissions",
          "argv": [
            "npm",
            "run",
            "check:opencode"
          ]
        },
        {
          "id": "ordinary-list",
          "argv": [
            "npm",
            "run",
            "test:e2e",
            "--",
            "--list",
            "--workers=6"
          ]
        },
        {
          "id": "baseline",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-1/baseline.json",
            "--reporter=list,json",
            "--workers=6"
          ]
        },
        {
          "id": "baseline-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-1/baseline.json"
          ]
        },
        {
          "id": "candidates",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-1/candidates.json",
            "--reporter=list,json",
            "--workers=6",
            "e2e/vim-text-editing.spec.ts",
            "e2e/agenda-editing.spec.ts",
            "e2e/shared-application.spec.ts"
          ]
        },
        {
          "id": "candidate-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-1/candidates.json"
          ]
        }
      ],
      "roles": [
        "reviewer"
      ],
      "ownerChecks": [],
      "nextTask": "EC-2"
    },
    "EC-2": {
      "files": [
        "plans/e2e-coverage-efficiency.md",
        "AGENTS.md",
        "docs/DEVELOPMENT.md",
        "e2e/AGENTS.md"
      ],
      "commands": [
        {
          "id": "format",
          "argv": [
            "npm",
            "run",
            "format:check:changed"
          ]
        },
        {
          "id": "docs",
          "argv": [
            "npm",
            "run",
            "check:docs"
          ]
        },
        {
          "id": "permissions",
          "argv": [
            "npm",
            "run",
            "check:opencode"
          ]
        }
      ],
      "roles": [
        "reviewer",
        "product_verifier"
      ],
      "ownerChecks": [],
      "nextTask": "EC-3"
    },
    "EC-3": {
      "files": [
        "plans/e2e-coverage-efficiency.md",
        "e2e/shared-application.spec.ts",
        "e2e/shared-application-memory.ts",
        "e2e/shared-application-memory.config.ts",
        ".github/workflows/e2e-memory.yml",
        "docs/DEVELOPMENT.md",
        "docs/decisions/0021-worker-owned-e2e-application-reuse.md"
      ],
      "commands": [
        {
          "id": "full",
          "argv": [
            "npm",
            "run",
            "check:full"
          ]
        },
        {
          "id": "ordinary-list",
          "argv": [
            "npm",
            "run",
            "test:e2e",
            "--",
            "--list",
            "--workers=6"
          ]
        },
        {
          "id": "memory-list",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-3/memory-list.json",
            "--reporter=list,json",
            "--workers=6",
            "--config=e2e/shared-application-memory.config.ts",
            "--list"
          ]
        },
        {
          "id": "memory",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-3/memory.json",
            "--reporter=list,json",
            "--workers=6",
            "--config=e2e/shared-application-memory.config.ts"
          ]
        },
        {
          "id": "memory-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-3/memory.json"
          ]
        },
        {
          "id": "reset-guards",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-3/guards.json",
            "--reporter=list,json",
            "--workers=6",
            "e2e/shared-application.spec.ts"
          ]
        },
        {
          "id": "guard-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-3/guards.json"
          ]
        }
      ],
      "roles": [
        "reviewer",
        "product_verifier"
      ],
      "ownerChecks": [],
      "nextTask": "EC-4"
    },
    "EC-4": {
      "files": [
        "plans/e2e-coverage-efficiency.md",
        "e2e/vim-text-editing.spec.ts",
        "src/renderer/vim-text-commands.test.ts",
        "src/renderer/vim-editing.test.ts",
        "src/renderer/vim-edit-session.test.ts",
        "src/renderer/vim-surround.test.ts",
        "src/renderer/vim-editing.property.test.ts",
        "src/renderer/vim-edit-session.property.test.ts",
        "docs/VIM_CONFORMANCE.md"
      ],
      "commands": [
        {
          "id": "typecheck",
          "argv": [
            "npm",
            "run",
            "typecheck"
          ]
        },
        {
          "id": "lint",
          "argv": [
            "npm",
            "run",
            "lint"
          ]
        },
        {
          "id": "format",
          "argv": [
            "npm",
            "run",
            "format:check:changed"
          ]
        },
        {
          "id": "docs",
          "argv": [
            "npm",
            "run",
            "check:docs"
          ]
        },
        {
          "id": "permissions",
          "argv": [
            "npm",
            "run",
            "check:opencode"
          ]
        },
        {
          "id": "requirements",
          "argv": [
            "npm",
            "run",
            "check:requirements"
          ]
        },
        {
          "id": "modes",
          "argv": [
            "npm",
            "run",
            "check:e2e-modes"
          ]
        },
        {
          "id": "unit",
          "argv": [
            "npm",
            "test",
            "--",
            "src/renderer/vim-text-commands.test.ts",
            "src/renderer/vim-editing.test.ts",
            "src/renderer/vim-edit-session.test.ts",
            "src/renderer/vim-surround.test.ts",
            "src/renderer/vim-editing.property.test.ts",
            "src/renderer/vim-edit-session.property.test.ts"
          ]
        },
        {
          "id": "vim",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-4/vim.json",
            "--reporter=list,json",
            "--workers=6",
            "e2e/vim-text-editing.spec.ts",
            "e2e/vim-navigation-and-visual.spec.ts",
            "e2e/vim-image-caret.spec.ts"
          ]
        },
        {
          "id": "vim-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-4/vim.json"
          ]
        }
      ],
      "roles": [
        "reviewer"
      ],
      "ownerChecks": [],
      "nextTask": "EC-5"
    },
    "EC-5": {
      "files": [
        "plans/e2e-coverage-efficiency.md",
        "e2e/agenda-editing.spec.ts",
        "src/renderer/agenda-command-matrix.test.ts",
        "src/renderer/agenda-row-keyboard.test.ts",
        "src/renderer/agenda-row-keyboard.property.test.ts",
        "src/renderer/agenda-key-policy.test.ts",
        "src/renderer/agenda-editing-handlers.test.ts"
      ],
      "commands": [
        {
          "id": "typecheck",
          "argv": [
            "npm",
            "run",
            "typecheck"
          ]
        },
        {
          "id": "lint",
          "argv": [
            "npm",
            "run",
            "lint"
          ]
        },
        {
          "id": "format",
          "argv": [
            "npm",
            "run",
            "format:check:changed"
          ]
        },
        {
          "id": "docs",
          "argv": [
            "npm",
            "run",
            "check:docs"
          ]
        },
        {
          "id": "permissions",
          "argv": [
            "npm",
            "run",
            "check:opencode"
          ]
        },
        {
          "id": "requirements",
          "argv": [
            "npm",
            "run",
            "check:requirements"
          ]
        },
        {
          "id": "modes",
          "argv": [
            "npm",
            "run",
            "check:e2e-modes"
          ]
        },
        {
          "id": "unit",
          "argv": [
            "npm",
            "test",
            "--",
            "src/renderer/agenda-command-matrix.test.ts",
            "src/renderer/agenda-row-keyboard.test.ts",
            "src/renderer/agenda-row-keyboard.property.test.ts",
            "src/renderer/agenda-key-policy.test.ts",
            "src/renderer/agenda-editing-handlers.test.ts"
          ]
        },
        {
          "id": "agenda",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-5/agenda.json",
            "--reporter=list,json",
            "--workers=6",
            "e2e/agenda-editing.spec.ts",
            "e2e/agenda-vim.spec.ts",
            "e2e/agenda-caret.spec.ts"
          ]
        },
        {
          "id": "agenda-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-5/agenda.json"
          ]
        }
      ],
      "roles": [
        "reviewer"
      ],
      "ownerChecks": [],
      "nextTask": "EC-6"
    },
    "EC-6": {
      "files": [
        "plans/e2e-coverage-efficiency.md",
        "plans/README.md",
        "docs/DEVELOPMENT.md"
      ],
      "commands": [
        {
          "id": "final-check",
          "argv": [
            "npm",
            "run",
            "check"
          ]
        },
        {
          "id": "final-1",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-6/final-1.json",
            "--reporter=list,json",
            "--workers=6"
          ]
        },
        {
          "id": "final-1-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-6/final-1.json"
          ]
        },
        {
          "id": "final-2",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-6/final-2.json",
            "--reporter=list,json",
            "--workers=6"
          ]
        },
        {
          "id": "final-2-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-6/final-2.json"
          ]
        },
        {
          "id": "final-memory",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-6/memory.json",
            "--reporter=list,json",
            "--workers=6",
            "--config=e2e/shared-application-memory.config.ts"
          ]
        },
        {
          "id": "final-memory-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-6/memory.json"
          ]
        },
        {
          "id": "final-focused",
          "argv": [
            "npm",
            "run",
            "test:e2e:diagnose",
            "--",
            "--shared-reset=reload",
            "--json-output=.scratch/e2e-coverage-efficiency/ec-6/focused.json",
            "--reporter=list,json",
            "--workers=6",
            "e2e/vim-text-editing.spec.ts",
            "e2e/agenda-editing.spec.ts"
          ]
        },
        {
          "id": "focused-summary",
          "argv": [
            "node",
            "scripts/e2e-timing.mjs",
            ".scratch/e2e-coverage-efficiency/ec-6/focused.json"
          ]
        }
      ],
      "roles": [
        "reviewer"
      ],
      "ownerChecks": []
    }
  }
}
```

## Execution Findings

Preparation only. No initiative task has executed. EC-1 remains the first implementation task, but unattended launch is blocked by missing runner preflight/final-acceptance/budget/closure support. Record audit mappings, measured evidence links, retained candidates, blockers and next-task notes here, outside immutable task scopes. The prepared scope and implementation allowance await owner approval after readiness; closure allowance is unresolved.

## Next Task and Resume Prompt

Next required action: separately authorize runner readiness work and complete unattended preflight. EC-1 can start only afterward, under explicit execution approval and the revised supported projection. No initiative implementation has started. No product requirement gaps have been identified for this test/workflow-only scope. The preparation evidence above is limited to its stated commands and scope.

```text
Prepare the separately scoped runner readiness work needed by AGENTS.md §8
and Development §§10–11. Keep E2E Coverage Efficiency unstarted. Identify
the implementation tasks, preflight evidence, owner involvement and budget
needed for prompt-free execution and post-implementation owner acceptance.
Do not treat this preparation prompt as implementation authorization.
```
