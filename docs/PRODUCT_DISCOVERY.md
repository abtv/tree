# Product Discovery

> This document is non-normative. It records unapproved product ideas, hypotheses, experiments, evidence, and decisions. Nothing here is an implementation requirement. Only behavior approved by the Product Owner and incorporated into `docs/PRODUCT.md` may be planned or implemented.

## 1. Purpose and Ownership

This document is the durable research notebook for questions that may influence the product. It is not a prioritized feature backlog and does not imply delivery commitments, estimates, or implementation assignments.

The Product Owner decides whether a product direction is accepted, rejected, or deferred. Agents may investigate questions, challenge hypotheses, organize supplied evidence, identify conflicts with product principles, and propose experiments. Agents must not invent the Product Owner's position or convert a discovery conclusion into a requirement.

Every claim should be labeled by its basis when that basis is not self-evident:

- **Repository fact:** directly supported by current code or documentation.
- **Product Owner statement:** stated by the Product Owner, with their meaning preserved.
- **Usage evidence:** an observed interaction or result, including its date and context.
- **External evidence:** information from outside the repository, with a dated source.
- **Agent inference:** analysis that has not been established as fact.

## 2. Statuses

- `Idea` — captured but not yet investigated.
- `Exploring` — the problem and competing explanations are being examined.
- `Experimenting` — an agreed experiment is collecting evidence.
- `Accepted` — the Product Owner accepts the direction, but has not thereby authorized implementation.
- `Rejected` — the Product Owner has decided not to pursue the direction based on current evidence.
- `Deferred` — no current decision or experiment is warranted.

Only the Product Owner may set `Accepted`, `Rejected`, or `Deferred`. Accepting a direction does not authorize implementation. When the Product Owner requests a specific behavior, update `docs/PRODUCT.md` and follow the planning and development workflow in `AGENTS.md`. Ordinary implementation plans do not need separate approval; ask the Product Owner about material choices that remain unresolved.

## 3. Discovery Lifecycle

1. Capture the observation without prescribing a feature.
2. Frame a falsifiable hypothesis and plausible counter-hypotheses.
3. Identify conflicts with the product's established principles.
4. Choose the cheapest experiment capable of changing the decision.
5. State success and disconfirmation criteria before collecting evidence.
6. Record evidence separately from interpretation.
7. Ask the Product Owner to decide, defer, or request more evidence.
8. If a direction is accepted, propose the corresponding `docs/PRODUCT.md` change separately.

Experiments should prefer ordinary use and reversible prototypes over production implementation. Changing product code for an experiment requires a separate Product Owner request and the planning and development workflow in `AGENTS.md`.

## 4. Entry Template

Copy this template for a new discovery question:

```md
## PD-NNN: Short question or direction

Status: Idea

### Observation

Describe the observed problem or opportunity without assuming a solution.

### Hypothesis

State what is believed and why it would matter.

### Product Owner perspective

Record the Product Owner's position or `Pending`. Preserve disagreement explicitly.

### Counter-hypotheses and tradeoffs

List plausible alternative explanations, simpler responses, and conflicts with product principles.

### Experiment

Describe the cheapest useful way to test the hypothesis.

### Decision criteria

State what evidence would support, disconfirm, or leave the hypothesis unresolved.

### Evidence

Record dated repository facts, Product Owner statements, usage evidence, external evidence, and agent inference with their basis identified.

### Decision and rationale

Pending. Only the Product Owner decides. If accepted behavior is later specified, link the affected `docs/PRODUCT.md` section.
```

## 5. Active Questions

## PD-001: Retrieval across the hierarchy

Status: Exploring

### Observation

Repository fact: the application navigates and renders one level at a time. It has no application-level facility for retrieving a node from elsewhere in the hierarchy. Browser find is limited to rendered content, and wide levels may leave off-screen rows unmounted.

### Hypothesis

As personal notes accumulate, remembering that a note exists but not where it lives will become a frequent enough problem that hierarchy navigation alone is insufficient.

### Product Owner perspective

Pending.

### Counter-hypotheses and tradeoffs

- A stable, personally designed hierarchy may make retrieval sufficiently fast.
- A search interface could add visual or conceptual distraction.
- Better capture and organization conventions might address the problem without another interface.

### Experiment

During normal use, record each failed or noticeably slow retrieval attempt, what was remembered, where the note was located, and how it was eventually found. After enough real attempts to reveal a pattern, compare hierarchy navigation with a disposable, non-production retrieval prototype.

