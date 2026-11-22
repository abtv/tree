# Colors and Appearance

### 8.11 Colors and Appearance

#### 8.11.1 Color Ownership and Palettes

The renderer stylesheets `src/renderer/styles.css` and its imported `gray.css` own every color value as a CSS custom property declared once under `:root` and overridden for the dark appearance in the single `@media (prefers-color-scheme: dark)` `:root` block; Gray and White share Dayfox overrides in `gray.css` and each declares its own `--color-background`; rules reference the properties through `var()`, and no color literal appears outside a custom-property declaration.

One `--highlight-background`/`--highlight-foreground` pair per appearance is shared by the whole-node Visual selection, character `::selection`, deliberate Normal-mode text selections, selected hyperlinks, and the Vim mode badge, so those surfaces cannot drift apart. A Normal-mode selection wider than the one-character block caret is a deliberate selection; `use-node-input-bindings.ts` marks the input with `node-input-text-selected` on `selectionchange` so it takes the highlight pair while the block caret keeps the ink pair.

Values that do not adapt to the dark appearance are declared once without an override. The dark palette is adapted from the Zenburn Emacs port (`zenburn-emacs`, see PRODUCT.md §20.5). Tree rows and the editable current-parent heading expose absolute document depth as `data-color-depth`; zero-specificity dark appearance rules apply the depth palette without changing relative indentation (`data-depth` and `--row-depth`). `App.tsx` derives the heading depth and list color offset from the location path; `NodeList.tsx` adds that offset to each row's relative depth. Agenda uses its own depth-color rules. The light palette is original (see PRODUCT.md §20.5). Its dot grid is a `radial-gradient` on `.scroll-viewport` painted with `--color-grid-dot`, which the dark block sets to `transparent`; `appearanceBackgroundColor` in `src/shared/appearance.ts` mirrors each palette's `--color-background` for the native window and browser chrome. The committed Playwright screenshot baselines are the pixel oracle for these styles.

Browser styles consume the shared color properties, including panel and dialog shadows. The color-ownership guard inspects the shared, Dayfox and browser stylesheets and rejects literal named/system colors as well as hex and color-function values outside custom properties. `transparent`, `currentColor` and CSS inheritance/reset keywords are valid references.

#### 8.11.2 Semantic Presentation

Semantic presentation belongs to shared renderer rules, not individual palettes. Theme styles override semantic CSS custom properties; they must not fork completion or search-match rules by surface. Global Search uses `.node-search-match` for query markers, suggestions and result matches, with the result-only underline kept in its shared result rule. The native query input retains editing and selection; `SearchQueryInput` paints valid markers in an inert mirror using that same class. `appearanceCommands` in `command-registry.ts` supplies the appearance command list and its value type. Search consistency tests enumerate that list, so additional appearances enter the checks automatically. Product semantics and any explicit palette exceptions are owned by PRODUCT.md §20.5.

#### 8.11.3 Desktop Appearance Preference

The desktop appearance choice is persisted by the main process. The View > Appearance menu (`application-menu.ts`) and validated appearance IPC share the same service, which saves it with `createAppearancePreferenceStore` (`window-state.ts`, file `appearance.json` beside the document data; a missing or unknown value reads as `system`) and sets `nativeTheme.themeSource` (`gray` and `white` map to `light`). The main process caches the selected value, so theme notifications require no disk reads. This drives both the renderer's `prefers-color-scheme` block and the `nativeTheme` `updated` event that `followWindowAppearance` listens to. At startup the saved value is applied before the window is created, and `system` leaves `themeSource` untouched. Appearance changes notify the renderer through the preload API (§7.2.1). The renderer sets `data-appearance` before mounting the editor; while the startup read is pending, the desktop document surface is transparent so the correctly colored native window remains visible.

Performance assessment (PRODUCT.md §22.1): every appearance choice, including Gray and White, uses the same preference write and the same startup IPC read. An appearance change performs one preference write and no sync. Theme changes perform no document traversal, do no work on typing or navigation paths, and keep constant-size preference state.

#### 8.11.4 Native Window Surface

The native window surface is the exception to renderer color ownership: `src/electron/main/window.ts` mirrors the document background colors for Electron's `backgroundColor` at construction, follows `nativeTheme` updates with `setBackgroundColor`, and removes the listener on `closed`. The real-Electron appearance tests compare the native surface with the renderer in all appearances to prevent these values drifting.

#### 8.11.5 Startup Reads of Vim and Always on Top

The desktop renderer subscribes to Vim and Always on Top changes before reading their initial values. Each preference retains its latest value and revision across the first React render. A newer native or local choice invalidates the outstanding read. The Vim read uses the startup wait (§16.3). The pin read is independent of that wait. Each preference uses one subscription and its IPC read, with no writes or document traversal of its own.
