# Status Bar and Command Panel

#### 20.2.7 Mode Indicator and Status Bar

* A persistent indicator displays `INSERT`, `REPLACE`, `NORMAL`, `VISUAL`, or `VISUAL NODE`.
* The indicator sits at the right end of a status bar fixed at the bottom of the window, immediately to the left of the always-on-top pin toggle (§2.2). It remains visible while the command input or feedback occupies the left side (§20.2.28).
* The indicator is not editable text, so the pointer over it shows the default arrow cursor (§20).
* The content scrolls above the status bar, which never covers it, and the scrollbar ends where the status bar begins.
* Operation status messages, including save failures, image recognition, summarization, export/import, browser storage, offline readiness and folder backup, appear in the bottom status bar. Messages share one row with the controls on the right; the ordinary bar height stays 27px when they fit. Persistent save, operation and backup failures remain visible alongside other operations and while the command panel is open. Messages and actions may wrap when space is insufficient, increasing the bar height; the content and popups remain above it. Confirmation dialogs retain their existing behavior. App update feedback follows the priority rules of §26.

#### 20.2.28 Command Panel

`Cmd+Shift+P` opens the command panel in Tree or Agenda in standard editing and every Vim mode. With Vim editing enabled, `:` also opens it in Normal mode; in other modes `:` retains its ordinary key behavior. Opening discards any pending count or unfinished command, preserving the editing mode, selection and edit session.

Opening also dismisses the current five-second export-success notice (§24.3, §25.2). Closing the panel does not restore it. Archive progress and results that require acknowledgement, including errors and missing-image warnings, remain visible under §20.2.7. Image-recognition feedback follows §15.1.

`Escape`, `Backspace` with empty input, loss of focus, window deactivation, or a click outside close it without running a command. Closing restores the previous editor focus, node, mode and selection, except when the selected command defines a different result. `toggle-vim-mode` uses the caret behavior in §20.2.3. Modal dialogs and composition retain their own input; neither opening key interrupts them. `Cmd+P` continues to toggle Agenda (§23).

* The status bar's left side becomes an input line starting with `:` and the typed text.
* At narrow widths, status messages wrap above the command controls as needed to keep the input visible and editable alongside the count and mode indicator.
* Its right end shows `<matching> of <total>`, then the persistent mode indicator and pin toggle.
* Command feedback also occupies the left side without hiding the mode indicator.
* Long feedback truncates to leave the mode and toggles visible.
* A full-width panel directly above the status bar overlays the document without moving it or changing its scroll position.
* Its height follows the number of rows, up to eight; further rows scroll within the panel.
* Each row shows its name, a short description in secondary text color, a check mark when active, and a shortcut label when available.
* The selected row uses the shared selection highlight pair in each appearance.
* Opening and closing have no animation (§20.4).

Input is case-sensitive; leading and trailing spaces are ignored. A command matches a prefix beginning at any hyphen-separated segment: `theme`, `dark`, and `set-th` match `set-theme-dark`. Aliases match only exactly. Text after an internal space is reserved for future arguments and matches nothing in this version. Ordering is: exact name or alias match, matching history entries most recent first, then remaining matches alphabetically. Empty input lists every command in that order.

Both opening keys use the same command list. Only platform-supported commands appear or count. `toggle-always-on-top` is desktop-only and never appears in the browser, including when its name is typed or stored in history. The browser retains `quit` with its save-and-close behavior (§1.4). iPhones and iPads also omit `toggle-vim-mode` (§1.4). Unavailable history entries cannot restore hidden commands; filtering does not erase saved history.

Every action in the desktop menu bar or browser Tree menu must also be available in this panel. Headings, separators and status text are not actions. Platform support, availability, confirmations, cancellation and results must match the menu. State-dependent commands follow the current menu action, including backup start, stop and resume (§24–25).

Temporarily disabled menu actions remain listed, visibly dimmed and marked disabled for assistive technology; Enter or clicking them does nothing and leaves the panel open. Availability updates while the panel is open. Opening the panel is also possible when the document cannot be opened, so Import Notes remains reachable; loading still prevents opening it.

An input change selects the first row. `↓`/`↑` and `Ctrl+N`/`Ctrl+P` select the next/previous row with wrapping, as in completion lists (§20.9). `Enter` or clicking a row runs the listed selection, even for a partial query such as `qui`; there is no separate prefix-abbreviation execution. With no matches, `Enter` closes the panel and displays `Not a command: <input>` at the left of the status bar for two seconds, or until the next key press if sooner. Expiry restores the ordinary status-bar content without changing editor focus, selection or mode.

The available commands and their history rules are specified in §20.2.30.

#### 20.2.29 Popup Navigation

While Vim editing is enabled, application-owned dialogs and activity messages support `h` and `l` to focus the previous and next visible, enabled button in their horizontal action row. Movement stops at either end without wrapping or activating a button. This applies independently of the editor's current Vim mode, only while focus is inside the popup. Import/restore confirmation, backup conflict/permission confirmation, quit confirmation and activity messages share this rule in desktop and browser versions where available. Image preview instead uses `h/j/k/l` to pan its image (§17.1).

`Enter` activates the focused button; `Escape` cancels or dismisses the popup through its existing action. Busy operations retain their existing cancellation restrictions. In a focused activity message, Escape invokes its Cancel or OK action. Existing initial focus, Tab/Shift+Tab navigation and focus restoration remain unchanged. Moving focus must not edit notes or execute an editor command.

The browser's vertical Tree menu uses `j` for the next button and `k` for the previous button, with the same visibility, enabled-state and non-wrapping rules. Opening this menu with Vim enabled focuses its first available button. Enter activates the focused item and Escape closes the menu. The horizontal `h/l` bindings do not apply to this vertical menu.

