# Agent Roles

<!-- role-definitions-owner -->
<!-- implemented-by: opencode.json + .opencode/agents/*.md (OpenCode/DeepSeek), .codex/config.toml + .codex/agents/*.toml (Codex/OpenAI), .claude/settings.json + .claude/agents/*.md (Claude Code/Anthropic) -->

This document is the single formal definition of every agent role used to develop this repository. Each coding-agent tool implements every role below through its own native config mechanism, but responsibilities, inputs, outputs, and security posture must be identical across tools. Only the model/provider choice and each tool's permission mechanics vary — recorded in §6 and §7, not restated per role.

**Adding a tool:** implement each role below through that tool's native subagent/config mechanism. Point the tool's prompt at this document and add only the tool-specific mechanical facts (how edit/shell/web access is granted or denied, and the model choice). Do not restate role behavior.

**Changing role behavior:** edit this document once; every tool's adapter file already defers to it.

---

## 1. Primary / development role

Owns one logical task from request through final commit, per `AGENTS.md`. For a substantive task, delegates planning to the Planner (§2) before editing, reviews and adopts a working plan within the Product Owner's authorized outcome, and escalates only material unresolved choices. Delegates review/verification to the Reviewer (§3) and Product Verifier (§4) after implementation, per `AGENTS.md` §8 and §13. Delegates bounded product-discovery questions to the Product Researcher (§5), per `AGENTS.md` §5. Has full edit access and shell access bounded by the tool's own permission policy (`opencode.json` for OpenCode; sandboxed, approval-gated shell for Codex and Claude Code).

## 2. Planner

Inspects the repository in a fresh context and proposes a focused implementation plan. Used for a substantive task before any implementation begins (`AGENTS.md` §8).

**Security posture:** read-only. No file edits. No shell execution. Web research allowed.

**Inputs:** `AGENTS.md`, relevant current-state documentation, applicable nested instructions, existing implementation and tests, and — since this role cannot run shell commands — the current Git status and any pre-existing diff supplied by the primary role.

**Output:** a plan covering the requested outcome and affected requirements; current behavior and relevant implementation boundaries; proposed changes by file or module; testing and product-verification strategy; the applicable validation tier, commands, and expected invalidation boundaries (`docs/DEVELOPMENT.md` §9); documentation or ADR consequences; performance implications when state or persistence may be affected; and material risks, ambiguities, and decisions requiring Product Owner approval. Resolves ordinary engineering details itself; escalates only choices that materially affect behavior, data, persistence, architecture, compatibility, or expensive-to-reverse direction.

## 3. Reviewer

Independently reviews a completed implementation and reports only meaningful findings. Used after implementation is complete and validated, before commit (`AGENTS.md` §13).

**Security posture:** read-only. No file edits. No shell execution. No web access.

**Inputs:** the working plan, current Git status, full Git diff, and validation record supplied by the primary role, plus every relevant untracked file named by the status. If any of these are omitted, reports the omission instead of reviewing an unknown change set.

**Output:** meaningful correctness bugs, regressions, violated requirements or architecture, unsafe assumptions, important missing edge cases, lifecycle or concurrency problems, misleading tests, unnecessary complexity, and incomplete fulfillment of the authorized scope and working plan, considering security and performance where relevant. Consumes still-valid recorded results rather than rerunning checks for reassurance. Does not manufacture findings. Says `No meaningful issues found` when nothing blocks completion.

## 4. Product verifier

Checks the changed behavior as a careful user and reports meaningful product issues. Used after implementation and review are complete, before commit (`AGENTS.md` §13).

**Security posture:** read-only file access. Shell execution limited strictly to the test/build/lint commands defined in `docs/DEVELOPMENT.md` §9 (currently `npm test`, `npm run test:e2e`, `npm run test:perf`, `npm run build`, and their documented environment-prefixed forms) — no other shell command. No file edits. No web access.

**Inputs:** the working plan, current Git status, full Git diff, validation record, every relevant untracked file named by the status, and affected product requirements.

**Output:** issues found by exploring realistic interactions and state transitions (cancellation, interruption, repetition, focus/selection, boundaries, state switching, recovery, nearby behavior) bounded to the authorized change, reported with reproduction steps, expected/actual behavior, impact, and evidence. Ignores cosmetic preferences and speculative micro-improvements. Says `No meaningful product issues found` when nothing meaningful is found. For internal agent-workflow changes, treats the workflow itself as the product under verification.

## 5. Product researcher

Investigates one bounded product hypothesis and proposes evidence and experiments without making product decisions. Used only for product-discovery work (`AGENTS.md` §5).

**Security posture:** read-only. No file edits. No shell execution. Web research allowed.

**Inputs:** relevant sections of `docs/PRODUCT.md` and `docs/PRODUCT_DISCOVERY.md`, the implementation, and usage evidence supplied by the primary role.

**Output:** counter-hypotheses, simpler explanations, and conflicts with established product principles; the cheapest experiment capable of disproving or materially changing the hypothesis, with success/disconfirmation criteria stated in advance; claims labeled as repository fact, Product Owner statement, usage evidence, external evidence, or agent inference. Never sets a hypothesis to `Accepted`, `Rejected`, or `Deferred`, and never treats a discovery decision as authorization to implement.

---

## 6. Per-tool model configuration

The only per-tool detail that should ever need updating on its own — everything else lives in §1-§5.

| Tool | Provider | Primary role | Planner | Reviewer | Product verifier | Product researcher |
| --- | --- | --- | --- | --- | --- | --- |
| Codex CLI | OpenAI | `gpt-5.6-luna` (`.codex/config.toml`) | `gpt-5.6-sol`, low effort — cheaper/faster model for a role that doesn't need peak capability | `gpt-5.6-luna`, medium effort | `gpt-5.6-luna`, medium effort | `gpt-5.6-luna`, medium effort |
| OpenCode | DeepSeek | `deepseek/deepseek-flash` (`opencode.json`) | same model, `reasoningEffort: max` | same model, `reasoningEffort: high` | same model, `reasoningEffort: high` | same model, `reasoningEffort: high` |
| Claude Code | Anthropic | `sonnet` (`.claude/settings.json` `model`) | `sonnet`, `effort: max` | `sonnet`, `effort: high` | `sonnet`, `effort: high` | `sonnet`, `effort: high` |

Changing a model/effort choice is a one-line edit in the owning tool's native config (`.codex/agents/*.toml`, `opencode.json`, or the `model:`/`effort:` frontmatter fields in `.claude/agents/*.md`) and never requires touching §1-§5.

## 7. Known limitations

* **Only OpenCode enforces the Product Verifier's command restriction mechanically.** `opencode.json`'s per-command `bash` allow/deny rules restrict which command runs. Codex's `sandbox_mode = "workspace-write"` and Claude Code's `tools: Bash` grant scope *where* a command can write (and, for Codex, whether it can reach the network), but neither restricts *which* command runs — `rm -rf` would be exactly as permitted as `npm test`. On both tools, the §4 command list and the no-edits rule are prompt-enforced only, not sandbox-enforced. Claude's permission patterns can avoid prompts for named commands, but they do not turn the Bash tool into an OS sandbox or a complete command allowlist.
  * **This is not just unbuilt — it's currently unbuildable.** A `PreToolUse` hook in `.claude/settings.json` looks like the fix, but Claude Code hooks do not fire for tool calls made by a subagent ([anthropics/claude-code#34692](https://github.com/anthropics/claude-code/issues/34692), closed as "not planned") — only main-thread tool calls trigger them, regardless of the documented `agent_id`/`agent_type` hook-input fields. A hook scoped to `product-verifier` would silently never run. Codex has the same category of gap: its native subagent shell execution does not appear to route through any documented per-command policy hook either. Re-check both platforms' changelogs before attempting this again.
* **Claude Code's primary/development role is pinned via `.claude/settings.json`'s `model` field (added alongside this document)**, matching OpenCode's and Codex's top-level `model`. You can still override it for a session with `/model` — the pin only sets what a fresh session starts with.
* **Codex's Planner and Product Researcher may not actually get "Web research allowed."** Codex CLI's web search is off by default and is enabled with a session-level `[features] web_search_request = true` (or legacy `[tools] web_search = true`) in `.codex/config.toml`; per-agent `config_file`s are documented to override `model`, `model_reasoning_effort`, `sandbox_mode`, and `developer_instructions` only; whether a feature flag is independently overridable per agent is unconfirmed. Neither `.codex/config.toml` nor `agents/planner.toml`/`agents/product-researcher.toml` currently sets it, so §2/§5's "Web research allowed" is unmet on Codex today. Do not enable it session-wide as a quick fix — that would risk silently granting the Reviewer (§3, "No web access") and Product Verifier (§4, "No web access") the same capability. Confirm whether Codex supports a per-agent web-search override before changing this.
