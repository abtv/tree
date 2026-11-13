---
name: improve-perceived-performance
description: Investigate and optimize perceived performance in Electron and React applications through reproducible interaction experiments. Use for keyboard lag, uneven frames, flicker, caret or scroll instability, and responsiveness under scale or background work; also supports broad performance investigations.
---

# Improve Perceived Performance

Optimize the time to **correct, stable, visible feedback** and the continuity of interaction. Render counts, CPU savings, and operation duration are explanatory evidence, not the outcome. A faster result that loses input, moves focus, flickers, or shifts the viewport is a regression.

## Scope and authority

Follow repository instructions and discover current implementation; assume neither an editor mechanism nor a state library. In Tree, read [the repository guide](references/tree.md) for entry points and existing measurement limitations. Elsewhere, discover equivalent owners and workflows.

Interpret the invocation's target, depth, and write boundary. Unless the user explicitly requests read-only analysis, investigation with this skill authorizes temporary, reversible code changes, diagnostic instrumentation, local builds, measurements, and relevant tests to validate hypotheses. Recommendations should draw on these experiments where feasible, not code inspection alone. An explicit optimization request additionally authorizes turning supported candidates into completed fixes within existing behavior. Do not repeatedly seek approval for these authorized steps. Preserve editing semantics, accessibility, data durability, and expected UX in any proposed or retained solution. Reserved product or architecture decisions still need approval. Use synthetic data and isolated profiles, preserve unrelated changes, and never reuse a personal profile. Do not run CI, commit, or push without explicit authorization for that action; invocation alone is not authorization. These experiment permissions and the commit gate define this workflow's scope in Tree.

Prefer existing Node.js/TypeScript tooling. Add a probe only to answer a concrete question the existing tools cannot answer. Do not introduce Python, dependencies, architectural rewrites, or permanent production instrumentation merely to facilitate investigation. Respect permission denials; report missing capabilities and continue independent work.

## Build an interaction model

Trace representative user actions through input delivery, handlers, state publication/subscriptions, React render/commit/effects, DOM changes, style/layout, paint/compositing, and relevant IPC/background work. Identify caret, selection, focus, scroll, and persistence owners. Inspect real tests and their launch/input mechanisms, not just test names.

Choose scenarios by user frequency, perceived disruption, architectural uncertainty, and scaling risk. Distinguish first use from warm use and isolated actions from sustained bursts. For an outliner, useful starting points include typing/navigation, structural edits with undo/redo, branch expansion, and Tree/Agenda transitions while saves run. These are candidates, not a compulsory matrix. Include boundary transitions and interrupted/reversed actions where owners hand off state.

Keep a small evidence record: scenario and exact input sequence, expected visual/semantic result, build/ref and diff, fixture shape/seed, environment, measurement endpoints, raw artifact locations, hypotheses and outcomes. Record covered, deferred, and blocked areas so a broad investigation cannot silently become one successful micro-optimization.

## Establish an observable baseline

Use a production-like build in a visible, foreground Electron window. Record platform, Electron/Chromium/React versions, display refresh rate and scale, viewport, power/load conditions, and instrumentation. Keep these comparable. Separate cold launch/cache behavior from warm interaction; do not erase a first-use defect through warmup.

Vary relevant workload shape as well as size: deep/wide trees, long wrapped rows, expanded versus mounted rows, repeated Agenda occurrences, and realistic history/background activity. Reuse deterministic fixtures. Assert the intended field has focus, the input really occurred, and document/selection outcomes are correct. Synthetic DOM events or direct store calls cannot prove native keyboard responsiveness; automation delivery and operating-system key repeat have different limits.

Define endpoints before measuring: input arrival, first meaningful feedback, correct stable state, and completion of deferred work. Measure queueing, processing, and presentation separately when possible. Track typical latency, tails and stalls, frame-interval distribution, and the duration/frequency of incorrect intermediate states as relevant. Include sample counts and run-to-run variation; a few samples cannot establish a reliable p95. Record burst delivery rate and backlog: waiting for each action to settle can hide overload.

## Select evidence that can falsify the hypothesis

Start with low-overhead timings and visual observation, then capture a targeted trace around an anomalous sequence. Escalate according to the unexplained portion of the pipeline:

| Evidence | Useful question and limitation |
| --- | --- |
| Event timing / performance marks | Where does latency accumulate? Feature-detect support, verify clock origins and input coverage; in-handler marks omit earlier queueing. INP is a diagnostic concept, not a desktop typing acceptance target. |
| React profiling / subscription instrumentation | Which updates and effects cause work? Render duration/count does not measure presentation. Profiling builds and development Strict Mode alter behavior; confirm results without profiling. |
| Chromium performance trace / Electron tracing | Are scripting, GC, style/layout, raster/compositor work, IPC or main-process stalls involved? Correlate processes using shared trace timing or explicit correlation, not unrelated timestamps. A renderer CPU profile alone cannot settle cross-process causes. |
| Frame sequence plus focus/selection/geometry observations | Does feedback remain correct throughout the transition? Inspect real renderer captures at normal speed and frame by frame. Capture rate can miss single-frame defects; geometry and DOM state alone cannot prove presented pixels. |
| Heap/allocation and process-memory observations | Does repeated use retain resources or trigger GC stalls? Distinguish retained growth from transient allocations, caches, and other processes; forced GC changes the workload. |

One or two `requestAnimationFrame` callbacks are scheduling proxies, not proof of physical presentation. State their endpoints honestly and correlate with rendering evidence. Similarly, a clean final screenshot, low CLS, no long tasks, or high average FPS does not exclude transient jumps or uneven delivery. Evaluate frame intervals against the actual refresh rate; do not assume a universal 16.7 ms budget. If high-refresh hardware or adequate capture is unavailable, limit the claim.

