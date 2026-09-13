# Consolidate Live Documentation Sources of Truth

Status: Completed
Created: 2026-09-13
Completed: 2026-09-13

## Goal

Give every fact in the live documentation a single owner, so future agent sessions have one authoritative source per fact and do not encounter conflicting or drifting copies.

The live documentation set is:

* `README.md` — the project index and entry point;
* `AGENTS.md` — how the coding agent should work;
* `docs/PRODUCT.md` — user-visible product behavior;
* `docs/ARCHITECTURE.md` — technical structure, boundaries, and invariants;
* `docs/DEVELOPMENT.md` — development environment, commands, and validation.

Architecture Decision Records are historical decision records: they capture the context and rationale at the time of the decision and are not edited to follow later implementation changes. However, a fact that remains live and has an owner elsewhere must be referenced rather than restated inside an ADR, so the ADR cannot drift out of sync with its owner. Implementation plans are historical records and are allowed to contain copies of facts from the time they were written.

## Ownership model

* **`README.md`** owns the project's identity and documentation index. It must not restate product behavior, technology stack, prerequisites, commands, test-suite mechanics, or architectural layers; it points to the owning document.
* **`docs/PRODUCT.md`** owns user-visible behavior and product-level quantities (maximum depth, undo depth, autosave triggers, edit-session grouping, preview bounds, bounded-time quit behavior).
* **`docs/ARCHITECTURE.md`** owns structural boundaries, dependency direction, domain invariants, and technical mechanisms. It must not restate product quantities or user-visible error messages; it references `docs/PRODUCT.md`.
* **`docs/DEVELOPMENT.md`** owns the environment, commands, the validation pipeline, formatting, generated files, and test-suite mechanics. It must not restate architectural responsibilities or agent rules; it references the owning document.
* **`AGENTS.md`** owns agent operating rules: role, language, source-of-truth precedence, the product/architecture change process, plan and ADR conventions, the test contract, the validation requirement, documentation responsibilities, Git discipline, completion criteria, and escalation. It must not restate command pipelines or architectural detail; it references the owning document.

## Duplications found and resolution

### Product quantities restated in architecture

1. `ARCHITECTURE.md` §5 restates the 20-level depth limit and the exact error string. Owner: `PRODUCT.md` §2.3. Resolution: keep the invariant and `MAX_DOCUMENT_DEPTH` mechanism, reference the product section for the value and message.
2. `ARCHITECTURE.md` §11 restates the 200-entry history bound. Owner: `PRODUCT.md` §10. Resolution: keep the retention mechanism, reference the product section for the bound.
3. `ARCHITECTURE.md` §13 restates the ten-word and ten-second autosave triggers. Owner: `PRODUCT.md` §16.1. Resolution: keep the watermark/accounting mechanism, reference the product section for triggers.

### Quantities owned by configuration, tests, or plans

4. `DEVELOPMENT.md` §12 restates coverage floors. Owner: `vitest.config.ts`. Resolution: describe the enforcement, reference the config.
5. `DEVELOPMENT.md` §12 restates performance budgets and scenario parameters. Owner: the `perf/` suite and the completed performance plan (per `PRODUCT.md` §22.1). Resolution: describe the strategy, reference the owning files/plans.

### Architecture restated in development

6. `DEVELOPMENT.md` §14 restates layer responsibilities from `ARCHITECTURE.md`. Resolution: replace with a cross-reference.

### Agent/process rules restated across `AGENTS.md` and `DEVELOPMENT.md`

7. Plan and ADR rules: `AGENTS.md` §8 owns them; `DEVELOPMENT.md` §11 restates naming and metadata. Resolution: `DEVELOPMENT.md` keeps the purpose and locations and points to `AGENTS.md` §8.
8. Validation: `AGENTS.md` §10 owns the requirement; `DEVELOPMENT.md` §9 owns the pipeline. Resolution: `AGENTS.md` states the requirement and points to `DEVELOPMENT.md` §9.
9. Git rules: `AGENTS.md` §12 owns the discipline; `DEVELOPMENT.md` §17 restates it. Resolution: `DEVELOPMENT.md` keeps the pre-commit commands and points to `AGENTS.md` §12.
10. Completion criteria: `AGENTS.md` §13 owns them; `DEVELOPMENT.md` §20 restates them. Resolution: `DEVELOPMENT.md` points to `AGENTS.md` §13.
11. Documentation responsibilities: `AGENTS.md` §11 owns the mapping; `DEVELOPMENT.md` §19 restates it. Resolution: `DEVELOPMENT.md` points to `AGENTS.md` §11.
12. Defect and boundary test rules: `AGENTS.md` §9 owns them; `DEVELOPMENT.md` §8 restates them. Resolution: `DEVELOPMENT.md` keeps mechanics and points to `AGENTS.md` §9.

