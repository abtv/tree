# Worker-Owned E2E Application Reuse

Status: Accepted
Date: 2026-10-11

## Context

Fresh Electron launches dominate the hidden E2E suite's time. The bounded E2E-3 experiment reused a worker-owned application for navigation and Tab structure while preserving both editing modes and every existing launch guard. Same-window reload reduced common-case summed time by about three quarters at six workers; destroying and recreating the window saved less. The completed bounded rollout covers navigation and eligible Tab structure, Vim text-editing and Vim navigation/selection cases. Development §8 records full-suite measurements and their host-variance and memory limits: two matched six-worker pairs at runtime commit `3dff3bf` passed the same 773 cases per run and reduced wall time by 8.2–9.4%, with 125 fewer launches per adopted run.

The Product Owner approved D1 on this date. Fixture hardening and all four bounded adoption areas completed their validation and independent review before full-suite closure. The fixture remains fresh by default, with explicit eligibility opt-ins for adopted cases. ADR 0012 stays accepted: worker ownership, shortcut isolation, clipboard locking, hidden/visible execution and the prohibition on concurrent Playwright invocations still apply.

## Decision

Adopt same-window reuse through explicit per-spec or per-group eligibility, keeping fresh-process execution as the global fixture default. Hidden eligible editing tests may share one Electron application owned by their Playwright worker. Visible runs and fresh controls use ordinary per-test processes. A reviewed owner must establish the complete reset contract before opting in; proximity to an eligible test is not evidence of eligibility.

The test-owned fixture disposes the old renderer by main-process navigation to a blank document, acknowledges navigation in Playwright, drains tracked original production IPC operations and any surviving native-state debounce, then removes only the worker data directory. The next test seeds its document and editing preference before loading the production renderer. Capture the expected seed before renderer loading and verify document, location/expansion, selected-editor focus, initial mode, empty undo/redo and native window state. Preserve save/operation-error observation, clipboard ownership/release, canonical scale, scrollbars, shortcut and hidden-window assertions. Close an owned process before deleting files after a failed reset; worker teardown remains bounded.

No reset hook, test channel or test branch enters the production bundle. IPC instrumentation remains in the test-owned entry and invokes original production handlers. Clipboard state is not cleared outside the existing ownership lock. Resets deliberately discard pending renderer edits; they do not substitute for persistence or quit-flush coverage.

Keep startup, persistence/recovery, quit/shutdown, native-shortcut, window-lifecycle and appearance-flash tests on fresh processes. Also keep relaunch tests, custom launch configuration, clocks, browser-context initialization scripts, replaced IPC handlers and retained main-process instrumentation fresh unless a separate owner proves and reviews their reset. The first adoption contract accepts only top-level, collapsed seeds; nested or expanded seeds remain fresh until their contract is explicitly extended and verified.

## Consequences

Process identity, Chromium session caches, main-process listeners and file-service generation state survive renderer replacement. Reuse is weaker isolation than a fresh process. Reset/recovery regressions and repeated-cycle renderer/process-memory measurements must precede broader adoption; investigate sustained growth against warm-up and fresh controls rather than inventing a time or memory budget. The duration-budget decision remains deferred.

The rollout completed fixture hardening, navigation/Tab structure, then independently reviewed Vim text and navigation/selection areas. Every area inventoried launch paths and state mutations, preserved existing mode coverage, compared fresh controls and completed High Risk validation and independent review. Full-suite timing pairs closed the bounded rollout. Future adoption requires the same evidence; the two-file prototype does not predict whole-suite savings. Closure memory probes showed stable retained renderer heap and listener counts, with shared renderer working sets above fresh controls. Native memory can survive reload; finite measurements do not prove indefinite bounds.

This refines the per-test process-isolation model for opted-in editing coverage without changing the application's product behavior, domain model, persistence model, security channels or performance-suite execution. Development §8 owns supported commands, current eligibility and completed rollout evidence. No authorized rollout tasks remain; editing-mode reductions were declined and duration budgets/reporting remain deferred.
