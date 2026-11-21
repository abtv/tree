# Overview

## 1. Product Overview

Desktop application for macOS that combines the hierarchical text editing model of Workflowy with the navigation model of Windows Explorer.

The application stores an ordered collection of top-level root nodes. Each root node is the root of a tree of text nodes.

Each node:

* has a stable unique ID;
* has text;
* may have child nodes;
* may contain at most one image attachment;
* can be edited inline.

The user's location is one level: either the top-level root nodes or the immediate children of the current parent. Nodes at that level may be expanded to show descendants inline (see §2.4).

The application is keyboard-first. Mouse interaction is primarily used for moving nodes by drag-and-drop.

Text remains editable inline. The user chooses between standard text editing and Vim-inspired editing, which adds Insert, Normal, Visual, and Replace interaction modes, as defined in §20.2.

The application automatically saves changes.

### 1.1 Product Principles

The product holds four standing commitments. Their details are owned elsewhere; this section records what they are and which one yields when two of them cannot both be satisfied.

* **Durability.** The user's work is never silently lost. Owned by §16 and its save, recovery, and failure behavior.
* **Privacy.** The user's content stays on their machine, and the application is safe to run without expecting anything to leave it. Owned by [SECURITY.md](../SECURITY.md).
* **Vim fidelity.** While Vim editing is enabled, editing text inside a node behaves as Vim does, and every deliberate divergence is recorded with its reason. Owned by §20.2 and [VIM_CONFORMANCE.md](../VIM_CONFORMANCE.md).
* **Responsiveness.** The application feels immediate, and ordinary editing never develops noticeable pauses. Owned by §20.4 and §22.

When two of them conflict, they yield in this order: durability first, then privacy, then Vim fidelity, then responsiveness. A change must not trade a higher commitment for a lower one. Flushing every save to disk before it reports success is an example — it spends responsiveness to keep durability, and that is the intended direction.

This order resolves conflicts between the four commitments. It does not rank them against any other requirement in this document, and it does not authorize weakening any of them.

### 1.2 Exploratory Sections

A section of this document may carry a bold **Exploratory.** line directly under its heading, with a short note. It records that the Product Owner is still working that behavior out through use.

Only the Product Owner sets or removes the marker. No section is exploratory unless it carries one, and an agent must never add a marker, remove a marker, or treat a section as exploratory because the behavior looks new or incomplete.

The requirements in a marked section stay normative: they are implemented, tested, and validated exactly like every other section. What the marker changes is how an agent may resolve what the section does not yet say, which `AGENTS.md` §5 defines.

### 1.3 Platform Conventions

The application is a native-feeling macOS application and follows Apple's Human Interface Guidelines (<https://developer.apple.com/design/human-interface-guidelines/>) wherever this document does not specify a different behavior. This covers the menu bar and its standard menus, standard keyboard shortcuts, window behavior, text editing, system appearance, and the wording and placement of controls. For example, a command that acts on the window belongs in the Window menu and a command that changes text editing belongs in the Edit menu, not in a menu invented for the application.

A requirement in this document that deliberately differs from the guidelines takes precedence, and the difference is recorded next to that requirement with its reason. The keyboard-first model (§1) and Vim-inspired editing (§20.2) are such deliberate differences.

The desktop application menu starts with **About Tree**, **Check for Updates…** and
**Restart and Install Update** (§26), followed by a separator before Quit Tree. About Tree opens the About dialog, which §9.4 defines.

Outside Apple platforms, §1.5 maps the Cmd and Option shortcuts to Ctrl and Alt.