For subtle defects, follow the transition beyond its first correct frame: delayed effects, measurements, saves, image/font readiness, or stale asynchronous results can undo it. Inspect caret/selection continuity, scroll anchors and row identity through mounting, view switching, rapid reversals, and subsequent input. Investigate only relevant mechanisms, but do not stop at a clean JavaScript profile when visual evidence disagrees.

## Experiment and decide

For each promising hypothesis, state the suspected mechanism, predicted observable change, disconfirming evidence, and smallest isolating experiment. Diagnostic ablations may locate a cost but are not acceptable fixes when they disable required behavior. Change one causal factor at a time; compare the same fixture and sequence against the original baseline.

Repeat independent runs with interleaved or counterbalanced baseline/candidate order when drift matters. Separate heavy trace/video captures from lightweight comparative runs and check instrumentation overhead. Report absolute differences, variability, and outliers with plausible causes. Do not discard inconvenient runs or claim improvements within noise. Increase repetitions or improve the probe when uncertainty could change the decision.

Recommend or retain a candidate as an improvement only when evidence supports a user-relevant benefit without correctness or visual regression. A reproducibly eliminated caret jump can be valuable with unchanged timing. Conversely, fewer renders alone is insufficient. Check whether deferred work merely moved the stall to the next keystroke, save, view change, or shutdown; inspect CPU, writes and memory tradeoffs at relevant scales. Recheck combined candidates against the original baseline before claiming their combined benefit.

Undo only your unsuccessful experiment's edits, preserving unrelated work; do not reset the worktree or rewrite history. For an investigation-only delivery, preserve useful candidate diffs and reproduction evidence in the task's temporary location, then undo your experimental source changes unless the user requested that they remain for inspection. Report concrete recommended changes, measured benefits, tradeoffs, and remaining implementation or validation work; do not present prototypes as completed fixes. A session pause is not delivery: preserve unfinished experiments under the continuation rules below.

When optimization is authorized, remove diagnostic instrumentation from retained fixes, reuse adequate tests, and add the smallest reliable regression coverage for demonstrated failures. Complete repository-required validation and independent reviews for the actual change scope. In either mode, validate visual claims in real Electron and label unavailable verification as blocked, not passed.

## Pause and resume across sessions

Save continuation state autonomously, without asking the user and without committing. Make broad or deep investigations resumable from the start. For focused work, create a checkpoint as soon as losing the current context would require repeating meaningful work. Use the repository's working-plan convention as a discoverable entry point, linking this skill and the existing evidence record rather than copying them. Update it after each experiment, material decision or candidate change, before a long-running operation, and before ending an unfinished session. Do not wait for a pause request or rely on a final chat summary; an abrupt interruption can recover only the last saved checkpoint.

Keep the checkpoint compact: authorized objective and write boundary; user decisions and no-commit restrictions; baseline/candidate identities including uncommitted changes; retained, rejected and unfinished experiments; valid checks and artifact paths; uncovered areas and blockers; and the exact next action with its expected evidence. Distinguish provisional edits and diagnostic instrumentation from validated fixes. Record any time guidance and approximate effort already spent; a new session does not silently restart the budget.

When the user asks to pause, stop starting work and save the checkpoint promptly. Do not finish the campaign or run broad validation first. Record interrupted commands as incomplete, preserve needed evidence before fixture cleanup can remove it, and close task-owned processes through supported cleanup. If a process remains active, record its ownership and status; verify identity again before later cleanup. Preserve the worktree and linked artifacts without committing, resetting, or retiring them. Return a short resume instruction and the checkpoint location.

An ordinary "continue" in a new session is sufficient to resume an identifiable unfinished investigation; do not require the user to name this skill, provide a checkpoint path, reconstruct context, or renew existing authorization. Discover the checkpoint through repository bootstrap, read it, then reconcile it with Git state and available artifacts. Resume the recorded next action within existing authorization. Ask for a task selector only when multiple unfinished tasks make the intended continuation genuinely ambiguous. Reuse valid results; rerun only checks invalidated by changed inputs, environment, or missing evidence. Do not repeat discovery or rejected experiments merely because the session is new. Recheck session-dependent capabilities when needed and report any missing handoff data honestly. Continuation assumes the same working directory and retained local artifacts; a fresh clone alone cannot recover uncommitted work or ignored evidence.

## Depth, stopping, and delivery

There is no built-in duration or finding quota. Accept focused, broad, or deep scope and an optional target time budget. Treat time as guidance for prioritization within execution limits, not a minimum runtime or permission to exceed limits. Reserve room for validation and cleanup; when constrained, stop new experiments and preserve an honest partial handoff.

In deep investigations, revisit coverage after each improvement. Pursue remaining high-value hypotheses, unexplained tails, state handoffs and visual anomalies; do not stop because the first fix worked. Stop when important interactions have adequate evidence, promising hypotheses are resolved or explicitly bounded, measurements support conclusions, and remaining experiments have low expected value. If initial results are inconclusive, change the observable, workload or instrument before concluding there is no issue.

Report retained improvements and rejected hypotheses, before/after evidence and its limits, correctness/visual checks, tradeoffs, unresolved issues, uncovered areas and why the run stopped. Distinguish measured facts, visual observations, inference and unverified claims. Keep exact commands and raw evidence in the repository's temporary task location; preserve durable conclusions in their owning documents when authorized. Leave changes uncommitted unless explicitly authorized otherwise.
