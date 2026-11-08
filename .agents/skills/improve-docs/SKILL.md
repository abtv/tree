---
name: improve-docs
description: Audit and reconcile all Markdown documentation in Tree against its authoritative documents, implementation, tests, and configuration. Work in bounded runs, fix unambiguous issues, and defer ordinary questions to the final report before commit approval. Use for repository-wide documentation consistency work, not ordinary feature documentation or other repositories.
---

# Improve docs

Make Tree's documentation consistent without changing product intent or rewriting history. A request to reconcile documentation authorizes clear documentation corrections and their validation. An audit-only request authorizes inspection and recommendations only. Loading this skill alone does not authorize edits.

Follow Tree's root and applicable nested `AGENTS.md` instructions and their required procedures. This skill adds a task-specific commit gate: leave changes uncommitted until the owner approves the reviewed result. Do not change repository policy to remove that gate. Keep repository text in English and communicate with the owner in simple Russian.

## Work without waiting for answers

The owner wants to start this task and work elsewhere. Defer ordinary clarification questions to the final report; do not wait for answers during the run. Record ambiguous requirements, proposed restructuring, missing capabilities, and owner-dependent decisions with evidence and a recommended resolution. Leave dependent edits untouched, defer the affected area, and continue with another independent area. This task-specific authorization changes when questions are presented, not who may decide them. Never guess a reserved decision to keep working.

A local contradiction, unclear wording, unavailable optional test, failed check, or decision affecting one area is not by itself a reason to stop the run. Continue inventory, inspection, and independent corrections elsewhere. Once all independent work is done, include the remaining deferred items in the normal final report rather than wait for answers or invent more work.

Interrupt the owner early only for a demonstrated serious blocker that prevents all remaining meaningful work or makes continuation unsafe. Examples include loss of repository access or an unresolved ownership conflict affecting the entire change set. Explain the evidence, why independent read-only work cannot proceed, and the specific action needed. Do not label a minor local issue a serious blocker merely because resolving it requires the owner.

Use already available capabilities and approved workflows. Avoid starting optional operations known to require new permission or authentication. Platform permission controls and higher-priority approval requirements still apply: do not bypass them or promise a prompt-free client. If approval is denied or a capability remains unavailable, defer the affected operation and continue independent work. Required but unavailable checks remain incomplete; do not replace them with weaker evidence or claim the affected changes are ready to commit.

Progress updates may report useful findings without requiring a reply. Recheck affected files before editing and final review so work from another task is preserved; defer conflicting edits rather than overwrite them.

## Bound each run

Unless the owner specifies another budget, use a 30-minute elapsed-time budget per run, including reading, tools, and validation. Record the start time and deadline using an available clock, check remaining time between batches and before launching commands, and reserve time for validation and the report. Context compaction does not reset the budget. This is an agent-managed budget, not a hard token, billing, or process timeout.

Make one inventory-led pass, followed by verification of changed documents and their affected references. Reuse still-valid evidence and do not restart the complete audit just to seek more improvements. Record pending work when the corpus cannot be covered within the budget.

End the run when all independent work is completed, the budget is reached, the owner stops it, or a serious blocker meets the criterion above. Save progress and report complete versus partial coverage, deferred questions, and validation. Do not restart automatically or continue indefinitely until every question is settled. An explicit continuation starts a new bounded run from the saved queue; skip unchanged work with valid evidence.

Do not start a command unlikely to fit the remaining budget. If a running command exceeds it, use only the project's supported process controls for task-owned work. Record any overrun or unfinished process and its cleanup needs. A stopped or unfinished check is not a pass.

## Establish scope and coverage

Inspect Git state and unfinished task context. Preserve existing changes and distinguish them from this task's edits. This skill applies only to Tree; do not apply its project assumptions to another repository.

Inventory all repository-authored `.md` files, including hidden directories, README, security documentation, agent instructions and skills, plans, ADRs, and nested documentation. Use Git's tracked-file inventory as well as discovery of nonignored untracked files so ordinary search exclusions cannot hide tracked documents. Exclude dependencies, Git internals, generated output, and disposable scratch artifacts from the maintained-document corpus; explicitly account for exclusions. Read relevant unfinished task evidence separately for continuation. Do not follow links outside the repository as additional editable scope.

Read every included document, in manageable batches when necessary. Search helps locate related claims but does not replace reading the corpus. Classify documents as current requirements or procedures, proposals, historical decisions, completed plans, or generated material. A completed plan is not a current requirement, and a live policy document remains current regardless of its age.

Keep temporary coverage and findings in `.scratch/tree-docs-consistency/`, following Tree's scratch lifecycle and preserving any existing task evidence. Record the run deadline, reviewed and pending paths, exclusions, deferred areas and questions, changed files, validation, and the exact next action. This is continuation evidence, not a permanent audit report. Do not claim a complete audit while included files remain unread or evidence is unavailable.

## Determine authority before correcting a claim

