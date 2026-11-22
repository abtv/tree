---
name: improve-architecture
description: Find architectural changes that would lower the cost of changing Tree, within a chosen scope and time budget. Start from Git evidence of change cost, apply ownership, layering, seam, and contract lenses, check the architecture documents against the code, and rank behavior-preserving proposals. Use for periodic architecture audits. Analysis-only by default; a structure that looks untidy but costs nothing is not a finding.
---

# Improve architecture

Find the places where the structure of Tree makes changes expensive or defects likely, and identify the smallest change that is worth making. The measure is change cost that the repository can show, not how the code looks. A supported recommendation to leave an area as it is counts as a successful result.

## Scope and authority

Default to investigation and proposals. Do not edit source, tests, configuration, or maintained documentation, add dependencies, stage, or commit unless the owner explicitly asks. A finding does not authorize its correction, even for a confirmed defect or a document that contradicts the code. Deliver the report in the conversation unless the owner asks for a file.

Follow the root and applicable nested `AGENTS.md` files. Record the Git commit and any uncommitted changes that the run inspects.

Use these entry points. `docs/ARCHITECTURE.md` indexes the architecture; its files name each owner by source file and symbol and state the rules that a change must keep. `docs/architecture/overview.md` holds the layers (§3), the dependency direction (§18), the simplicity rule (§20), and the invariants (§22). `docs/decisions/README.md` indexes the ADRs, `docs/GLOSSARY.md` defines the project terms, and `docs/PRODUCT.md` indexes the behavior that a proposal must preserve.

## Scope and time budget

Default to **the whole repository and at most 15 minutes for one run**, including orientation, history queries, checks, and the report. The owner can replace either value in plain words at invocation; a value that the owner does not mention keeps its default. With a narrower scope, follow outside dependencies only as far as the selected code requires, and list wider leads separately.

Read the clock at the start and fix the deadline. Check elapsed time between batches of work and before each command, and stop investigating while enough time remains to write the report. Do not start a query or a check that is unlikely to finish in the time left. At the deadline, stop, and state any overrun or unfinished command. The agent keeps this limit itself; it is not a process timeout, and context compaction does not reset it. If no clock can be read, say that the limit could not be verified.

After a short pass over the whole scope, spend the budget where the evidence of cost is strongest. Fifteen minutes does not cover the repository, so never imply that it did. End early when the scoped question is answered or the owner stops the run, never because a number of findings was reached. A later invocation is a new run; reuse earlier evidence only after confirming that the code and the history behind it are unchanged.

## Start from change cost

Begin with what history shows, before reading code for style. Use the read-only Git commands that the repository rules allow and `npm run fix:history` with repository-relative paths for the earlier fixes in given production files. Look for three signals:

- **Coupled change:** files or modules that repeatedly change in the same commit although they belong to different layers, processes, or features. Check whether one piece of knowledge forces the pairing.
- **Repeated fixes:** several `fix` commits in one area or with one theme. A cluster with one design cause is stronger evidence than any single defect.
- **Churn hotspots:** files that change far more often than their neighbors. Churn during active feature work is expected; churn that continues after the feature settled is a lead.

Add recorded evidence where it exists: review follow-up batches indexed in `plans/README.md`, the `Kind: technical` entries of `docs/OPEN_QUESTIONS.md`, and the costs and guards that architecture sections state. Open questions are evidence only; never select one for work or treat it as a decision.

State the window and the paths of every history query, and give counts as counted. Count from the command output; do not write a counting script unless the owner asks, and say so when the permitted commands cannot support a claim. A wide commit couples unrelated files, a rename hides earlier churn, and new code has no record, so treat a signal as a reason to read the code, not as a finding. A structure that looks untidy but has cost nothing in history, reviews, or tests is not a finding; list it under the areas left alone.

## Apply the lenses

Read the code that the signals point to, then judge it through the lenses that fit.

- **Module depth:** does a module hide a substantial implementation behind a small interface, or does a layer only pass calls through under another name?
- **Information leakage:** is one piece of knowledge, such as a format, a rule, an ordering, or a limit, written in several modules, so that a change must find every copy?
- **Ownership:** does each fact and each piece of state have one owner, with other code asking that owner instead of keeping a copy? ADR 0014 records this decision for renderer interaction state only. Elsewhere, single ownership is a lens, not a recorded rule.
- **Layering and dependency direction:** do imports and calls follow architecture §3 and §18, and do the invariants of §22 hold? Check the import statements, not the directory names.
- **Seams:** is each rule in a pure core, with effects in adapters, so that a test can exercise the rule without React, the DOM, Electron, or a browser?
- **Parallel implementations:** where the desktop application and the browser version, or the main process, the renderer, and a worker, implement the same behavior, does the shared part have one home? Is each difference deliberate and recorded?
- **Boundary contracts:** is each message across a process or worker boundary defined once, validated where it is received, and explicit about ordering, failure, and cancellation?
- **Stated costs:** does the structure add writes or syncs, work on interactive paths, or retained memory that grows with the document or the number of edits (`docs/PRODUCT.md` §22.1)?