### Live facts restated in the README

13. Product overview: `README.md` restates the tree/attachment/navigation model. Owner: `PRODUCT.md` §1, §2, §20. Resolution: keep a one-line identity and point to `PRODUCT.md` for authoritative behavior.
14. Technology stack: `README.md` restates Electron/React/TypeScript/Vite. Owner: `ARCHITECTURE.md` §2. Resolution: point to `ARCHITECTURE.md`.
15. Prerequisites: `README.md` restates Node.js `24.13.1`, npm `11.8.0`, and `.nvmrc`. Owner: `DEVELOPMENT.md` §2. Resolution: point to `DEVELOPMENT.md`.
16. Commands and validation: `README.md` restates the command list and the before-commit requirement. Owner: `DEVELOPMENT.md` §3–§9; `AGENTS.md` §10. Resolution: point to `DEVELOPMENT.md`.
17. End-to-end suite description: `README.md` restates the macOS-only build-and-run behavior. Owner: `DEVELOPMENT.md` §8. Resolution: point to `DEVELOPMENT.md`.
18. Layer/module layout: `README.md` restates the `domain`/`application`/`infrastructure`/`main`/`renderer` split. Owner: `ARCHITECTURE.md` §3, §21. Resolution: point to `ARCHITECTURE.md`.
19. Documentation-directory convention: `README.md` restates when `docs/plans/` and `docs/decisions/` are created. Owner: `AGENTS.md` §8. Resolution: point to `AGENTS.md` §8.
20. Development principles: `README.md` restates the ownership, domain/UI separation, and testing principles. Owner: `AGENTS.md` §1, §7, §9, §11; `ARCHITECTURE.md` §4, §19. Resolution: point to the owning documents.

### Live facts restated in ADRs

21. ADR 0002 restates the command roles of `check`/`check:full` and the e2e platform and runner mechanics, and the definition of done. Owner: `DEVELOPMENT.md` §8–§9; `AGENTS.md` §10. Resolution: reference the owning sections and retain only decision-specific rationale.
22. ADR 0004 restates the 200-entry bound and autosave triggers and the cleanup triggers and the scale target. Owner: `PRODUCT.md` §10, §16.1, §17; `ARCHITECTURE.md` §13; `DEVELOPMENT.md` §12. Resolution: reference the owning sections.
23. ADR 0001, 0003, and 0005 either are superseded or are the primary source that live documents reference; they contain no live duplication that needs redirection.

## Validation

Documentation-only change. Run `npm run format:check` and `npm run check` to confirm the repository remains valid. No product behavior, data model, or architecture changes.

## Risks

* Cross-references must not cycle: the owning section must contain the fact, and the referring document must not point back to the referring section for the same fact.
* Removing a restated quantity must leave the owning document's statement intact and unchanged in meaning.

## Outcome

* `docs/ARCHITECTURE.md` now references `docs/PRODUCT.md` for the depth limit, undo bound, and autosave triggers instead of restating them.
* `docs/DEVELOPMENT.md` now references `AGENTS.md` §9 for coverage policy, defect and boundary rules, and completion criteria; `vitest.config.ts` for coverage floors; the `perf/` suite and completed performance plan for budgets; `AGENTS.md` §12 for Git discipline; `AGENTS.md` §11 for documentation responsibilities; and `docs/ARCHITECTURE.md` for layer responsibilities. The long per-test guard catalog was condensed to a guard-family map with file references.
* `AGENTS.md` §10 now states the validation requirement and points to `docs/DEVELOPMENT.md` §9 for the pipeline definition. This also removed a stale pipeline summary that omitted the formatting check and dependency audit.
* `AGENTS.md` §11 now lists `README.md` as the project identity and documentation index alongside the four source-of-truth documents.
* `docs/PRODUCT.md` was not changed; it already owned the product behavior and quantities.
* `README.md` is now a project index: a one-line identity plus links to the owning documents. It no longer restates the product overview, technology stack, prerequisites, command list, end-to-end mechanics, layer layout, documentation-directory convention, or development principles.
* ADR 0002 now references `docs/DEVELOPMENT.md` §8–§9 and `AGENTS.md` §10 for command roles, e2e mechanics, and the validation requirement instead of restating them.
* ADR 0004 now references `docs/PRODUCT.md` §10, §16.1, and §17, `docs/ARCHITECTURE.md` §13, and `docs/DEVELOPMENT.md` §12 for the history bound, autosave policy, attachment cleanup, and scale target instead of restating them.
* ADR 0001, 0003, and 0005 were left unchanged; they are either superseded or the primary source for a decision that live documents reference.
* Implementation plans remain historical records and may contain copies of facts from the time they were written.

