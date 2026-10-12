# Runner Readiness

## Objective and Authorization

Provide the runner capabilities required by [AGENTS §8](../AGENTS.md#8-plans-and-architecture-decisions) and [Development §§10–11](../docs/DEVELOPMENT.md) before unattended [E2E Coverage Efficiency](e2e-coverage-efficiency.md) execution.

Status: **Proposed; preparation authorized; implementation and new runtime probes not authorized.** The Product Owner requested continued preparation without implementation on 2026-10-12. Prior approval of the portable host permission rule does not authorize initiative execution or preflight fixtures. E2E Coverage Efficiency remains unstarted. No executable projection or execution ledger is created during preparation.

Selected tool: Codex. Four substantive working tasks are proposed, so explicit final owner acceptance is mandatory. Follow the configured roles and security postures in [Agent Roles](../docs/AGENT_ROLES.md). Preserve application behavior, data, architectural boundaries and permission restrictions.

## Evidence and Readiness Gaps

Preparation baseline: clean HEAD `bb08102`, authored by `abtv` on 2026-10-12; no `WORKING_PLAN.md`. An independent planner inspected the current runner sources and proposal evidence using read-only commands. Runner host/record implementation last changed at `a3bd0fd`, authored by `abtv` on 2026-10-12. These are source-inspection findings, not fresh runtime proof:

* `scripts/initiative-runner-host.mjs` exposes initiative execution through `--authorized-plan`, without a dedicated preflight operation.
* Its same-task resume substitutes the persisted original starting commit, which conflicts with closure projection from committed Done status. `initiative-runner-plan.mjs` accepts Done tasks through `closureAuthorized`, but the supported host CLI lacks a complete closure path.
* `initiative-runner-records.mjs` uses a fixed deadline derived from start time and budget. It has no suspension for final owner waiting.
* Existing task `ownerChecks` and agent acceptance assessments precede commit. They do not provide initiative-level post-implementation owner acceptance tied to the delivered commit.

Preliminary evidence remains in `.scratch/runner-readiness/preflight/REPORT.md` and `FINAL-RESULT.md`; the latter supersedes `PERMISSION-SETUP.md`. Historical scratch adapter probes required outer approvals and did not construct a coordinator. They do not establish current unattended execution through a future supported host operation. The plan carries their relevant conclusions so continuation does not depend on retaining scratch files.

## Ordered Tasks

| ID | Outcome | Depends on | Status |
| --- | --- | --- | --- |
| RR-1 | Dedicated bounded preflight host operation | Implementation and probe authorization | Planned |
| RR-2 | Post-implementation owner acceptance and rejection | RR-1 | Planned |
| RR-3 | Suspend waiting consumption and preserve repair allowance | RR-2 | Planned |
| RR-4 | Closure, restart and integrated readiness proof | RR-2, RR-3 | Planned |

### RR-1 — Dedicated Bounded Preflight

Implement a supported capability-probe path separate from coordinator construction. Isolate preflight records from execution records; neither execute initiative tasks nor start their allowance. Expected owners: host, process and Codex adapter modules, relevant record helpers and adapter tests, Development Guide and this plan.

Acceptance requires fresh authenticated native primary execution and same-session resume; configured reviewer/product-verifier launch and permitted inspection; native scratch editing and artifact reading; process inspection, exclusive ownership, bounded interruption and independently confirmed cleanup; required validation launch paths including Electron and performance; staging, hooks, append-only commit and reconciliation in an isolated synthetic repository. Record commands, snapshots, native identities, interventions, cleanup and limitations. Confirm no coordinator, initiative-task mutation or execution-budget ledger was created. Repeat affected operations without intervention after supported setup.

A new preflight or closure argument may require narrowly reviewed permission configuration and a fresh session. Do not broaden permissions or use an initiative coordinator as a probe. Live probes need a separately approved scope and time allowance.

### RR-2 — Final Owner Acceptance and Rejection

Implement post-commit initiative state separate from task owner checks. Retain the committed plan/index as `Awaiting owner acceptance` after the final substantive task. Expected owners: state, coordinator, host, projection and records modules, related state/adapter tests and workflow documentation.

Require attributable explicit owner acceptance identifying the delivered commit and relevant reviewed inputs. Initial execution approval, passing checks and agent assessments cannot substitute. Rejection records issues and permits only authorized repairs. Changed reviewed inputs invalidate acceptance; preserve unrelated changes. Restart preserves acceptance/rejection state. Ambiguous legacy records fail closed without inferred approval. Closure remains blocked before acceptance.

### RR-3 — Waiting and Preserved Repair Allowance

Exclude final owner waiting from implementation consumption while preserving remaining allowance and recovery history. Provide a separate approved closure allowance. Expected owners: record/state/coordinator modules, host/projection integration, related tests and workflow documentation.

Use deterministic clock tests for waiting, restart, acceptance and rejection. Waiting consumes no implementation allowance; rejection resumes the remainder without renewing the budget or recovery counters. Exhaustion retains evidence and unfinished work. Contradictory or corrupt ledgers block advancement. Closure uses its distinct allowance. Do not implement destructive migration or silently reset legacy records.

### RR-4 — Closure, Restart and Integrated Proof

Correct supported closure projection and same-task restart reconciliation. Expected owners: host, projection, coordinator, Git/record integration, adapter tests and workflow documentation. Update the E2E Coverage Efficiency proposal only for the supported contract; do not execute it.

Project closure from the correct committed Done source. Test crashes before/after commit against actual ancestry and plan state. Through supported host paths, demonstrate an accepted synthetic initiative closing and a rejection/authorized repair/renewed acceptance sequence preserving budgets. Stale acceptance, changed relevant inputs or unconfirmed owned-process cleanup must block continuation; unrelated changes must be preserved and excluded from closure. Report configured, verified and unresolved capabilities with their invalidation boundaries. E2E Coverage Efficiency remains unstarted.

## Validation and Review

Each implementation task is High Risk because it changes process, filesystem, security or execution lifecycle behavior. Require `npm run check:full`, affected unit/contract/failure-path tests, independent reviewer and workflow product verifier. Verify meaningful state transitions and real boundaries. Runtime checks and role launch paths must use supported permissions.

Reuse valid evidence under Development §9; changes to configuration, authentication/trust, repository location, host, launch mechanism, scope, records or command arguments invalidate affected capability evidence. Assess runner disk writes/syncs, process CPU and retained record/log memory growth; keep output bounded and add guards where changed state can grow with tasks or recoveries.

Preparation-only edits are Minimal Risk: `npm run format:check:changed`, `npm run check:docs`, `npm run check:opencode`, and primary diff review. They require no application tests or runtime probes. Each implemented task will use `WORKING_PLAN.md` for its working context and validation, update this plan in its commit, and remove its temporary working plan before that commit.

## Reserved Decisions and Bootstrap

No application product requirement gaps were identified. Ordinary internal module boundaries, receipt representation and test organization may be resolved within scope. Product expansion, destructive migration, weaker restrictions and major architecture changes remain reserved.

The runner cannot promise unattended execution before RR-1 supplies its missing preflight. Proposed bootstrap: implement RR-1 with the owner available for supported approvals, then perform separately authorized bounded preflight. RR-2–RR-4 may run unattended only with explicit authorization and verified capabilities. Preparation does not grant either authorization.

Before implementation, the Product Owner must decide scope authorization (whole initiative or named tasks), bootstrap execution mode, whether later tasks may run unattended, bounded preflight scope/allowance, and implementation/closure allowances. Resolve actual permission, trust or authentication requests through supported approval mechanisms. Final acceptance remains a separate decision tied to the finished commit.

## Proposed Budget and Owner Involvement

Implementation, validation and recovery: **180 minutes**, proposed allocation RR-1 45, RR-2 35, RR-3 35, RR-4 45, contingency 20. Separate post-acceptance closure: **15 minutes**. These are estimates, not approved allowances. A bounded live-preflight allowance remains to be agreed separately. Approval must define bootstrap and later host accounting without renewing consumed allowance; preserve recovery history across execution-mode transitions.

Four substantive tasks require one final owner acceptance round. Owner involvement comprises initial implementation/budget authorization, any actual setup approvals during preflight, final acceptance and further acceptance rounds after rejection. Automated validation and independent workflow verification need no owner intervention once their launch paths are verified. Closure of an unchanged explicitly accepted result needs no second approval. Zero mandatory manual application UI checks are currently identified; the number of setup interventions remains unknown until live preflight.

## Exact Next Action

Review the proposal and settle the reserved execution decisions before authorizing the bootstrap. Implementation, runtime probes and E2E Coverage Efficiency remain unauthorized. This plan's existence is not authorization to begin RR-1.

Resume prompt: “Continue Runner Readiness preparation from `plans/runner-readiness.md`; keep implementation, runtime probes and E2E Coverage Efficiency unstarted unless their recorded authorization has changed.”
