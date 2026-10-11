# Autonomous Initiative Execution

## Objective and Authorization

Deliver an initiative workflow in which the Product Owner answers a consolidated planning question batch, reviews the scope and expected involvement, and explicitly authorizes implementation. After approval, agents complete the in-scope tasks, required validation, independent reviews, focused local commits, and closure without requiring manual session switching.

The Product Owner approved this direction in the conversation on 2026-10-11, including updates to the shared workflow documentation and a small external runner with a Codex adapter first. This is implementation authorization for this initiative, not authorization to execute the separate E2E Coverage Efficiency initiative. Execution remains in Codex. Claude Code and OpenCode adapters, publishing, dependency changes, application behavior changes, and blanket permission expansion are outside scope.

Approved decisions:

* Initiative approval covers every in-scope task, review correction, and closure commit; no repeated permission to continue.
* Agents may choose reversible UX details inside explicitly delegated areas using recorded principles. New capabilities outside scope, unspecified destructive or migration behavior, major architecture changes, and weakening standing commitments remain reserved.
* Required manual checks block the affected task. Planning must estimate the number of owner verification rounds and checks before implementation and expose unresolved capabilities separately.
* Start with Codex, one fresh primary run per task, independent roles under the existing role contract, and two unsuccessful recovery attempts at the same blocker without new evidence before escalation. Quality takes priority over token savings.
* The Product Owner approved a 60-minute elapsed-time limit for the live pilot on 2026-10-11. The allowance applies across fresh task runs and retries; restarting does not renew it. This does not start the pilot clock during implementation.

## Sources and Constraints

