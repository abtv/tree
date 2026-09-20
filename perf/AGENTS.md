# Performance AGENTS.md

Rules for the Playwright performance project in `perf/`. The root `AGENTS.md` still applies.

## Rules

* Budgets, baselines, and scenario parameters are owned by this suite and its result artifacts; do not restate them in other documents (`docs/DEVELOPMENT.md` §12).
* Record every scenario through `perf/results.ts`. `PERF_BASELINE` enables same-machine regression comparison; when set, the run fails if the baseline lacks any recorded scenario or metric, so re-record the baseline when adding scenarios or metrics. Baseline artifacts are recorded locally and never committed.
* Measure through the running application, never with test-only hooks in production code.
* Keep the application window visible: the typing scenarios measure paint latency for a presented window, and same-machine baselines are recorded that way. Do not apply the hidden e2e window mode to `perf/`.
* Each typing scenario focuses an explicit target field, asserts it is focused, and asserts the current-parent heading was not edited.
* Use two consecutive animation frames for paint timing and print one JSON line per scenario.
* Keep process ownership, serial execution, and bounded teardown.

## Commands

* Run `npm run test:perf`; the suite also runs in `npm run check:full`.
