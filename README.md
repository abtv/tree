# Tree

Tree is a keyboard-first outliner whose primary application is built with Electron for macOS. Write notes, break ideas into branches, and focus on a branch while keeping the surrounding structure within reach.

## Availability

**macOS desktop:** Tree is built for Apple Silicon Macs. The signed application is tested on macOS 15 in CI; compatibility with earlier macOS versions has not been verified. Published installers appear on [GitHub Releases](https://github.com/abtv/tree/releases). Draft releases are visible only to repository maintainers.

To install a published release, download its `Tree-<version>-arm64.dmg`, open it, and drag **Tree** to **Applications**. Then open Tree from Applications. See [macOS releases](docs/releasing.md) for signing, verification, and publication details.

**Browser:** Open <https://tree-editor.github.io>. It keeps notes in the current browser profile, separately from the desktop application, without automatic synchronization or desktop recovery generations. Export and import transfer notes between versions. See [Browser version](src/web/README.md) for compatibility, backup, offline access and storage limitations.

## Tour

[Watch the demo video](https://abtv.github.io/tree/tree-demo.webm)

<img src="https://abtv.github.io/tree/tree-overview.png" width="860" alt="Tree in the light appearance, showing reading club, work, learning, and ideas branches, with some branches expanded and others folded.">

Keep projects, notes, and ideas in one outline. Expand the branches you are working on and keep other details folded away.

<img src="https://abtv.github.io/tree/tree-focus-dark.png" width="860" alt="Tree in the dark appearance, focused on the first meetup branch with its breadcrumb path and Vim Normal mode indicator visible.">

The same outline, focused on “Plan the first meetup”: the node text and expanded branches are unchanged. The breadcrumb path keeps its place in the larger project visible. Here, the dark appearance and Vim Normal mode are enabled.

<img src="https://abtv.github.io/tree/agenda-light.png" width="860" alt="Agenda in the light appearance, showing the same outline's dated nodes grouped under days from Monday October 5 to Thursday October 15, with Thursday October 8 marked as today.">

The Agenda gathers the dated nodes of the same outline into a timeline of days. Each occurrence keeps its place in the outline through its ancestors, and Today is marked.

<img src="https://abtv.github.io/tree/tree-search.png" width="860" alt="Tree search in the dark appearance, with two matches for book highlighted in the meetup branch.">

Press `Cmd+F` to find text in the current view. While Find has focus, `Enter` / `Shift+Enter` moves between matches; `Escape` closes Find at the last match. `Cmd+G` / `Cmd+Shift+G` and the arrow buttons also navigate matches. `Cmd+;` searches node text, tags (`#`), people (`@`) and events (`&`) throughout the document. Vim Normal also supports `/`, `n` and `N` for local search.

<img src="https://abtv.github.io/tree/tree-commands.png" width="860" alt="Tree command panel in the dark appearance, showing application commands and their keyboard shortcuts.">

The command panel keeps application commands and their shortcuts within reach. Press `Cmd+Shift+P` in either editing mode, or `:` in Vim Normal mode, then type to filter the list.

## Features

* **Nested outlines.** Edit text inline, expand branches, or enter a node to focus on its children.
* **Flexible editing.** Use standard text editing or enable Vim-inspired editing with Normal, Insert, Visual, and Replace modes.
* **Easy organization.** Move nodes and their branches with keyboard commands or drag-and-drop, and undo or redo edits.
* **Image attachments.** Paste images into nodes and open them in a larger preview.
* **Local storage.** Documents and images stay on your machine, with automatic saving. The desktop application can automatically recover from retained document versions.
* **Notes export and import.** Export notes and their images to a ZIP archive, or import an archive from either the desktop or browser version. Import replaces the current notes after confirmation.
* **Light and dark appearances.** Choose an appearance or follow the macOS setting.

Tree has no cloud document service and sends no telemetry. Opening external links, searching with Google, and using macOS Look Up can contact external services at your request; see the [Security Policy](docs/SECURITY.md#network-egress-and-content-disclosure).

Detailed behavior and editing commands are described in [Product Requirements](docs/PRODUCT.md).

## Running from Source

On macOS, install the toolchain listed in the [Development Guide](docs/DEVELOPMENT.md#2-prerequisites), clone this repository, and run these commands from its directory:

```bash
npm install
npm run dev
```

To build and run the production output locally:

```bash
npm run build
npm run start
```

The build produces unpackaged output, not an installable `.app` or `.dmg`. See the [Development Guide](docs/DEVELOPMENT.md) for setup details, checks, and troubleshooting.

The local browser version runs with `npm run dev:web` at <http://127.0.0.1:5174/>.
Its source, checks and current limitations are in [Browser version](src/web/README.md).

## Documentation

* [Product Requirements](docs/PRODUCT.md) — user-visible product behavior and requirements.
* [Open Questions](docs/OPEN_QUESTIONS.md) — non-normative product and technical questions that are still open, with their evidence and decisions.
* [Architecture](docs/ARCHITECTURE.md) — technology stack, technical architecture, boundaries, and design principles.
* [Development Guide](docs/DEVELOPMENT.md) — development environment, commands, testing, validation, and repository conventions.
* [macOS Releases](docs/releasing.md) — signing, installer verification, and publication.
* [Agent Roles](docs/AGENT_ROLES.md) — the formal definition of each agent role, shared by every coding-agent tool's config.
* [Security Policy](docs/SECURITY.md) — the security model and the tests that verify it.
* [Agent Instructions](AGENTS.md) — instructions for AI coding agents working on the repository.
* [Active Plans](plans/README.md) — multi-session initiatives and review follow-up batches, with their next tasks.
* [License](LICENSE) — MIT License.

## Development

Implementation code lives under `src/`. See [Architecture](docs/ARCHITECTURE.md) for its structure and [Architecture Decisions](docs/decisions/README.md) for recorded technical choices. [Working with the Coding Agent](docs/WORKING_WITH_AGENT.md) explains the development workflow and the `menu` request; [Agent Instructions](AGENTS.md) define repository rules.

## License

Tree is licensed under the [MIT License](LICENSE).