Use [AGENTS.md](../AGENTS.md), [Development Guide §§9–11](../docs/DEVELOPMENT.md#9-full-validation), [Agent Roles](../docs/AGENT_ROLES.md), and [Working with the Coding Agent](../docs/WORKING_WITH_AGENT.md). Preserve current validation requirements until an explicitly authorized replacement is committed. Keep product and architecture requirements unchanged.

Inspection baseline: clean commit `42cf3b9`, authored by `abtv` on 2026-10-11. Local read-only commands established Codex CLI `0.162.1` and its noninteractive JSON/schema output options; they did not establish fresh-run authentication, permissions, reviews, or native verification. The earlier analysis found a historical Agenda task labeled Done despite pending native-keyboard acceptance. Completion must depend on evidence and Git reconciliation, not labels or agent exit status alone.

The runner is a deterministic coordinator, not another product decision-maker. It must preserve role restrictions, never approve its own permission expansion, never switch tools, never rewrite Git history or discard dirty work, and never overlap Electron/performance invocations. Use existing native Codex execution and file-editing tools. Keep temporary records under `.scratch/`; do not introduce a permanent validation archive.

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| AW-1 | Shared approval, autonomy, planning and handoff contract | None | Consistent documentation, owner-involvement template, policy review and documentation checks | Done |
| AW-2 | Deterministic runner state and completion gates | AW-1 | Tests reject unauthorized/stale/incomplete results and preserve interrupted work | Done |
| AW-3L | Bounded development launcher and reusable permission rule | AW-2 | Implementation, composed full validation, independent review and no-prompt runtime launch verified | Done |
| AW-3 | Codex adapter, bounded recovery and operational documentation | AW-2 | Adapter/host regressions, composed High Risk validation and independent reviewer/verifier passes complete | Done |
| AW-4 | Bounded fresh-run pilot and closure | AW-3; numeric pilot budget | Actual capability evidence, automatic task transition, recovery evidence and no outstanding required checks | Ready |
| AW-41 | Synthetic recovery and first commit boundary | AW-3 | Failed documentation check, fresh repair, independent review and reconciled commit | Done |
| AW-42 | Automatic fresh-task transition and Electron evidence | AW-41 | Fresh primary, real Electron checks, independent roles and reconciled commit | Done |

### AW-1 — Shared Workflow Contract

Expected files: `AGENTS.md` §§5, 8, 12–14; `docs/DEVELOPMENT.md` §§10–11; `docs/AGENT_ROLES.md` planner responsibilities; `docs/WORKING_WITH_AGENT.md`; this plan and `plans/README.md`.

Record the planning/approval sequence, initiative-wide authorization, delegated decision boundaries, concrete escalation conditions, expected owner checks and rounds, small context handoff, and recovery within the current task versus advancement. Preserve contained-task authorization, review-batch restrictions unless the whole batch is authorized, prototype/no-commit conditions, independent roles and validation. Distinguish the intended automatic workflow from a runner not yet implemented. Resolve contradictory continuation wording without claiming runtime support.

Validation tier: Minimal Risk, documentation only. Run changed formatting, documentation governance and OpenCode governance checks. Independently review the policy against the approved conversation, including concrete interruption/recovery examples. No native verification or product requirement gap.

### AW-2 — Runner State and Gates

Expected files: new `scripts/initiative-runner*.mjs` modules and tests, with a small structured task/authorization format chosen after inspecting the native adapter contract; `package.json` only if an entry point is necessary; this plan.

Keep the committed human-readable plan authoritative for scope and decisions. Avoid a second independently editable task specification. Bind execution to the selected initiative, tool, approved scope and starting Git state. Define pending, executing, blocked and completed transitions; require validation and applicable review/owner evidence tied to the actual changes before advancement. Check actual Git ancestry, intended commit and plan update. Missing, malformed, stale or contradictory evidence fails closed. Unknown dirty work blocks; interrupted owned work resumes the same task. Do not use a model-generated success field as sole proof.

Test interruption before/after commit, stale plan status, missing evidence, failed review, altered scope, dirty work, duplicate launches and completed-task replay. Reserve any material change to the agreed authorization or evidence model for the Product Owner.

Validation tier: High Risk for orchestration of processes, filesystem state and authorization. Run focused runner tests during development, then complete validation and independent code review before committing. Product verification treats the workflow as the product. No application performance impact is expected; test bounded runner state and output retention.

### AW-3 — Codex Adapter and Recovery

Prerequisite AW-3L was authorized after three ad-hoc native launch approvals interrupted implementation. It owns `scripts/initiative-launch.mjs`, its test, `.codex/rules/initiative-launch.rules`, development instructions and this plan/index. Complete and review the fixed-operation launcher, then restart Codex once to load its rule and probe actual no-prompt behavior. It is a launch prerequisite, not a complete controller. Preserve unfinished AW-3 modules and `WORKING_PLAN.md` across that restart. Validation tier: High Risk, including synthetic real-process tests, full validation, independent reviewer and workflow verifier. No live AW-4 pilot is authorized by this prerequisite.

Expected files: runner modules/tests from AW-2; `docs/DEVELOPMENT.md` operational instructions; `docs/WORKING_WITH_AGENT.md`; `.codex/rules/` only for a demonstrated and separately reviewed narrow gap; this plan.

Launch fresh Codex primary runs through supported native interfaces, with explicit repository working directory and existing sandbox/rules, capturing structured events and usage. Preserve native subagent role restrictions. Reject unsupported tooling or missing permissions rather than selecting unrestricted access. Pass only the task context and source links needed; use native resume only when it helps recover the same unfinished task.

Enforce an initiative-wide elapsed-time allowance across restarts, bounded recovery, exclusive ownership, graceful interruption and owned-process cleanup. Preserve logs/evidence and worktree on failure. Serialize native test execution. Report blockers with the next supported action. Test timeout, signal, malformed output, approval denial, authentication failure and budget exhaustion using synthetic processes before a live run.

AW-2 provides conservative exact-snapshot gates and read-only Git observations, with 77 regression cases and successful complete validation. The adapter must establish authentic receipt provenance and exclusive launch ownership; the gate library alone does not provide either. Add an explicit final-closure contract for retiring the plan and its index entry: ordinary task gates require a retained Done row and intentionally reject implicit plan deletion. Preserve newly discovered blockers even when their task commit has already landed.

Validation tier: High Risk; full validation, independent reviewer and separate workflow verifier. Reuse valid AW-2 results only when their inputs remain unchanged. No automatic changes to user configuration, trust or permissions.

### AW-4 — Pilot and Closure

Expected files: this plan, `plans/README.md`, operational guidance in `docs/DEVELOPMENT.md` and `docs/WORKING_WITH_AGENT.md`; task-owned temporary evidence under `.scratch/autonomous-initiatives/`.

After the Product Owner supplies the elapsed-time limit, define a bounded synthetic pilot that exercises at least two fresh task runs, independent review, a real validation/commit boundary, and recovery without changing unrelated initiatives or user data. Prove the selected host can run the needed Electron workflow and inspect its artifact; native keyboard/menu/lifecycle observation remains a separate capability. Do not use a disposable write merely to infer permission: use the first authorized pilot operation. Record whether operations prompted separately from whether they passed.

Measure total usage including repeated context, reviews and retries, elapsed time, human interventions and quality failures. Do not claim fresh contexts save tokens without comparable evidence. If a required capability is unavailable, preserve the plan with the exact blocker rather than declaring completion. Remove this plan only after all acceptance work completes and enduring guidance reaches its owner.

Validation tier: Minimal Risk for final documentation, plus outstanding High Risk implementation checks and explicit live pilot acceptance. Independent review of cumulative completion evidence. No repository-wide approval or capability claim from a single successful command.

### AW-41 — Synthetic recovery and first commit boundary

This is the first bounded synthetic subtask of AW-4, authorized by the Product Owner's 2026-10-12 continuation. Edit only this plan's permitted task status transitions and `docs/DEVELOPMENT.md`. Add one paragraph after the runner operational guidance explaining that a synthetic documentation failure exercises recovery without changing application behavior. The lasting paragraph must link to the active plan index at `../plans/README.md` and say that seeded failures must be reported separately from naturally occurring quality findings.

For the initial fresh attempt ONLY, deliberately use `../plans/aw4-recovery-check.md` as that paragraph's link target. Do not create that file. This is an explicitly seeded broken relative link: the host's real documentation check must reject it before review or commit. On a fresh same-task recovery carrying the failed command evidence, replace that link with `../plans/README.md`; do not seed another failure. Preserve every other paragraph and all unrelated work. The host runs checks, review, acceptance and commit, then advances AW-42 automatically. Remove any temporary WORKING_PLAN.md before returning the candidate, as the host requires.

Validation tier: Minimal Risk documentation; scoped formatting, documentation governance and OpenCode governance. Independent reviewer required by this pilot. No product requirement gap, runtime implementation change or owner check.

### AW-42 — Automatic fresh-task transition and Electron evidence

This is the second synthetic subtask of AW-4. Edit only this plan's AW-42 status and `docs/WORKING_WITH_AGENT.md`. Add a concise operational paragraph explaining that a pilot must count fresh primaries, acceptance resumes, independent roles and retries in usage, retain its original elapsed deadline, and distinguish observed permissions from configured permissions. Do not claim savings or quality equivalence from a single pilot. Preserve other content and unrelated initiatives; remove any temporary WORKING_PLAN.md before returning.

Validation tier: Minimal Risk documentation plus explicit live pilot acceptance. The host runs formatting, documentation and OpenCode checks, then the existing `e2e/window-appearance.spec.ts` workflow serially with retained output under the pilot ledger directory. This exercises real Electron launch, both appearances and teardown with isolated application data. Inspect its generated dark/light PNG artifacts in the outer session before AW-4 closure; passing automation alone does not establish artifact inspection or native manual input. Independent reviewer and workflow verifier required. No manual native keyboard/menu checks are required by this scope.

## AW-4 Execution Projection

The pilot remains unstarted: no live budget ledger, authorization record or runner lock was found by `rg --files --hidden .scratch` on 2026-10-12 at clean HEAD `a3bd0fd5bddceaa61c57f606bafece064ea337cc`. Retained AW-3 completion evidence also records an unstarted budget. Preserve those historical files. Because the runner refuses to create a budget in a nonempty evidence directory, this same AW-4 pilot uses the distinct ledger namespace `.scratch/autonomous-initiatives-pilot/`; outer coordination notes stay in `.scratch/autonomous-initiatives/aw4/`. This is a scratch-path implementation exception, not a different initiative or renewed budget. Never change this namespace or approval reference to evade retained state. Coordinator construction starts the single cumulative allowance; its budget.json deadline governs both tasks, retries and restarts.

The existing fixed launcher authorizes AW-3 only. Invoke the documented generic host through its supported permission flow with approval reference `AW4-owner-2026-10-12-60min`. No new permission rule, model override or unrestricted launch is authorized. An unrelated default Electron process observed at PID 11208 blocks the host's required quiescence check; the owner has been asked to close it normally. Never terminate it or replace the check. Expected owner verification remains zero rounds/checks; closing that unrelated app and any host approval are setup interventions, counted separately.

```initiative-runner
{
  "version": 1,
  "tool": "codex",
  "initiative": "autonomous-initiatives-pilot",
  "budgetMs": 3600000,
  "tasks": {
    "AW-41": {
      "files": ["plans/autonomous-initiatives.md", "docs/DEVELOPMENT.md"],
      "commands": [
        { "id": "format", "argv": ["npm", "run", "format:check:changed"] },
        { "id": "docs", "argv": ["npm", "run", "check:docs"] },
        { "id": "opencode", "argv": ["npm", "run", "check:opencode"] }
      ],
      "roles": ["reviewer"],
      "ownerChecks": [],
      "nextTask": "AW-42"
    },
    "AW-42": {
      "files": ["plans/autonomous-initiatives.md", "docs/WORKING_WITH_AGENT.md"],
      "commands": [
        { "id": "format", "argv": ["npm", "run", "format:check:changed"] },
        { "id": "docs", "argv": ["npm", "run", "check:docs"] },
        { "id": "opencode", "argv": ["npm", "run", "check:opencode"] },
        {
          "id": "electron",
          "argv": ["npm", "run", "test:e2e", "--", "e2e/window-appearance.spec.ts", "--workers=1", "--output=.scratch/autonomous-initiatives-pilot/electron-artifacts"]
        }
      ],
      "roles": ["reviewer", "product_verifier"],
      "ownerChecks": []
    }
  }
}
```

After both committed subtask gates, outer AW-4 closure must inspect Electron artifacts and retained recovery/deadline records, aggregate native usage including acceptance and role launches (unknown totals remain unknown), count prompts/interventions and genuine versus seeded failures, obtain independent cumulative review, and run the final documentation tier before retiring this plan and only its index row. Earlier AW-3 High Risk evidence remains valid while runtime inputs are unchanged. If execution blocks, retain this projection unchanged and record the exact original starting commit, ledger deadline and supported resume invocation outside its bound task scopes.

## Owner Involvement

Separate setup involvement: **one confirmed Codex restart**, completed. At commit `3654b987`, the outer coordinator invoked the reviewed `develop-aw3` operation without a new approval prompt. Native session `01a12ce8-d98a-7422-ac99-5bfe4b25fcea` completed repository inspection, native edits and focused synthetic tests, then returned successfully. A second fixed development launch also started without a prompt. These observations establish the bounded development path, not automatic controller advancement or AW-4 pilot acceptance.

Expected application manual verification: **zero confirmed rounds, zero confirmed checks** for the documentation and runner itself. The live pilot has unresolved runtime capabilities, so this is not a promise of unattended completion. Do not count a missing native capability as passed.

| Check or decision | Classification | When | Owner action |
| --- | --- | --- | --- |
| Numeric elapsed-time budget | Resolved | AW-4 live execution | 60 minutes approved; no further answer needed |
| Fresh Codex authentication/trust and narrow command permissions | Capability unresolved | AW-3/AW-4 preflight | Only if the supported permission flow requires it; present exact action and reason |
| Required role launch and artifact inspection | Capability unresolved | First authorized use | None if verified; otherwise report the missing capability before dependent work |
| Native keyboard/menu/transient lifecycle observation | Capability unresolved; not required by current runtime scope | Only if pilot/task scope actually requires it | Add explicit steps and revised round count before reaching the affected completion gate |

Do not bundle checks across a task's required pre-commit boundary. Report any newly discovered owner check with its reason and updated estimate.

## Next Task

AW-4 preparation is complete; live execution is blocked before clock start by the unrelated default Electron application (PID 11208 observed on 2026-10-12). The configured independent reviewer found **No meaningful issues found** in the two-task projection. Scoped formatting, documentation governance and OpenCode governance passed. Historical AW-3 High Risk results remain valid because no runtime, fixture, role, build or performance inputs changed. Temporary details are in `.scratch/autonomous-initiatives/aw4/preflight.md`; AW-3 records were preserved. No live run, retry, native role receipt, Electron check or pilot commit boundary has yet executed. One owner setup request was made to close that unrelated app normally; zero required manual verification rounds/checks and zero host permission prompts so far. Total coordinator/planner/reviewer usage is unavailable through the exposed tools, not zero. No savings or quality-equivalence claim is supported.

Exact next action: after the owner closes the unrelated Electron app, inspect the standalone process table again. Do not kill unrelated processes or weaken quiescence. Verify that the projection commit is the current clean HEAD, inspect any retained `.scratch/autonomous-initiatives-pilot/budget.json` and original starting commit before proceeding, and launch:

```text
node /Users/andrew/work/tree/scripts/initiative-runner-host.mjs --authorized-plan /Users/andrew/work/tree plans/autonomous-initiatives.md AW-41 <full-projection-commit> AW4-owner-2026-10-12-60min
```

Use the supported host permission flow with the exact command and no broader prefix rule. The fixed AW-3 launcher does not authorize this operation. Construction starts the approved cumulative 60-minute clock only if no ledger exists; an existing ledger always governs, including time between runs. AW-41 repairs the seeded failure then automatically transitions to AW-42. If interrupted, resume the same host invocation with its original full starting commit, namespace and approval reference. Preserve all records and unfinished work. Read actual budget/run/blocker evidence before any recovery; never renew the deadline. After both tasks, inspect dark/light Electron PNGs before another suite replaces them, aggregate all available primary/acceptance/role usage and elapsed/retry/intervention/correction counts, and independently review cumulative completion before final documentation validation and closure. Do not select the E2E Coverage Efficiency initiative.

Resume with: “Continue Autonomous Initiative Execution AW-4 from plans/autonomous-initiatives.md. Resolve the recorded unrelated-Electron preflight blocker, then execute the reviewed AW-41/AW-42 pilot projection through the supported host flow. Preserve the original cumulative 60-minute budget and retained evidence; do not reset it or change unrelated work.”
