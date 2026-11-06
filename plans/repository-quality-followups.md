# Repository quality follow-ups

Status: Task 1 complete; remaining tasks not authorized

## Source and authorization

The owner's 2026-11-06 repository assessment request produced a conversational
assessment of `ceacf5c` (8.7/10) and three follow-ups. The owner then requested
"Continue with #1". Only task 1 is authorized for implementation. Tasks 2 and 3
remain proposals; recording them does not authorize execution.

The owner explicitly authorized committing in this session despite the known
npm audit vulnerability on 2026-11-06. This exception applies to the unchanged
development dependency finding, not to new failures or future sessions.

## Tasks

1. **Done — simplify state coordination.** Extract a cohesive responsibility
   from the existing coordinators without changing behavior, public commands,
   persistence format, dependencies, or platform boundaries. Start with search
   view transitions in `src/application/editor-store.ts` and `editor-search.ts`;
   preserve Tree/Agenda selection, fold ownership, focus tokens and save timing.
   Inspect App and input bindings but do not split composition roots solely to
   reduce file size. Update `docs/ARCHITECTURE.md`. Acceptance: narrower store
   responsibility, explicit transition contract, existing search and persistence
   regressions passing, independent review. High Risk validation: `npm run check`,
   full `npm run test:e2e`, dependency audit, affected search performance scenarios.
   Implementation consolidates search origin/reveal/hide policy in EditorSearch;
   EditorStore retains publication effects. Checks passed: 5958 unit tests, all
   950 Electron E2E tests and 5 search performance scenarios. Independent reviewer
   found no meaningful issues. The unchanged dependency audit remains failed,
   with the owner's explicit exception for this session's commit.
2. **Not authorized — CI protection before merge.** Assess affected E2E checks for
   ordinary changes in `.github/workflows/test-and-build-app.yml` and related
   workflows. Preserve release gates and platform coverage. Define the concrete
   policy and validation scope before implementation; owner decision required.
3. **Not authorized — dependency findings and remaining verification.** Assess the
   minimatch development dependency advisory and browser storage/import, memory,
   and release evidence. Expected inputs: `package.json`, `package-lock.json`,
   browser E2E, performance suites and release workflows. Dependency changes are
   High Risk. Operational checks depend on actual account capabilities. Do not
   infer authorization for updates, publication or repository settings changes.

## Boundaries and evidence

No product behavior or fundamental architecture change is authorized. A local
owner extraction within the application layer needs no new architecture decision.
The existing full audit fails on 17 moderate development-dependency entries;
`npm audit --omit=dev` passed. Preserve that unrelated failure explicitly; do not
weaken the audit gate or update dependencies as part of task 1.

## Owner involvement

Three proposed working tasks; one currently authorized. No manual product check
was required for behavior-preserving task 1. The owner accepted the known audit
exception before commit. The review batch remains open until the
owner confirms that no tasks remain; final acceptance is required if all three
working tasks are delivered. Implementation is bounded to one focused extraction
and its required validation/review corrections in this task.

## Next task

No further task is authorized. Task 1 is delivered by the commit that records this
status. Tasks 2 and 3 require separate authorization; do not start them automatically.

## Continuation prompt

Read `plans/repository-quality-followups.md` and repository state. Task 1 is complete.
Obtain a task choice and authorization before starting task 2 or 3. Preserve the
known dependency finding; the exception for task 1 was limited to its commit session.
