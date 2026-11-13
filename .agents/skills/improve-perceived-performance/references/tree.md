# Tree entry points

Read this only when working in Tree. Paths below are repository-relative discovery hints, not architectural assumptions or a list of defects. Recheck them against the current checkout.

## Owners and existing coverage

- `AGENTS.md` and relevant sections of `docs/AGENT_WORKFLOW.md` govern scope, experiments, defect reproduction, visual evidence, validation, and reviews. `docs/DEVELOPMENT.md` §§8–10 describe supported workflows and capability checks. Read nested instructions before working in their directories.
- `docs/PRODUCT.md` §22 owns performance commitments; `docs/ARCHITECTURE.md` §§8–9, 13, 16–19 describe rendering/state/persistence/process boundaries. Inspect only sections relevant to the chosen interaction.
- `src/renderer/App.tsx` subscribes to application state with `useSyncExternalStore`; `src/application/editor-store.ts` and its collaborators own application transitions. Follow actual publication and invalidation paths.
- `src/renderer/NodeInput.tsx` includes textarea and contenteditable paths. `use-node-input-bindings.ts`, `caret-projection-state.ts`, and `editor-dom.ts` govern input and caret mechanics. Plain/rich transitions deserve separate observation when relevant.
- `src/renderer/NodeList.tsx`, `node-list-layout.ts`, and `list-window.ts` lead to windowing and measured geometry. `AgendaView.tsx`, `agenda-caret-state.ts`, and `agenda-viewport-state.ts` lead to occurrence identity and caret/viewport handoffs. Follow save scheduling from `src/application/editor-save-scheduler.ts` into the current infrastructure and IPC owners.
- `perf/electron/` already covers typing, Vim, expansion, scrolling, Agenda scale/switching/saves, memory, and other interactions. `e2e/electron/` covers behavior and visual regressions; colocated unit/property tests cover rules and state transitions. Inspect assertions before declaring a gap.

## Reuse the harness, understand its endpoints

`perf/electron/fixtures.ts` provides synthetic seeds, isolated profiles, visible Electron launch, and owned teardown. `config/testing/perf.config.ts` owns execution configuration; `perf/results.ts` owns result recording and baseline comparison. Read `perf/AGENTS.md` and `perf/electron/AGENTS.md` before extending the suite. Keep existing metric definitions and budgets with their owners.

The typing spec records input-event-to-microtask and input-event-to-two-animation-frame timings. These do not include the entire physical-keyboard path or prove that correct pixels were presented. Its Playwright typing burst is not evidence of native held-key repeat, IME composition, or high-refresh behavior. Supplement measurements only where the question requires it; do not silently relabel or compare different endpoints.

Select affected scenarios through `npm run test:perf -- <specs>`; a full Electron selection is `npm run test:perf -- --project=electron`. Without a project filter, the workflow also includes browser scenarios. Use supported host execution for Electron runs and keep performance runs serial and visible. Functional hidden-window tests do not replace visible evidence. Select validation by `docs/DEVELOPMENT.md` §9 and performance scope separately under workflow §10. Do not launch suites merely to inventory them.

Keep disposable probes and evidence in `.scratch/<task>/`, honoring existing fixture-owned profiles and required suite locations. Use Node.js/TypeScript if a missing capability warrants a probe. Preserve a reproducible baseline and evidence through uncommitted review or handoff; follow repository cleanup rules afterward.

Use `WORKING_PLAN.md` as the automatically maintained checkpoint entry point, preserving any unrelated task content. Identify the active investigation, link `.agents/skills/improve-perceived-performance/SKILL.md`, and state its next authorized action so repository bootstrap can recover it from an ordinary "continue". Follow workflow §§8 and 12 for an indexed initiative plan when applicable; link existing evidence instead of maintaining duplicate logs. Keep the checkpoint and evidence available while the investigation is paused, including when all changes remain uncommitted.

## Primary references for instrument selection

Consult only when needed, checking compatibility with the installed versions:

- [Interaction latency decomposition](https://web.dev/articles/optimize-inp): input delay, processing, and presentation; web thresholds are not Tree's acceptance criteria.
- [React Profiler](https://react.dev/reference/react/Profiler): rendering measurements and profiling-build overhead.
- [Electron contentTracing](https://www.electronjs.org/docs/latest/api/content-tracing): Chromium tracing across processes; discover supported categories and output format rather than assuming them.
- [Agent Skills specification](https://agentskills.io/specification): packaging and metadata when maintaining this skill.
