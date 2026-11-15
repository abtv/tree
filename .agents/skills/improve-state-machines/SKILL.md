---
name: improve-state-machines
description: Discover and evaluate implicit state machines in Electron, React, and TypeScript codebases within a chosen scope and time budget. Trace distributed state and lifecycle behavior, then rank evidence-backed opportunities for simpler explicit models. Use for state-model audits and architectural investigations of scattered transitions, flags, refs, or asynchronous coordination. Analysis-only by default; not a mandate to refactor ordinary UI state.
---

# Improve state machines

Find behavior whose states and transitions are distributed across values, owners, and control flow. Recommend an explicit model only when it improves correctness, maintainability, testability, or clarity enough to justify its cost. A well-supported recommendation to leave code unchanged is a successful outcome.

## Scope and authority

Default to investigation and proposals. Do not edit application code, tests, configuration, or maintained documentation, install dependencies, stage, or commit unless explicitly requested. Discovery of a defect does not authorize its repair during this audit. Return the report in the conversation unless the owner requests a file. Temporary evidence and existing checks may use the repository's permitted workflows and isolated synthetic data; never exercise a destructive workflow against personal data.

Follow root and applicable nested `AGENTS.md` instructions. Establish the requested scope and current Git snapshot, including relevant uncommitted changes. Load only the requirements, architecture, decisions, and validation guidance relevant to the paths under investigation.

For Tree, use `docs/ARCHITECTURE.md` to locate current owners and boundaries, then verify them in source. Cover the renderer, application, domain, infrastructure, Electron main/preload, shared IPC contracts, and browser adapters/workers where present. Consult `docs/PRODUCT.md` for the behavior at issue. Read `docs/decisions/0014-single-owner-for-renderer-interaction-state.md` when examining renderer interaction ownership; its scope does not extend to all application state. These are investigation entry points, not a list of presumed defects.

## Scope and time budget

Default to **all repository areas and a maximum of 15 minutes per run**, including orientation, investigation, checks, and reporting. The owner may override either value in ordinary language at invocation; an omitted value keeps its default. For a narrower scope, follow outside dependencies only as needed to establish the selected behavior and identify broader investigations separately.

At the start of the run, read the current time and establish the deadline. Check elapsed time between investigation batches and before checks. Finish investigation early enough to assemble and deliver the report within the budget. Do not start work that cannot reasonably finish within it. At the deadline, stop further investigation; report any overrun or unfinished command honestly. This is an agent-managed elapsed-time limit, not a guaranteed process timeout. Context compaction does not restart the clock. If no clock is available, disclose that the limit cannot be verified.

Use the budget to prioritize depth and consequences after a broad orientation; do not trade supported findings for superficial coverage. All areas are eligible by default, but full coverage is not promised within 15 minutes. Stop earlier when the scoped investigation is complete or the owner stops it, never because a finding quota has been reached. A subsequent invocation starts a new run with the default or newly specified budget; use prior evidence only after checking that its source and context remain current.

## Discover by behavior

Build a lightweight coverage map of behavioral areas, their entry points, and state owners. Combine a broad repository inventory with traces of user actions, background jobs, resource lifetimes, and process protocols. Follow commands through callers, subscribers, adapters, and cleanup paths rather than treating file boundaries as machine boundaries. Exclude generated output and dependencies; inspect tests, contracts, and relevant history as evidence.

Searches for flags, nullability, refs, effects, callbacks, and status strings provide leads, not findings. Also work backward from consequential effects and invariants: what permits a write, releases a resource, accepts a result, restores focus, or acknowledges completion? Follow queues, promise chains, listener registration, object existence, counters, request identities, and timers whose relationships encode phases without named states. Existing enums and reducers can still have implicit transitions or competing owners outside them.

Distinguish a behavioral machine from a collection of independent settings, derived values, caches, or ordinary UI state. Ask whether the same event has different meaning depending on prior events, and where that history is represented. A nullable value or a pair of booleans is not itself evidence of a design problem.

Investigate across the agreed scope, not just the first obvious clusters. Deepen candidates according to behavioral coupling and consequences within the remaining budget. Claim complete coverage only when the scoped areas are accounted for and consequential candidates are understood or explicitly marked unresolved. Report incomplete coverage and the exact next investigation when the budget, access, or execution limits prevent that outcome.

## Reconstruct before judging

For each credible candidate, reconstruct the smallest coherent machine from actual reads, writes, and event sequences. Use a transition table, diagram, trace, or notes as useful; do not force every area into the same representation. Establish:

