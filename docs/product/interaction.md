# User Interaction Principles

## 20. User Interaction Principles

The application is keyboard-first.

Text is always edited inline.

Text remains inline in every interaction mode; Vim-inspired modes change keyboard interpretation rather than opening a separate editing surface.

The user normally interacts with the application through:

* keyboard navigation;
* keyboard commands;
* text editing;
* clipboard;
* mouse drag-and-drop for moving nodes in the hierarchy.

The tree hierarchy can be navigated by entering and leaving nodes or inspected and edited through inline expansion. Expansion does not change the current location.

The pointer shows the text-editing cursor only over a node editor that has focus. Text the user cannot edit — the location path, the Vim mode indicator, tooltips, status and error messages, and dialog text — shows the default arrow cursor.

The desktop app keeps the mouse pointer visible while typing and navigating with the keyboard, in both standard and Vim editing. This deliberately overrides automatic pointer hiding so users can locate the pointer without moving the mouse. It does not change the text caret or pointer shapes.

### 20.1 Very Wide Node Lists

When the current location contains more than 100 visible rows, including inline descendants, the application renders only the rows near the viewport plus a small overscan. The off-screen rows are absent from the DOM: browser find-in-page and assistive technology expose only the mounted rows, and selecting or copying text that spans off-screen rows requires scrolling to them.

Windowing starts at this medium-list size to bound keyboard-driven row updates and browser layout work. It changes no document data, history entries, disk writes or syncs. Mounted DOM and per-row editor state remain bounded by the viewport and overscan, while the existing logical row projection and height offsets still scale with the displayed list. Splitting, merging or folding across the threshold must preserve focus, caret and text even when the rendering mode changes.

The focused row stays mounted even when it is off-screen, so keyboard navigation, focus restoration, typing, and the caret never lose their input.

A node drag that reaches the top or bottom edge of the content area scrolls the list automatically, so the node can be moved to a position outside the visible rows. This holds in every list that overflows the window, whether or not its rows are windowed; a list that fits the window does not scroll. Hovering the location toolbar does not scroll the list (§2.2). Autoscroll stops when the drag ends or is cancelled, including when saving locks editing or the source is no longer displayed. Removing that condition does not resume the cancelled gesture.

The content continues to scroll as a single document. The location bar stays fixed (§2.2); the current-parent heading scrolls with the content.

During scrolling, the last painted rows remain visible until the replacement rows and their position are ready together. Large scroll jumps must not expose an empty viewport while waiting for the next visible range. This retains a bounded rendered window rather than mounting the full document, and preserves the selected input and caret.

Replacing estimated heights with measured heights must keep the first visible row at the same viewport position, including its partially clipped top. Measurements above it must not add a jump or reverse the user's scroll movement. Explicit navigation, caret reveal and restoration retain their existing destinations; natural scroll limits still apply.

At or below 100 visible rows, the list renders every row, including inline descendants, without windowing.

### 20.3 Typography

The application uses the bundled JetBrains Mono typeface for all user-interface text. The bundled
font is distributed under the SIL Open Font License 1.1; the application source remains under the
project's MIT license.

Text is drawn character by character: the typeface's ligatures and contextual alternates are disabled, so every typed or stored character appears exactly as it is, and a sequence such as `://` never changes the visible position or shape of its characters.

### 20.4 Immediate Interaction

The application does not animate its own interface. Navigation, entering and leaving a node, expanding and collapsing a node inline, creating and deleting nodes, reordering, selection, Vim mode changes, and error states all apply immediately: no transition, easing, or fade stands between the user's action and its visible result.

The browser version suppresses the browser's fading tap highlight on editor and menu controls, including node dots on iPhone and iPad. Existing control feedback applies immediately.

This deepens the Responsiveness commitment in §1.1: even a smooth, well-performing animation still spends a fixed delay before the user can act on its result, and that delay cannot be removed by animation quality alone.

This does not govern motion the application does not itself decide to add: native macOS window chrome, and scrolling driven directly by continuous user input, such as the page's own scroll position or the drag auto-scroll in §11 and §20.1, whose motion is the direct feedback of an ongoing input rather than a transition inserted after an action completes. It likewise does not govern appearance that follows the scroll position directly and has no duration of its own, such as the scroll-edge fades in §20.6.

### 20.5 Appearance

The command panel (§20.2.28) exposes the same five choices using `set-theme-auto`, `set-theme-light`, `set-theme-dark`, `set-theme-gray`, and `set-theme-white`.

The application has five appearance choices in the **View > Appearance** menu (§9.3): **Automatic**, **Light**, **Dark**, **Gray**, and **White**. Automatic follows the operating system's light or dark appearance and restyles the open window immediately when the system appearance changes. Each explicit choice keeps its appearance whatever the system uses. Gray and White use light native controls. Choosing an item restyles the open window immediately, including the native window surface, and the choice is saved and restored at the next start. When no choice has been saved, as at the first start, the appearance is Automatic.

