# Command Panel

### 7.2 Command Registry and Focus Borrowing

#### 7.2.1 Command Registry and Menu Commands

`command-registry.ts` owns the application command panel's base registry: command names, aliases, descriptions, shortcut data (a key and a Shift flag; the renderer formats the label), state queries and run actions. Registry entries declare required capabilities. Actions invoke the same services as application menus and toggles, including the quit handshake. Appearance IPC reuses the menu's appearance service, updates native theme and menu checks, and notifies the renderer. Matching, ordering, history normalization and history updates are pure functions independent of React, DOM and Electron.

`menu-commands.ts` defines data-menu command metadata and an observable source of supported actions and their enabled state. The desktop data coordinator publishes its menu availability. The browser Data and backup controllers publish explicit command identities and availability through `BrowserMenuCommands`, which projects that state into the buttons and the panel. The buttons and the panel call the same stable handlers synchronously, retaining picker user activation and rechecking current availability. Labels and DOM mutation observation do not determine command identity.

The command-panel owner (§8.6.1) derives one available registry for matching and counts from the host's Always on Top and Vim availability and the store's image-to-text availability. The browser entry disables Always on Top and supplies device-specific Vim availability; in Electron both are available. The panel merges the menu entries with the available registry and rechecks current availability before execution. Filtering does not modify saved history.

Performance assessment (PRODUCT.md §22.1): alphabetical order is prepared when the available entries change. Each input change scans the registry entries and the bounded history (§13.4): command filtering is linear in registry entries plus the bounded history and independent of document size. Each panel owner holds one memoized, registry-sized array. Filtering does no document work, disk writes or syncs, and its retained state does not grow.

#### 7.2.2 Focus Capture and Restoration

`captureFocusRestoration` in `editor-dom.ts` owns the shared capture/restore mechanics for the command panel, About, global Search and browser menu. Editor selections use logical offsets, so text decoration can replace DOM nodes during borrowed focus. Native scopes support textarea, input and document selection for each caller. A disconnected origin is inert. Each caller decides when to restore, including browser popover microtask ordering and explicit new focus destinations. Each focus owner holds one bounded capture. The mechanism does no document traversal or writes, and it does not replace the editor's caret authority.

The command-panel owner saves and restores native selection while borrowing focus; the input bindings forward the blur destination so that this temporary handoff preserves editing sessions.

The browser's `menu-focus.ts` owns the ellipsis menu's temporary focus transfer. It remembers one connected editing surface and directional selection, restores it synchronously before menu actions open dialogs, and defers native-dismissal restoration until the browser finishes restoring its trigger. Explicit pointer/Tab destinations and action-owned view changes retain focus. Menu surfaces declare `data-editor-focus-borrow`, which shares the input owner's temporary-blur exemption with the command panel. Data dialogs and activity messages return through the same focus owner on dismissal. When a Find field or control lends focus to the browser menu, dismissal calls the renderer's Find restoration handler. That handler resolves the current result, Agenda row and saved caret or selection even when focus originally left another row. The focus transfer keeps bounded session-only DOM state. It causes no document-scale work, and its only writes are those of the edit commit.

#### 7.2.3 View Commands

Named view actions resolve sessions through the input owner before dispatching the store's idempotent Agenda open/close methods. They mutate no document and keep no separate view state.

The command-panel owner exposes menu view adapters that restore its borrowed editing focus before invoking a named view command and ignore menu view requests while a modal is open. Both desktop and browser registration use these adapters.

The shared renderer registers its view commands with the browser menu so both menu and panel finish buffered edits before changing Tree/Agenda, without an extra save. Registration is released on unmount; menu view controls remain disabled until the renderer supplies its handlers.

The desktop renderer registers the same view commands through `App.registerViewCommands`. Native View menu actions send the `tree:view-menu-command` main-to-renderer event; preload accepts only `tree` and `agenda` and returns a listener disposer. Registration follows the effect lifecycle, including Strict Mode and renderer reload. The main process caches the four native menu symbols once and reuses them across menu rebuilds. Browser menu icons are decorative CSS masks, so they do not change the text and event paths of labels, picker activation and menu-command discovery.

---

### 8.6 Command Panel and Popup Navigation

#### 8.6.1 Command Panel Session

`use-command-panel.ts` owns one transient command-panel session shared by Tree and Agenda. It captures the application shortcut and Normal-mode `:` before editor dispatch, clears pending Vim assembly through its owner, and restores the previous DOM focus and selection on dismissal (§7.2.2). `CommandPanel.tsx` presents the registry matches separately from inline completion. Its selection uses the shared `moveSuggestionIndex` wrapping rule from `completion-controller.ts`. The view overlays the document above the status bar, keeping document geometry unchanged. Platform commands cross the trusted preload API; the renderer never accesses preference files.

The pre-open callback dismisses current transient feedback through its owners before the panel captures focus. Desktop archive operations distinguish auto-expiring success from acknowledged results; the browser entry supplies its data-menu dismissal callback. Each owner cancels its success timer without changing the archive operation or invoking a platform request. The dismissal keeps no message state of its own and does no persistence work.

The panel retains one focus/selection restoration closure and one current match list; dismissal releases the rendered list.

#### 8.6.2 Popup Navigation

`use-popup-navigation.ts` installs scoped DOM keyboard handling from `App` while its Vim preference is enabled. Explicit `data-popup-navigation` markers identify horizontal action rows and the vertical browser menu in shared React components and browser markup. The handler skips text input, composition and modified keys; it moves focus only among visible enabled buttons and delegates activity dismissal through the marked action. A captured popover toggle focuses the first available menu action on opening. Each dialog's own controls handle its cancellation and activation. The handler keeps no selection state and performs no document traversal, persistence writes or syncs; DOM work is bounded by the popup's controls.

---

### 13.4 Command History

`command-history.ts` stores the bounded command history in `data/command-history.json` under the application user-data directory, apart from the document. Missing/unreadable files produce empty history; loading and saving discard unknown command names and duplicates. Trusted, runtime-validated IPC reads this preference and writes it once per successful non-quit command. Write failures propagate through the renderer's operation-error surface.

Performance assessment (PRODUCT.md §22.1): history retains at most 100 names and writes one small preference file per successful non-quit run, in addition to the command's own preference write. It causes no document writes, syncs, saves or undo snapshots. Focused unit/property, preference-boundary and Electron guards cover history validity and the absence of per-key preference/document writes. §7.2.1 states the filtering cost and §8.6.1 the panel's retained state.
