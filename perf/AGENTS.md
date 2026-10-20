# Performance AGENTS.md

Rules for performance suites and comparison runners in `perf/`. The root `AGENTS.md` still applies.

## Rules

* Budgets, baselines, and scenario parameters are owned by this suite and its result artifacts; do not restate them in other documents (`docs/DEVELOPMENT.md` §12).
* Record every Electron suite scenario through `perf/results.ts`. `PERF_BASELINE` enables same-machine regression comparison; when set, the run fails if the baseline lacks any recorded scenario or metric, so re-record the baseline when adding scenarios or metrics. Baseline artifacts are recorded locally and never committed.
* Measure through the running application, never with test-only hooks in production code.
* Keep the application window visible: the typing scenarios measure paint latency for a presented window, and same-machine baselines are recorded that way. Do not apply the hidden e2e window mode to `perf/`.
* Each typing scenario focuses an explicit target field, asserts it is focused, and asserts the current-parent heading was not edited.
* Use two consecutive animation frames for paint timing and print one JSON line per scenario.
* Keep process ownership, serial execution, and bounded teardown.

## Commands

* Select scope under root procedure §10. Run affected specs with `npm run test:perf -- <specs>`; use `npm run test:perf -- --project=electron` for a required full Electron run. `npm run check:full` includes the full Electron suite when that all-suites command is selected.
* `npm run test:perf` without a project also runs the browser scenarios in `perf/web/` (the `web` project) in visible Chrome. A `PERF_BASELINE` recorded before a scenario existed lacks it, so select the project the baseline covers or re-record the baseline.