Every current and future appearance preserves the same semantic presentation rules across application surfaces. Palettes may change colors, but must not change completion, link operability, selection or search-match behavior. Struck-through nodes follow §2.5 everywhere, including hyperlinks and parent paths. Global Search query markers, suggestions and result matches follow §20.14; node-marker styling must not replace search emphasis. Existing palette-specific choices below remain limited to their stated surfaces. Adding an appearance requires checking these shared rules in that appearance; the owner must not have to discover and request separate fixes for each surface.

Selected hyperlinks use the same foreground and background as the surrounding text selection in every appearance and editing mode. Any link highlight retained when focus moves to another control keeps that appearance's selection colors.

Save-error and inline image-error messages remain legible against the document surface in every appearance. Dark uses a lighter muted red for these messages. Light, Gray, and White use darker error colors.

The application must not show unintended flashes of a contrasting background during startup, renderer loading or reloading, closing, or system appearance changes. In dark appearance, even a brief white or light-background flash is a visual defect. This applies to the whole application window, including the native surface before the renderer paints and while it is torn down. The native window background matches the document surface from window creation through closing, including after a system appearance change.

The window's top strip, which holds the window controls (close, minimize, zoom) and the title `Tree`, has the same color as the document background in every appearance. The system title bar is not shown, so the strip never differs in tone from the content below it. The strip drags the window, the window controls keep their standard behavior, and the title uses the secondary text color of the current appearance.

