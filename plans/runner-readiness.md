# Runner Readiness

## Objective and Authorization

Provide the runner capabilities required by [AGENTS §8](../AGENTS.md#8-plans-and-architecture-decisions) and [Development §§10–11](../docs/DEVELOPMENT.md) before unattended [E2E Coverage Efficiency](e2e-coverage-efficiency.md) execution.

Status: **RR-1 implementation and approved live preflight complete; RR-2–RR-4 unauthorized.** On 2026-10-12 the Product Owner authorized RR-1 only with a 45-minute implementation, validation and recovery allowance. The initial allowance expired during a canceled sandbox-approval wait; the owner approved a renewed 45-minute allowance at 06:25 UTC, retaining prior failure/recovery history. That renewed window remained fixed through 07:10 UTC and did not authorize later work. The separately authorized live-preflight attempts and allowances are recorded below; none renews implementation accounting or authorizes initiative execution. E2E Coverage Efficiency remains unstarted. No executable projection or execution ledger was created for this owner-assisted bootstrap.

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
| RR-1 | Dedicated bounded preflight host operation | Implementation and bounded live proof separately authorized | Complete |
| RR-2 | Post-implementation owner acceptance and rejection | RR-1 | Planned |
| RR-3 | Suspend waiting consumption and preserve repair allowance | RR-2 | Planned |
| RR-4 | Closure, restart and integrated readiness proof | RR-2, RR-3 | Planned |

### RR-1 — Dedicated Bounded Preflight

Implement a supported capability-probe path separate from coordinator construction. Isolate preflight records from execution records; neither execute initiative tasks nor start their allowance. Expected owners: host, process and Codex adapter modules, relevant record helpers and adapter tests, Development Guide and this plan.

Acceptance requires fresh authenticated native primary execution and same-session resume; configured reviewer/product-verifier launch and permitted inspection; native scratch editing and artifact reading; process inspection, exclusive ownership, bounded interruption and independently confirmed cleanup; required validation launch paths including Electron and performance; staging, hooks, append-only commit and reconciliation in an isolated synthetic repository. Record commands, snapshots, native identities, interventions, cleanup and limitations. Confirm no coordinator, initiative-task mutation or execution-budget ledger was created. Repeat affected operations without intervention after supported setup.

A new preflight or closure argument may require narrowly reviewed permission configuration and a fresh session. Do not broaden permissions or use an initiative coordinator as a probe. Live probes need a separately approved scope and time allowance.

Implementation contract: the supported `--authorized-preflight` operation pins a bounded native-edited scratch manifest and records independent preflight evidence without constructing the coordinator or creating an execution budget. It reuses production process, native primary/resume and committed configured-role adapters; commands are restricted to existing validation/process inspection and isolated synthetic Git paths. It retains the shared exclusive lock when cleanup is unconfirmed. See [Development Guide §11](../docs/DEVELOPMENT.md#initiative-runner) for the manifest and supported CLI/API. Synthetic tests and implementation validation do not fulfill the fresh authenticated acceptance proof above. The approved RR-1 live scope is now verified as recorded below; it does not enable unattended RR-2 or fulfill future acceptance, waiting-budget or closure capabilities.

The implementation commit includes its regression coverage and workflow documentation. High Risk validation passed using the composed-stage evidence allowed by Development §9; independent reviewer and workflow product verifier found no meaningful issues. No application behavior, permission rules or later task implementation changed in that commit. Detailed transient validation and recovery evidence is retained in the task's ignored scratch handoff. Live proof was pending at implementation completion; the fresh-session result below supplies the approved RR-1 scope.

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

The owner has selected RR-1 only, owner-assisted bootstrap and its implementation allowance, and subsequently authorized the bounded live scope below with separate allowances. Later tasks, unattended execution and closure allowance remain unapproved. Resolve actual permission, trust or authentication requests through supported approval mechanisms. Final initiative acceptance remains a separate decision tied to the finished commit.

## Proposed Budget and Owner Involvement

Implementation, validation and recovery: **180 minutes**, proposed allocation RR-1 45, RR-2 35, RR-3 35, RR-4 45, contingency 20. Separate post-acceptance closure: **15 minutes**. These are estimates, not approved allowances. The separately approved bounded live-preflight allowances are recorded below. Approval must define bootstrap and later host accounting without renewing consumed allowance; preserve recovery history across execution-mode transitions.

RR-1 bootstrap exception: the owner approved its initial 45 minutes and explicitly renewed a 45-minute allowance after expiration/canceled approval. This does not approve the remaining initiative estimate or reset recovery evidence, and does not start an initiative execution ledger.

Four substantive tasks require one final owner acceptance round. Owner involvement comprises initial implementation/budget authorization, any actual setup approvals during preflight, final acceptance and further acceptance rounds after rejection. Automated validation and independent workflow verification need no owner intervention once their launch paths are verified. Closure of an unchanged explicitly accepted result needs no second approval. Zero mandatory manual application UI checks are currently identified; the number of setup interventions remains unknown until live preflight.

## Live Preflight Permission Setup — 2026-10-12

RR-1 implementation is committed as `817a95db50a0c31035ee777b30d0221fb432b183`. The owner approved the proposed live-preflight scope with a separate 30-minute allowance in this session; the recorded window is 19:35–20:05 UTC. The first exact host invocation requested platform approval and the owner pressed Esc. The tool reported it aborted; authenticated live proof remains pending. Preserve the prepared invocation manifest and artifact under `.scratch/runner-readiness/preflight/live-20261012-a/`. No initiative execution was launched.

The owner subsequently authorized a narrow persistent preflight permission rule, committed as `2b07d38`. It covers the reviewed host, relative root `.` and the fixed entry `.scratch/runner-readiness/preflight/approved-manifest.json`; each invocation still requires a separately authorized scope, unique id, pinned manifest identity and attributable approval reference. Existing validation/process rules supplied configuration for the proposed probes; live child permissions, authentication and cleanup were unverified at setup time. No arbitrary Node, Git, native-agent or other-initiative allowance was added. Rule changes require a fresh trusted Codex session before runtime testing. This setup did not renew the original allowance. RR-2–RR-4 and E2E Coverage Efficiency remain unstarted and unauthorized.

## Approved Live Scope and Historical Allowance

### Approved RR-1 live preflight

Approved separate allowance: **30 minutes**, 19:35–20:05 UTC on 2026-10-12, with the owner available for supported permission/trust/authentication approvals. Stop at expiration or a denied capability, retain evidence and confirm owned-process cleanup; never renew an allowance or clear an ownership lock automatically. RR-2–RR-4 and E2E Coverage Efficiency remain outside this scope.

After explicit approval, prepare a native-edited, identity-pinned manifest under `.scratch/runner-readiness/preflight/` for the dedicated `--authorized-preflight` path. Use invocation-specific ids and fixtures; retain the exact command, source snapshot, approval reference and interventions for each attempt. Do not create an execution projection or coordinator.

1. Authenticate and launch one fresh native primary against the actual trusted checkout. Have it use native tools to create/read a synthetic fixture and inspect an artifact within its owned preflight directory. Resume that exact native session and check its identity and fixture/artifact observations.
2. Launch the committed configured reviewer and product verifier through the production adapter for permitted fixture/artifact inspection. Record native identities, effective launch settings and any limitations; do not infer OS-enforced role restrictions from configuration.
3. Exercise the exact process-inspection command, shared ownership exclusion and bounded host interruption. Independently inspect the returned process table and cleanup markers before releasing ownership; retain the lock and stop if native cancellation cannot be confirmed. A second host may test lock rejection but must not launch concurrent work.
4. Exercise existing `npm run check:full` through the dedicated host, including real Electron, performance and audit launch paths. Reuse the implementation results for correctness where valid, but distinguish them from proof of this host launch mechanism. Do not launch suites concurrently or label future acceptance/closure paths as implemented.
5. Prepare an isolated synthetic Git repository within the invocation's `fixtures/` directory, inspect its local hook setup, stage only synthetic files, run hooks and create an append-only commit through the approved Git command probes. Inspect actual HEAD/parent and clean status for reconciliation; preserve application Git state.
6. Review raw command/native logs, snapshots, hashes, intervention counts, cleanup and limitations. After supported setup, repeat affected operations with separately approved ids without intervention. Report configured, verified and unresolved capabilities, explicitly confirming no application/task mutation or execution-budget ledger. Missing proof blocks unattended launch.

The newly owner-approved persistent rule covers the fixed preflight entry manifest described above. A fresh trusted session must load it before testing actual prompt-free access. Other command shapes still require supported approval; this scope does not authorize weaker permissions. If setup or full suites exhaust the approved allowance, retain the report and request an explicit continuation allowance rather than running beyond it.

## Fresh Trusted-Session Live Result — 2026-10-12

The owner authorized a new separate 30-minute allowance starting with the fresh-session request at approximately 19:41 UTC; this session used a conservative 20:11 UTC stop. This authorization preserved the canceled attempt, expired implementation windows and prior recovery history. The tested clean baseline was `2b07d388f5797059394abc5879dc017489c5f7db`, authored by `abtv` on 2026-10-12, containing implementation `817a95d` and the persistent rule. Exact host invocations through the fixed manifest ran without platform approval prompts, verifying effective permission access in this trusted session.

Retained evidence and the reviewed readiness report are under `.scratch/runner-readiness/preflight/live-20261012-{b,c,d,e,f}/` and `.scratch/runner-readiness/preflight/LIVE-RESULT-20261012.md`. The host pinned each manifest, approval reference, source snapshot, native identity, bounded raw log and artifact identity. No prior evidence was overwritten.

* Invocation `b` authenticated a fresh primary and resumed native session `01a131a3-4410-7942-9d90-96f6bef96fed`; native fixture editing succeeded, but primary read-back was not attempted because no dedicated text reader was exposed. Both configured roles used their authorized read-only shell fallback successfully. A concurrent exact host invocation was rejected by the shared lock before child launch. `npm run check:full` passed through the host: 3,517 coverage tests, 773 real Electron E2E tests, 60 Electron performance cases and audit with zero vulnerabilities.
* Invocation `c` repeated fresh primary/resume and configured-role inspection with the existing direct `exec_command cat` fallback made explicit. Native session `01a131ab-0f6c-72f2-ada6-89e534560dc8` preserved identity and context; actual fixture and artifact read-backs succeeded. Both configured roles read the files without intervention. In the isolated Git fixture, both commits emitted the inspected executable local pre-commit hook marker. Final HEAD `188abc07ba23a2cad92795e7d05b21e84de2eae6` has parent `886b4ac3157b3ff69a225b37e5a66fb9a7046b19`; status was clean.
* Invocation `d` completed its build before interruption could reach it, so it supplies no cancellation proof. Invocation `e` deliberately interrupted the owned host and `npm run check` through the execution tool. It retained an `interrupted` blocker, confirmed cleanup and released ownership. Independent exact process inspection found no remaining native/test/host workers. Invocation `f` then completed exact process inspection through a fresh host, proving post-interruption launch without reclaiming a lock or renewing an existing id.

All probe before/after snapshots preserved application HEAD, tracked content and index. Retained record checksums and artifact identities were independently verified. All invocations confirmed cleanup; no shared lock remained, and no coordinator, execution projection or execution `authorization.json`, `run.json` or `budget.json` was created. Current setup approval/authentication interventions: zero. The deliberate interruption is test input, recorded separately from setup; the canceled historical approval and both current recovery steps remain recorded.

Limitations: this proves only the exercised host, checkout, committed configuration, authentication and command scopes. Reviewer runtime declared read-only; verifier runtime declared workspace-write with network disabled. Successful inspection does not establish mechanically enforced role command/no-edit restrictions. The interruption exercised a validation child, not native-session cancellation. Synthetic hook/commit reconciliation does not implement initiative acceptance or closure. RR-2–RR-4 are still needed before unattended initiative launch and final initiative acceptance.

## Exact Next Action

RR-1 and its approved live-preflight scope are complete. RR-2–RR-4 and E2E Coverage Efficiency remain unstarted and unauthorized. The next possible working task is RR-2, requiring explicit owner authorization and its execution allowance; no automatic continuation is authorized. Retain this plan and index for the remaining initiative and eventual final owner acceptance.
