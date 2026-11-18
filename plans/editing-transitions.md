# Editing transitions

The owner authorized all concrete repairs from the state-machine audit of `f32d48d` through `ada91e0`, including validation and commits in Codex. The known npm dependency advisory is deferred. The implementation uses the existing editor, browser storage and Electron protocols. Deployment, dependencies, storage formats and unrelated changes are outside this batch.

## Tasks

| Task | Outcome, owners and acceptance | Validation | Status |
| --- | --- | --- | --- |
| T1 | Browser saving. In `src/web/services.ts` and the application editor store, protect accepted clipboard edits and in-flight head writes. Native tab close during image paste or Undo warns. Dismissing allows the latest state to save and reopen. Completed work closes normally. | High Risk. Browser service and store tests, real Chrome paste, native close and reopen. | Done |
| T2 | Local Find and editing ownership. In `editor-search.ts`, the renderer's search, Vim session and input handlers, finish actual jumps independently of a recount. New manual input, selection or composition supersedes pending jumps. No-match repeat retains usable focus. A buffered Replace text click continues at the clicked node. Native Select All matches the shortcut. | High Risk. Application and renderer tests, Electron Agenda, search, pointer and menu regressions, focused search performance. | Done |
| T3 | Desktop shutdown. In renderer lifecycle, Electron quit handlers and modal command routing, accept edits during saving, seal the successful request before acknowledgement, reopen on failure. The save-failure alert owns focus and commands above About or Search, with Cancel restoring the previous surface. | High Risk. Quit contract tests, Electron quit, recovery, modal-stack and visible focus checks. | Done |
| T4 | Desktop startup. In renderer entry and preference bindings, a newer Vim or Always on Top selection wins over the initial read, including before mount. Follow the existing appearance behavior. | High Risk. Startup/renderer tests and real menu/reload checks. | Done |

Tasks run in the order shown. Each task retains its own commit. Budget covers these four working tasks, their required validations and in-scope review corrections. Use the two-attempt recovery rule for a repeated blocker. Reserve one separate plan-retirement commit after final acceptance. Existing product requirements settle these repairs. A change to storage compatibility, quit semantics beyond this audit, or a new capability remains an owner decision.

## Owner involvement

The four repairs were reproduced and checked with isolated fixtures. Independent implementation review and product verification are complete. The initiative is **Awaiting owner acceptance**.

The task table contains the full audit list. In the browser, dismiss the close warning during an image paste and let the save finish. Reopen to see the image. In Agenda, type in Vim Replace while a Find result is pending and check that the input stays with the active editor. On desktop, open Find after repeated save failures have locked editing. Attempt to quit, then cancel the alert to return to the unfinished query. The native startup tests delay an earlier settings reply and check the first keystroke and the actual window pin after a newer menu selection. Product sources are [browser behavior and native conventions](../docs/PRODUCT.md#14-browser-static-hosting-checkpoint), [persistence](../docs/PRODUCT.md#16-persistence), and [Vim editing](../docs/PRODUCT.md#202-vim-inspired-editing). The [development guide](../docs/DEVELOPMENT.md#risk-based-validation) owns validation.

Next task: The owner accepts the delivered result and confirms that the review list is complete.

Continuation prompt: After explicit acceptance and confirmation that the review list is complete, retire this plan and its index entry in the reserved closure commit.