Name concepts with the canonical terms of `docs/GLOSSARY.md`. Report a module boundary or an identifier that matches no glossary concept, or that mixes two concepts, because that mismatch often marks a misplaced responsibility. A different name alone is not a finding; the glossary records it under **In code**.

Before judging a candidate, look for the strongest defense of the current design: a stated rule, an ADR, a guard test, a measured cost, or a recorded rejected alternative. Keep apart what a document states, what the source shows, what an executed check showed, and what is inferred. Run an existing focused check only when it settles a real doubt and the rules permit it.

## Check the documents against the code

The architecture files make statements that can be checked: this module owns that state, this path performs no write, this type is defined once. For the inspected areas, open the named file and symbol and confirm each statement that a finding relies on. `npm run check:docs` proves only that a cited file exists.

When the code contradicts a statement, report the drift as a finding with both locations. Say which side looks wrong and why: text that a refactor left stale, or code that left the recorded design. Use the ADRs, the Git history of both sides, and the tests to decide. Do not correct either side.

## Respect decisions and stay in the lane

ADRs, the invariants of architecture §22, and the product principles of `docs/PRODUCT.md` §1.1 are constraints, not candidates for cleanup. A proposal that contradicts one must present evidence that the decision did not have: a new cost, a changed premise, or an unforeseen consequence. Frame it as a decision for the owner and name the ADR that it would supersede. The reserved choices of `AGENTS.md` §6 stay reserved, whatever the size of the code change.

Hand off what another skill owns, with the location and the reason, instead of repeating its analysis:

- Phases and transitions that are spread over flags, refs, and callbacks go to `improve-state-machines`. This skill asks only where state lives and who owns it.
- Wording, structure, and consistency of documents go to `improve-docs`. This skill reports only drift between architecture statements and code.
- Latency, frames, flicker, and caret or scroll stability go to `improve-perceived-performance`. This skill considers only the cost model that a structure implies.

## Choose the smallest useful change

Compare every proposal with two alternatives: leaving the code unchanged, and a smaller local fix. State the concrete, current cost that the proposal removes, and cite the evidence. "Leave it" is a valid result when the cost is low, when the evidence is weak, or when the change would cost more than it saves. Do not propose a framework, a dependency, a new layer, or an abstraction for a need that does not exist yet (architecture §20). Prefer moving a responsibility to an owner that already exists, removing a copy, or narrowing an interface.

Give each proposal a migration that keeps behavior unchanged: ordered steps, each of which leaves the repository passing its checks. Name the existing tests that cover the behavior and the `docs/PRODUCT.md` sections that their `// @requirement` markers cite, and say where coverage must be added first. Flag as an owner decision any step that would change user-visible behavior, a persisted format, an IPC or worker contract, or the dependency direction. Assess writes and syncs, interactive CPU, and retained memory when the proposal could change them. Give the smallest validation that would show both the benefit and the preserved behavior.

## Report for decisions

Lead with the recommended next action and the overall conclusion. Then state briefly the inspected commit, the scope, the history windows, what was covered and what was not, the elapsed time, and why the run ended. Give the ranked findings, each with:

- **Location:** the files and symbols, including the connections across files, layers, and processes.
- **Evidence:** the Git data with its window, the code facts, review or question records, and any check that ran. Mark what is observed and what is inferred.
- **Consequence:** the change cost or the defect risk today, in concrete terms.
- **Proposed design:** a sketch of interfaces and ownership only, without implementation, and why it is better than leaving the code and than the smaller fix.
- **Migration and validation:** the behavior-preserving steps, the covering tests and requirement sections, the checks to run, and the steps that need an owner decision.
- **Cost and risk:** the size of the work, the regression risk, and the prerequisites.
- **Documents affected:** the architecture sections and ADRs that would change, and any glossary term.

Explain the ranking in words: the strength of the evidence, how much recurring cost the change removes, and its risk. Do not invent numeric scores. Merge findings that share one cause.

After the findings, give separate sections for documentation drift, speculative items with the evidence that would settle each one, handoffs to other skills, and areas examined and deliberately left alone, with the reason. Do not pad the list or claim that a partial pass covered the repository. End with the remaining uncertainty and the next useful investigation; do not start implementing.