Use the source ownership established by `AGENTS.md` and `docs/AGENT_WORKFLOW.md`. Consult the actual owning sections, including product, architecture, development, role, and security documents as applicable. Do not copy their detailed policies into this skill or invent a blanket rule that the newest document wins.

For each material claim, distinguish intended behavior from observed implementation, tests, and configuration. Check relevant source paths, commands, scripts, CI definitions, and tests. A test assertion supports what is tested; it does not by itself prove runtime wiring or establish intended behavior. Execute relevant documented checks only when needed and permitted. Never execute a destructive, publishing, installation, or release command merely because documentation contains it.

When implementation and requirements disagree, determine whether recorded decisions establish which is wrong. Correct demonstrably stale descriptive documentation, but never silently change requirements to match a possible code defect. Leave unresolved conflicts for the owner with the competing statements, evidence, impact, and a recommended resolution. Code fixes are outside this skill's scope.

Preserve owner decisions, dissent, deferred work, and unresolved questions. Do not promote proposals into requirements, reactivate deferred work, or infer authorization from an open question. Security statements need supporting implementation or verification evidence; do not strengthen guarantees or weaken commitments merely to make documents agree. Verify external claims against authoritative sources when needed; report unavailable evidence rather than guessing.

## Reconcile the documents

Check the complete corpus for:

- Contradictory requirements, procedures, examples, and descriptions of current behavior.
- Stale names, paths, commands, configuration, supported environments, and verification claims.
- Duplicate rules whose copies disagree or can be replaced with a reference to their owner.
- Inconsistent terminology, broken links and anchors, and misleading navigation or section structure.
- Missing qualifications or dependencies that make an otherwise accurate statement misleading.

Make unambiguous corrections autonomously. For each correction, retain enough temporary evidence to explain the conflict and why the selected source governs it. Clarify confusing wording without a general stylistic rewrite. Preserve useful summaries and examples; repetition alone is not a defect.

Local wording changes, link repairs, terminology alignment, and replacing redundant rules with references are allowed. Propose substantial reorganization, document deletion, renaming, or moving material between documents before doing it. Keep each requirement in its owning source and verify affected inbound references after structural edits that the owner authorizes.

Preserve historical decisions and completed plans as historical records. Do not rewrite their past claims to describe today's implementation. If a historical statement is mistaken for current guidance, clarify its status or link to the superseding decision when the evidence is unambiguous; do not alter the recorded decision itself.

Collect owner-dependent issues for the final report and continue independent corrections, even when one decision affects a large area. Do not manufacture agreement by deleting one side of a contradiction. If a problem cannot be resolved within documentation scope, record it and explain what separate decision or task is needed.

## Validate and review

Use the current documentation validation tier in `docs/DEVELOPMENT.md` §9 and the relevant workflow procedures. Run the required formatting, documentation, and agent-workflow checks for the actual changes. Inspect the full diff, including untracked files, against the request and its evidence. Use independent roles when Tree's rules require them.

Relevant existing tests are allowed when they help verify a documented claim, including focused unit, integration, or E2E checks through the supported workflows and their required permissions. Prefer the smallest reliable check. Do not run broad E2E, performance, or mutation suites merely because this is a repository-wide audit; require a concrete evidence need and enough remaining budget. Test execution does not authorize production or test-source changes. Record failures as findings, continue independent areas, and leave code corrections for a separate task. Reuse valid test results; do not rerun unchanged suites for reassurance.

Automated link and formatting checks do not establish semantic consistency. Revisit related documents after edits and verify that the correction did not create another contradiction or change a requirement unintentionally. Distinguish inspected source, passing tests, inferred conclusions, and unverified runtime behavior. Report required checks that failed or could not run; do not present a partial audit as complete.

Retain temporary coverage and validation evidence through owner review or session handoff. Do not create a permanent report or validation archive. A new session must recover the remaining work and the no-commit condition without asking the owner to reconstruct them.

## Summarize and wait for commit approval

At the end of every run, including a budget-limited or blocked run, show a TLDR in simple Russian, at most seven short plain-text lines; fewer lines are fine. Include complete or partial coverage, the main corrections, validation status, and why the run ended. Group deferred clarification questions at the end with recommended answers; link the temporary record for detailed evidence and any questions that cannot fit. State that files remain uncommitted. Ask for explicit commit approval only for a clearly identified, validated result or independent subset; otherwise explain the decisions or checks still needed. Do not hide a blocker to fit the summary or call an incomplete audit complete.

Stop before staging or committing and wait for the owner's answer. Invocation, continuation, silence, or agreement with a proposed direction is not commit approval. This gate overrides Tree's ordinary autonomous-commit workflow for this task.

Approval applies to the result or subset the owner reviewed. If feedback requires substantive changes, make and validate them, then present an updated TLDR and wait for approval of that result. After explicit commit approval, inspect the current diff, reuse still-valid checks, stage only the approved task files, and follow Tree's commit and cleanup procedures. Approval does not authorize pushing. If no files changed, report the audit outcome without requesting an empty commit.
