# Initiative: Rendered-text and typed-input fidelity tests

## Objective

Close the test gap that let two user-visible defects through on 2026-10-04: a typed `://` was drawn by the bundled font as a ligature (`http: /l`) while the DOM text was correct, and typing a URL by hand had no end-to-end coverage. Existing tests asserted DOM values and computed styles, and screenshot baselines had captured the defect. The initiative adds tests that compare what is drawn and what is typed against what is stored, and a rule that makes baseline review concrete.

## Authorization

The Product Owner authorized this objective in conversation on 2026-10-04 ("давай", after the proposal of tasks T1-T3). The three tasks below are authorized. No product behavior changes: T1 and T2 only add tests; T3 changes only `docs/DEVELOPMENT.md`. Reserved for the Product Owner: changing typography or any product requirement that a failing new test reveals (record it, do not fix it silently); adding a native-keyboard test tool.

## Sources

- `docs/PRODUCT.md` §13 (typed and pasted hyperlinks), §20.3 (typography, ligatures disabled).
- `docs/DEVELOPMENT.md` §9 (validation tiers, visual-regression workflow), `AGENTS.md` §9 (visual-regression workflow, defect-first).
- Commits `c085f1e` (ligature fix) and `8633a71` (typed hyperlinks).

## Tasks

| ID | Outcome | Depends on | Acceptance evidence | Status |
| --- | --- | --- | --- | --- |
| T1 | A real-renderer test proves that node text is drawn character by character: for a corpus of risky strings, the pixels of the node equal the pixels of a reference where every character is drawn separately. | none | The test passes on `main` and fails when `font-variant-ligatures: none` is removed from `src/renderer/styles.css` (revert and observe). | Ready |
| T2 | A typed-input corpus test types realistic strings by key press into an empty node and into the middle of existing text, in both editing modes, and checks text, focus, caret position, and a screenshot. | none | Test passes; each corpus string asserts the exact final text and that the caret follows the last typed character. | Planned |
| T3 | `docs/DEVELOPMENT.md` §9 states the concrete question for reviewing any new or updated screenshot baseline, and the handoff rule "which test level should have caught this defect and why it did not". | none | `npm run check:docs` passes; text names the question and the handoff line. | Planned |

### T1 details

- Files: new `e2e/text-fidelity.spec.ts`; possibly a small helper in `e2e/fixtures.ts`.
- Corpus: `://`, `->`, `=>`, `!=`, `==`, `<=`, `>=`, `//`, `///`, `::`, `...`, `www.`, `http://localhost:8080`, `<!--`, `|>`, `<>`, `&&`, `||`, `~=`, `#{`, `0xFF`, `x*y`.
- Method: render each string once as a node's text and once as a reference whose characters are each wrapped in an inline-block span so the font cannot shape across characters; both use the node's computed font properties. Compare element screenshots (`Buffer.equals`) after fixing the same box size, or compare per-character ink rows. Run in both editing modes and in light and dark appearance only if the result differs by appearance.
- Validation tier: `docs/DEVELOPMENT.md` §9 tier for e2e/test-only changes (`npx playwright test e2e/text-fidelity.spec.ts`, then `npm run check`).
- Defect-first check: remove the ligature rule locally, confirm the test fails, restore it.

### T2 details

- Files: new `e2e/typed-input.spec.ts`, existing `e2e/fixtures.ts` helpers only if needed.
- Corpus: URLs with paths and queries, a URL before and after plain words, punctuation-heavy lines, text with digits, a URL typed before an existing word, and a URL followed by Enter and more typing.
- Validation tier: same as T1.

### T3 details

- File: `docs/DEVELOPMENT.md` §9 only (and `AGENTS.md` §12 handoff list only if the Product Owner agrees; do not edit `AGENTS.md` without that approval).
- Validation tier: `npm run check:docs`.

## Next task

T1.

## Decisions and findings

- Native macOS keyboard input (IME, autocorrect, key repeat) is not reproducible by Playwright; it stays a manual check in `npm run dev` after input changes.
- Whether the ligature defect existed since the font was bundled was not verified.

## Resume prompt

"Continue the rendered-text fidelity initiative (`plans/test-fidelity.md`): take the next Ready task."