- **State and ownership:** current fields and their owners, meaningful phases and phase-specific data, derived versus authoritative values, resource ownership, and independent concurrent dimensions.
- **Transitions:** triggering event, prior state, guard, next state, effects, and where each step happens. Include initialization, normal completion, failure, interruption, reset, and disposal where reachable.
- **Temporal rules:** ordering across `await`, callbacks, timers, subscriptions, React commits/cleanup, and process messages; duplicate or stale events, cancellation, retries, reentrancy, and replacement of the owning component, document, or process.
- **Invariants:** which combinations or transitions must be forbidden, which are valid intermediate states, and which external observers can see them. Distinguish type-representable combinations from reachable runtime states; inspect guards, serialization, batching, and cleanup before alleging an impossible-state bug.

Trace both producers and consumers across boundaries. Identify how a completion proves that its request and owner are still current, and whether cancellation prevents side effects or merely hides results. Examine synchronous notification reentrancy as well as asynchronous races. A named state does not by itself establish atomicity, ordering, idempotence, or crash recovery.

Challenge each candidate with the strongest existing defense: a single owner, enforced ordering, a derived value, a contract, or a test may already solve the apparent problem. Separate intended behavior, source-derived behavior, executed observations, and inference. Cite the relevant code and tests. Use existing focused checks when they resolve a real uncertainty and are permitted; do not claim a runtime reproduction from inspection alone. If proof is incomplete, specify the missing evidence instead of promoting a plausible interleaving to a confirmed defect.

## Choose the smallest useful model

Compare the proposed model with leaving the code unchanged and with a smaller local simplification. Explain exactly which invariant, transition, duplicated coordination, or testing difficulty improves. Do not count fewer booleans or more named states as a benefit by itself.

Prefer deriving redundant state or consolidating ownership when that resolves the issue. Use a TypeScript discriminated union for exclusive phases with phase-specific data; add a pure transition function or reducer when event handling needs one reviewable home. Keep independent dimensions separate rather than enumerating their Cartesian product. A dedicated state-machine abstraction is warranted only when concrete hierarchy, concurrency, or protocol complexity outweighs its maintenance cost; do not introduce a dependency by default.

Place the model in the layer that owns the behavior. Keep business rules outside React, platform effects in adapters, and pure transition logic separate from effect execution. Specify who runs effects and returns completion events, including any identity or cancellation checks. Avoid parallel copies of state and do not move runtime state into persistence merely to make the model explicit. Reuse existing owners and abstractions where adequate.

Treat existing observable behavior as the compatibility baseline. Map old representations and event sequences to proposed states, including side-effect order, error/cancellation behavior, lifecycle cleanup, IPC contracts, and persisted formats where affected. Flag a confirmed bug correction separately from a behavior-preserving restructuring; unresolved product or architecture choices remain decisions for the owner. Assess interactive work, memory retention, and disk operations when the proposal could change them.

Give a bounded migration outline and the smallest validation that would demonstrate the claimed benefit while preserving behavior. Name the important transition or event sequence to test, reuse adequate existing coverage, and include real-boundary checks when types or pure tests cannot establish runtime wiring. These are proposals, not authorization to implement them.

## Report for decisions

Lead with the recommended next action and overall conclusion. Briefly state the inspected snapshot, scope, coverage, exclusions, evidence limits, elapsed time, and why the run ended. Then provide ranked findings with enough detail to act:

- **Location and current representation:** file/line references and symbols for the relevant owners and transition sites, including cross-file connections.
- **Evidence and consequence:** the concrete event sequence or invariant, current guards and tests, and the demonstrated defect or structural burden. Label confidence and distinguish observed failures from source-based reasoning.
- **Proposed design and compatibility:** the smallest useful state/event sketch, ownership and effect boundary, why it beats a simpler alternative, and behavior that must remain unchanged. Include only the type sketch or transition excerpt needed to assess the choice.
- **Cost and next step:** expected benefit, implementation complexity, migration/regression risk, prerequisite decisions, and focused validation. Explain the ranking rather than inventing precise numerical scores.

Prioritize consequential correctness and lifecycle problems over cosmetic regularity. Weigh evidence strength, affected behavior, coordination removed, and implementation risk separately; a severe suspected defect may need investigation before a refactor. Merge findings that share one underlying owner or transition problem and expose dependencies between proposals.

Keep speculative opportunities in a separate section with the evidence needed to resolve them. Include meaningful candidates intentionally left unchanged and explain why an explicit model would add little value. Do not manufacture recommendations or claim exhaustive assurance from a coverage map. End with remaining uncertainties and the next useful investigation or implementation decision, without beginning implementation.