Text-entry surfaces, including the command panel, search and date/emoji completions, retain literal letters and their existing navigation keys. Modified keys and native text composition retain their existing behavior. With Vim editing disabled, these extra letter bindings are inactive. System-owned menus, file pickers and permission prompts retain platform keyboard behavior.

These application-control bindings extend the keyboard-first model (§1.3); they do not change Vim text editing.

#### 20.2.30 Command Registry

| Name | Alias | Description | Active state | Shortcut | Effect |
| --- | --- | --- | --- | --- | --- |
| `find` | — | Find in the current view | — | `⌘F` | Open local Find (§20.2.26) |
| `image-to-text` | — | Recognize English text in the selected image | — | — | Append recognized children on Apple Silicon macOS Electron (§15.1) |
| `reindex-all-images` | — | Reindex English text from all images | — | — | Refresh hidden search text for all document images (§15.1) |
| `summarize` | — | Summarize selected nodes and copy the summary | — | — | On-device English summary to clipboard; disabled when unavailable or busy (§15.2) |
| `find-next` | — | Find next match | — | `⌘G` | Navigate to the next local match (§20.2.26) |
| `find-previous` | — | Find previous match | — | `⌘Shift+G` | Navigate to the previous local match (§20.2.26) |
| `search-all-nodes` | — | Search all nodes | — | `⌘;` | Open document-wide node and tag search (§20.14) |
| `quit` | `q` | Quit Tree | — | `⌘Q` (`Ctrl+Q` outside Apple platforms, §1.5) | Same as Cmd+Q (§9.1, §16), including save-before-quit, failure and locked-state behavior |
| `show-agenda` | — | Show Agenda | Agenda open | — | Open Agenda using the origin/caret navigation of §23; do nothing if already in Agenda |
| `show-tree` | — | Show Tree | Tree open | — | Return to Tree using the Agenda origin of §23; do nothing if already in Tree |
| `about-tree` | — | About Tree | — | — | Open About (§9.4) |
| `toggle-always-on-top` | — | Keep the window above other windows | Pinned | — | Same as the pin toggle and Window > Always on Top (§2.2, §9.3) |
| `toggle-vim-mode` | — | Use Vim editing | Vim enabled | — | Same preference change as Edit > Vim Editing (§20.2.1–3) |
| `toggle-line-numbers` | — | Show line numbers | Numbers visible | `⌃L` (`Ctrl+L`) | Toggle visible-node numbering (§2.1) |
| `toggle-finished-tasks` | — | Show finished tasks | Finished tasks visible | — | Toggle finished-task visibility across views and search (§2.5) |
| `toggle-star-node` | — | Star or unstar the current node | Current node starred | — | Toggle the star of the current real node (§2.6) |
| `toggle-mark-node` | — | Mark or unmark the current node for Today | Current node marked | — | Toggle the mark of the current real node (§2.7) |
| `set-theme-auto` | — | Follow the system appearance | Automatic | — | Same as View > Appearance > Automatic (§20.5) |
| `set-theme-light` | — | Use the light appearance | Light | — | Same as View > Appearance > Light |
| `set-theme-dark` | — | Use the dark appearance | Dark | — | Same as View > Appearance > Dark |
| `set-theme-gray` | — | Use the gray appearance | Gray | — | Same as View > Appearance > Gray |
| `set-theme-white` | — | Use the white appearance | White | — | Same as View > Appearance > White |
| `export-notes` | — | Export Notes… | — | — | Same as Export Notes in the desktop File menu or browser Data block (§24–25) |
| `import-notes` | — | Import Notes… | — | — | Same as Import Notes in the desktop File menu or browser Data block (§24–25) |
| `back-up-to-folder` | — | Back Up to Folder… | — | — | Same as the browser Data action when folder backup is off (§24.5) |
| `stop-backing-up` | — | Stop Backing Up | — | — | Same as the browser Data action when folder backup is active (§24.5) |
| `resume-backing-up` | — | Resume Backing Up… | — | — | Same as the browser Data action when folder backup is paused (§24.5) |
| `restore-from-folder` | — | Restore from Folder… | — | — | Same as the supported browser Data action (§24.6) |

Desktop also lists `check-for-updates` and `update-app` (§26).

Results match the corresponding menu item or toggle, including saved preferences, menu checks, status-bar state and focus. Pin and appearance commands remain available during the locked save-failure state; they change preferences rather than the document.

`toggle-vim-mode` remains available while saving is locked and changes only the editing preference. Edit > Vim Editing remains available.

View changes resolve editing sessions and selection as `Cmd+P` does; an already-active destination preserves them. Neither edits the document nor adds undo history. Both update command history.

Names use lowercase ASCII words joined by hyphens, verb first: `toggle` switches a state, `set` selects a value, `show` selects a view, `find` and `search` select search actions, `reindex` refreshes derived search text; data verbs name their menu actions. New verbs require updating this rule. `q` is the only alias; new aliases require an owner decision. `theme` means Appearance; `auto` means Automatic.

Every successfully run command except `quit` moves to the front of history, without duplicates. History holds at most 100 commands, dropping the oldest. It persists across restarts as a user preference apart from the document, creates no undo entry and triggers no document save. Its file is written once per successful non-quit command, never per keystroke. Missing or unreadable history means an empty history; names absent from the current registry are ignored.

**Vim divergence.** This panel lists application commands and runs the selected row, whereas Vim runs typed command-line text. Up/Down select rows rather than recalling history; history instead orders the list. This keyboard-first model is the deliberate platform difference under §1.3.
