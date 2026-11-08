---
name: improve-docs
description: Audit and reconcile all Markdown documentation in Tree against its authoritative documents, implementation, tests, and configuration. Fix unambiguous inconsistencies and present a short summary for explicit owner approval before committing. Use for repository-wide documentation consistency work, not ordinary feature documentation or other repositories.
---

# Improve docs

Make Tree's documentation consistent without changing product intent or rewriting history. A request to reconcile documentation authorizes clear documentation corrections and their validation. An audit-only request authorizes inspection and recommendations only. Loading this skill alone does not authorize edits.

Follow Tree's root and applicable nested `AGENTS.md` instructions and their required procedures. This skill adds a task-specific commit gate: leave changes uncommitted until the owner approves the reviewed result. Do not change repository policy to remove that gate. Keep repository text in English and communicate with the owner in simple Russian.

## Establish scope and coverage

Inspect Git state and unfinished task context. Preserve existing changes and distinguish them from this task's edits. This skill applies only to Tree; do not apply its project assumptions to another repository.

Inventory all repository-authored `.md` files, including hidden directories, README, security documentation, agent instructions and skills, plans, ADRs, and nested documentation. Use Git's tracked-file inventory as well as discovery of nonignored untracked files so ordinary search exclusions cannot hide tracked documents. Exclude dependencies, Git internals, generated output, and disposable scratch artifacts from the maintained-document corpus; explicitly account for exclusions. Read relevant unfinished task evidence separately for continuation. Do not follow links outside the repository as additional editable scope.

Read every included document, in manageable batches when necessary. Search helps locate related claims but does not replace reading the corpus. Classify documents as current requirements or procedures, proposals, historical decisions, completed plans, or generated material. A completed plan is not a current requirement, and a live policy document remains current regardless of its age.

Keep temporary coverage and findings in `.scratch/tree-docs-consistency/`, following Tree's scratch lifecycle and preserving any existing task evidence. Record reviewed and pending paths, exclusions, unresolved findings, changed files, validation, and the exact next action. This is continuation evidence, not a permanent audit report. Do not claim a complete audit while included files remain unread or evidence is unavailable.

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

Collect owner-dependent issues together and continue independent corrections. Ask early when a decision blocks broad work. Do not manufacture agreement by deleting one side of a contradiction. If a problem cannot be resolved within documentation scope, record it and explain what separate decision or task is needed.

## Validate and review

Use the current documentation validation tier in `docs/DEVELOPMENT.md` §9 and the relevant workflow procedures. Run the required formatting, documentation, and agent-workflow checks for the actual changes. Inspect the full diff, including untracked files, against the request and its evidence. Use independent roles when Tree's rules require them.

Automated link and formatting checks do not establish semantic consistency. Revisit related documents after edits and verify that the correction did not create another contradiction or change a requirement unintentionally. Distinguish inspected source, passing tests, inferred conclusions, and unverified runtime behavior. Report required checks that failed or could not run; do not present a partial audit as complete.

Retain temporary coverage and validation evidence through owner review or session handoff. Do not create a permanent report or validation archive. A new session must recover the remaining work and the no-commit condition without asking the owner to reconstruct them.

## Summarize and wait for commit approval

After completing all independent authorized work and required checks, show a TLDR in simple Russian, at most seven short plain-text lines; fewer lines are fine. Include the outcome and coverage, the main corrections, validation status, and any unresolved decision or limitation. End by saying that files are uncommitted and asking for explicit approval to commit. Keep detailed evidence in the temporary task record and provide it on request. Never hide a blocking issue to fit the summary; group related issues and link the record when necessary.

Stop before staging or committing and wait for the owner's answer. Invocation, continuation, silence, or agreement with a proposed direction is not commit approval. This gate overrides Tree's ordinary autonomous-commit workflow for this task.

Approval applies to the result or subset the owner reviewed. If feedback requires substantive changes, make and validate them, then present an updated TLDR and wait for approval of that result. After explicit commit approval, inspect the current diff, reuse still-valid checks, stage only the approved task files, and follow Tree's commit and cleanup procedures. Approval does not authorize pushing. If no files changed, report the audit outcome without requesting an empty commit.