The dark appearance uses a palette adapted from the Emacs port of the Zenburn color scheme, `zenburn-emacs` (<https://github.com/bbatsov/zenburn-emacs>), not from the original Vim theme: a warm gray document surface, soft off-white text, and muted accent colors.

* In the dark appearance, Tree node text uses the existing eight-color depth palette based on its absolute depth in the document: root nodes use the first color, their children the second, and so on. Nodes deeper than the eighth level use the ordinary text color.
* Entering or leaving a focused parent preserves each node's color, including when the node becomes the editable current-parent heading; indentation remains relative to the current parent.
* Agenda retains its depth colors. The light appearance does not color text by depth. Semantic colors for links, dates, struck-through text, and selection highlights still apply.

* The light appearance is an original palette, not adapted from a published color scheme. Its direction is a soft, paper-like notebook surface, set by a reference screenshot the Product Owner supplied (a note-taking application with a cream background and muted accents) and by the dotted-page look of a bullet journal. It uses a warm cream document surface, warm graphite text, warm gray-beige secondary text and rules, and a muted amber selection highlight with dark text.
* The gutter dots of node rows are light warm gray, so they stay quiet beside the text.
* The outer ring of a node with children is a darker warm beige than the surface and its disclosure chevron is a mid warm gray, so both stay visible on the cream surface.
* Links are a muted blue.
* The content area of the light appearance carries a faint dot grid with a 20px pitch, like dotted notebook paper; the grid scrolls with the content, stays beneath the toolbar and status bar, and is absent from the dark appearance.

The Gray appearance adapts Dayfox from [Nightfox](https://github.com/EdenEast/nightfox.nvim), via its [Ghostty palette](https://github.com/mbadolato/iTerm2-Color-Schemes/blob/master/ghostty/Dayfox), with a custom `#dddddd` background, dark violet text, muted gray-violet controls and no dot grid or depth coloring.

White uses the Gray palette and styling with a pure white (`#ffffff`) document and window background. Tints derived from the background use the white surface.

Tags use muted violet `#5b496c` and the shared subtle background; people and event markers retain their semantic colors. Search and command results use the current Tree row's muted selection fill. Search focus uses a visible secondary-color border; paths, labels and hints use the secondary text color, and separators are subdued. Visual selections, text selections and the Visual badge share a stronger gray-violet highlight with the ordinary text color. Light and Dark retain their original palettes. The palette's MIT attribution is retained in the distributed stylesheet.

In the dark appearance, Vim mode indicators share a dark gray background and use muted text colors from the document palette: green for Normal, cyan for Insert, sandy yellow for Visual and whole-node Visual, and red for Replace. The Visual indicators retain the shared selection highlight pair.

The active state of the status-bar pin takes its colors from the palette of the current appearance: the same warm surface tone as a hovered disclosure chevron behind the ordinary text color, so it reads as part of the light cream palette and of the dark Zenburn palette alike. Its hover text and focus outline use the hover-text and secondary colors of that palette.

### 20.6 Scroll Edges

Content scrolls at pixel granularity, so a row can be cut where the content area meets the location toolbar (§2.2) or the status bar (§20.2). A cut row fades into the document background toward that edge instead of ending in a hard line through its text.

The top fade shows while content is scrolled beneath the toolbar, and the bottom fade shows while more content lies below the status bar. At the start of the document there is no top fade, at its end there is no bottom fade, and content that fits the window shows neither. Each fade is shorter than one text row and no taller than the capped context of §20.8, leaves the scrollbar uncovered, and does not intercept the pointer: clicking, selecting, and dragging behave inside it exactly as elsewhere. The fade strength follows the scroll position directly, reaching full strength within the first few pixels scrolled away from an edge.

The edges stay flat. A shadow cast by the bars onto the content was tried and rejected: it made the bars look raised above the content, a depth the otherwise flat interface has nowhere else, and it still showed the cut text.

### 20.7 Consistency Across Input Paths

What the application shows and does depends on its state, never on the input path that produced the state. When one command or state can be reached in several ways — mouse, keyboard shortcut, Vim key, menu item, or a restored session — the result is identical in every way: the same appearance, including focus indicators, the same focus target, the same caret and selection, and the same side effects. Opening an image preview with a click, with `Enter`, or with `Cmd+Y` is one example.

A difference between paths is allowed only where this document records it and its reason. An appearance that the platform or browser derives from the most recent input device, rather than from the application's state, is a difference of this kind and is not recorded anywhere: an element that receives focus programmatically shows its focus indicator whether the user last used the mouse or the keyboard.

### 20.8 Keeping the Selection in View

The content area is the scrolling region between the location toolbar and the status bar (§2.2, §20.2). When the selection or the caret moves to another node, the content scrolls so the destination is visible and the position it ends in does not depend on the key or direction that led there.

In Tree, Normal `j`/`k` reveal the destination text line instead of the whole node, including when the caret stays in the same node. The context and minimum-distance rules below apply to that line. A wrapped node is revealed progressively as the caret approaches an edge; a node taller than the viewport does not keep its start visible at the expense of its caret. Counts and `J`/`K` apply this rule to the final destination. Image destinations and other commands retain their node-reveal rules.

#### Context

* After a keyboard command that reveals a node, the selected node lies at least one context away from the top and bottom edge of the content area, so a node that fits between those contexts never sits in the scroll-edge fades (§20.6) and the next `j` or `k` does not have to scroll first.
* The context is the height of one single-line node (25 px), not the height of the selected node, so a node that wraps over several lines does not enlarge it. It is capped at a quarter of the content area.
* A keyboard command moves the content by the smallest distance that restores the context, so `j` and `k` at the edge of the window move it by about one node instead of re-centering it, and the stop positions at the top and at the bottom are mirror images.
* A node already clear of both edges never causes scrolling.
* A node taller than the content area minus both contexts shows its start below the top context; its bottom may clip and enter the bottom fade. A node whose start is already at that position does not scroll again.

#### Distant Destinations

A destination more than half the height of the content area beyond its nearest edge, such as the target of `G` in a long list, is centered in the content area instead, since the surrounding nodes matter more than a small shift. A node that cannot fit between the contexts keeps the start priority above instead of being centered.

#### Document Edges

* When a move in one direction would stop within two contexts of the start or end of the content, the content scrolls all the way to that edge.
* Whole-node boundary navigation (`gg`/`G`) reaches the document start for the first node, including when it is taller than the area between the contexts. It reaches the document end for the last node when that node fits between the contexts; otherwise its visible start takes priority over reaching the end.
* For Normal text-line navigation, reaching the first or last node is not itself an edge destination: the caret's line remains visible while traversing that node. Reaching its first or final text line uses the same directional document-edge snapping rule.
* The content never scrolls against the direction of the move.
* At the start or end of the content the selected node may lie closer to the edge than the context, because nothing can scroll further.

#### Changing Geometry

While a reveal remains current, image loading, row measurement and viewport resizing apply the same rule again so its destination remains visible. A new reveal replaces the previous one. Deliberate scrolling with the wheel, touch, scrollbar or a page-scroll key cancels this correction, so later image loads and measurements do not move the content back under the user. Geometry correction changes neither focus nor the caret, text selection, Vim mode or document history.

#### Pointer

A click or press that selects a node does not move a node that is fully visible, even next to an edge, so the content never shifts under the pointer. A node that is not fully visible scrolls into view by the same rules.

#### `H`, `M`, and `L`

**`H`, `M`, and `L`** (§20.2) choose among the nodes that lie wholly outside the contexts, except at an edge where the content is scrolled to its start or end, which keeps no context. They do not scroll, including during later geometry changes. When no node lies outside the contexts, they choose among the nodes in the whole content area as §20.2 describes; this fallback may select a node within a context or a clipped node and preserves the scroll position.
