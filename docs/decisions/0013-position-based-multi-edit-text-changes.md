# Position-Based Multi-Edit Text Changes

Status: Accepted
Date: 2026-09-26

## Context

Node text carries hyperlink ranges as offsets into that text, so every text edit must restate those offsets. The existing entry point, `replaceLinkedText`, delegates to `reconcileLinkTextEdit`, which recovers the changed region by diffing the text before and after: it scans a common prefix and a common suffix and treats everything between them as replaced. That is the right model for its original caller, a native `contenteditable` mutation, where the application learns only the resulting string and has to infer what changed.

A diff can express only one contiguous changed region. Vim-surround commands change two places at once — they add, remove, or replace a delimiter at each end of a range while leaving the text between them untouched. Routing such a command through a single diffing edit collapses both ends into one region spanning the whole range, so every hyperlink inside the range is treated as rewritten and dropped. Wrapping the entire text of a node is the worst case, because there is then no common prefix or suffix at all and the inferred region covers everything.

Splitting the command into two successive single-region edits would restate the offsets correctly but would also produce two history entries, so a single undo would leave the text half-surrounded.

## Decision

Edits that touch more than one position are expressed as an ordered list of disjoint edits and applied as one change, through `replaceLinkedTextRanges` in the domain and `EditorStore.replaceTextRanges` in the application layer.

Because the caller states the positions, no inference is needed: link offsets are remapped by position rather than recovered from a diff. A link between two edits keeps its text and moves by the cumulative length change ahead of it; a link that an edit actually overlaps or splits is dropped. The two ends of a link shift by different amounts, since a link ending exactly where text is inserted must not absorb the insertion while a link starting there must move behind it.

`reconcileLinkTextEdit` and `replaceLinkedText` are left unchanged. They keep serving the case they were built for, where the application sees only the resulting string.

## Consequences

- A command that edits several positions at once is one undoable change, and hyperlinks inside the affected span survive with correct offsets.
- Callers must supply sorted, non-overlapping edits. Overlapping edits are rejected and leave the text unchanged rather than producing a partially applied result.
- The codebase now has two link-preserving edit paths with different contracts. Choose by what the caller knows: `replaceTextRange` when only the resulting text is available, `replaceTextRanges` when the edit positions are known up front.
- Future multi-point text commands, such as a substitute across several matches in one node, have an existing primitive and do not need to fall back to repeated single edits.