### Decision criteria

Support requires recurring retrieval failures that a focused search interaction resolves materially faster without exposing an expanded tree. Disconfirmation would be reliable hierarchy navigation with negligible retrieval friction.

### Evidence

- 2026-09-21 — Repository fact: `docs/PRODUCT.md` specifies one-level navigation and describes browser-find limitations for windowed sibling lists.
- 2026-09-21 — Agent inference: retrieval is likely to become more important as the document grows; real usage evidence is still required.

### Decision and rationale

Pending.

## PD-002: Keyboard-only sibling reordering

Status: Exploring

### Observation

Repository fact: ordinary editing and navigation are keyboard-first, while sibling reordering requires mouse drag-and-drop.

### Hypothesis

Keyboard sibling-reordering commands would reduce interruptions for a touch typist without weakening the one-level-at-a-time interaction model.

### Product Owner perspective

Pending.

### Counter-hypotheses and tradeoffs

- Reordering may happen too rarely to justify additional commands.
- Memorable, conflict-free shortcuts may be difficult to choose.
- The actual need may be moving notes between parents rather than reordering siblings.

### Experiment

During normal use, record every reordering attempt that requires leaving the keyboard, whether the desired move is within the current level or to another parent, and which command gesture felt natural at that moment.

### Decision criteria

Support requires repeated mouse transitions for sibling moves and a shortcut that remains memorable in use. A predominance of cross-parent moves would disconfirm sibling reordering as the main problem.

### Evidence

- 2026-09-21 — Product Owner statement: fast note-taking as a touch typist is important.
- 2026-09-21 — Repository fact: `docs/PRODUCT.md` defines drag-and-drop as the only sibling-reordering interaction.

### Decision and rationale

Pending.

## PD-003: Distraction-free behavior as an explicit principle

Status: Exploring

### Observation

Product Owner statement: the absence of animations is valued because it avoids distraction. Repository fact: current renderer styles define no animation or transition behavior, but `docs/PRODUCT.md` does not protect that characteristic explicitly.

### Hypothesis

Documenting immediate, non-animated interaction as a product principle would prevent future changes from accidentally weakening a defining quality of the application.

### Product Owner perspective

The absence of animations is important because it avoids distraction. The exact scope of a normative rule is pending.

### Counter-hypotheses and tradeoffs

- A blanket rule might prevent subtle feedback that improves comprehension or accessibility.
- The desired principle may be immediate interaction rather than a prohibition on every visual transition.
- Existing simplicity may be sufficient without a formal requirement.

### Experiment

Identify the interactions where motion could plausibly be introduced—navigation, creation, deletion, reordering, overlays, focus, and errors—and review whether any transition would provide information that cannot be communicated immediately.

### Decision criteria

Support requires a stable wording that protects focus and immediacy without forbidding necessary platform or accessibility behavior. If no likely change could violate the preference, a normative rule may be unnecessary.

### Evidence

- 2026-09-21 — Product Owner statement: the application's lack of animations is liked because there are no distractions.
- 2026-09-21 — Repository fact: no renderer animation, transition, keyframe, or smooth-scroll declarations were found during the initial review.

### Decision and rationale

Pending.

## PD-004: User-controlled export and backup

Status: Exploring

### Observation

Repository fact: the application automatically persists the document and retains recovery generations, but it provides no documented user-facing export, import, backup, or recovery workflow.

### Hypothesis

A personal note store needs a user-controlled way to preserve and leave with its data even when internal persistence is reliable.

### Product Owner perspective

Pending.

### Counter-hypotheses and tradeoffs

- Existing local files and retained generations may be sufficient for one person's use.
- A readable export and a lossless backup solve different problems and should not be conflated.
- Import, attachments, and restoration could create substantial complexity beyond the immediate need.

### Experiment

List the concrete recovery and portability scenarios that matter in personal use—machine replacement, accidental deletion, corruption, application abandonment, and reading notes elsewhere—then test which are already covered by current storage and ordinary system backup tools.

### Decision criteria

Support requires at least one important scenario that current persistence and system backups do not cover adequately. The experiment should determine whether the need is readable export, lossless backup and restore, or both before behavior is specified.

### Evidence

- 2026-09-21 — Repository fact: `docs/PRODUCT.md` specifies automatic persistence and retained generations but no user-facing data-portability workflow.
- 2026-09-21 — Agent inference: portability is commonly important for long-lived personal notes; the Product Owner's actual scenarios remain to be established.

### Decision and rationale

Pending.
