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
| AW-3 | Codex adapter, bounded recovery and operational documentation | AW-2 | Adapter contract tests, process/budget tests, required validation and independent review | Ready |
| AW-4 | Bounded fresh-run pilot and closure | AW-3; numeric pilot budget | Actual capability evidence, automatic task transition, recovery evidence and no outstanding required checks | Planned |

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

## Owner Involvement

Expected application manual verification: **zero confirmed rounds, zero confirmed checks** for the documentation and runner itself. The live pilot has unresolved runtime capabilities, so this is not a promise of unattended completion. Do not count a missing native capability as passed.

| Check or decision | Classification | When | Owner action |
| --- | --- | --- | --- |
| Numeric elapsed-time budget | Resolved | AW-4 live execution | 60 minutes approved; no further answer needed |
| Fresh Codex authentication/trust and narrow command permissions | Capability unresolved | AW-3/AW-4 preflight | Only if the supported permission flow requires it; present exact action and reason |
| Required role launch and artifact inspection | Capability unresolved | First authorized use | None if verified; otherwise report the missing capability before dependent work |
| Native keyboard/menu/transient lifecycle observation | Capability unresolved; not required by current runtime scope | Only if pilot/task scope actually requires it | Add explicit steps and revised round count before reaching the affected completion gate |

Do not bundle checks across a task's required pre-commit boundary. Report any newly discovered owner check with its reason and updated estimate.

## Next Task

AW-3: implement the native Codex adapter, durable receipts, exclusive process ownership and bounded recovery. AW-2 completed the gate library after independent review corrected malformed attribution and blocker handling; scoped reviewer and workflow-verifier rechecks found no meaningful issues. This initiative is approved; no additional implementation approval is required for its stated scope. The live pilot limit is 60 minutes. Automatic launching is not implemented yet.

Resume with: “Continue the approved Autonomous Initiative Execution plan at its next ready task. Preserve the 60-minute pilot limit and all validation, role, scope and permission boundaries.”
