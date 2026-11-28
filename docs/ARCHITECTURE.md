# Architecture

This document is the index of the architecture description. It holds no architecture text. The text is in the files under `docs/architecture/`, which state how the software is structured.

## Citation Convention

`ARCHITECTURE.md §N` is the stable identifier of an architecture section. A section is its number together with all its numbered subsections, wherever they are stored. A section number never changes and is never reused. A new section takes the next free number under its parent. A heading title may change; the number is the identifier. A phrase such as "in this section" therefore names the whole numbered section, in whatever files its subsections are stored.

<a id="desktop-notes-replacement"></a>

ADR 0024 links to the former heading "Desktop notes replacement" of this file. That text is §13.12 in [desktop-data.md](architecture/desktop-data.md).

## Writing Rules

The files describe the present design. A reader who changes one area opens one file and finds, for each mechanism, which module owns it, which rules a change must keep, and what it costs.

* Describe one owner or one mechanism in each numbered subsection, in this order where it applies: what the module owns and where it is; its states, transitions and ordering rules; the constraints a change must keep; costs and guards.
* Keep the own text of a section within 8,000 characters. Split a longer section into numbered subsections with the next free numbers, and add them to the Section Map.
* State each fact once, at its owner. Cite that section elsewhere.
* State what the code does, in the present tense. Do not narrate a change: do not write "no longer", "the existing", "added", "as before", or "unchanged" about an earlier design, and do not record that a change left something else unaffected.
* State a cost for the mechanism that produces it: the writes and syncs it performs or schedules, its complexity bound, its retained memory, and the guard that covers it. When a path marks a persisted change for the autosave, say so; do not write that the path adds no writes.
* Make a negative statement about the path that it constrains. Keep it when breaking it would need a decision or a guard.
* Keep the reason for a rejected alternative, and the conclusion and the stated limit of a measurement.
* Cite user-visible behavior as `PRODUCT.md §N`. Do not restate it.
* Name owners by source file and symbol. A cited source file must exist.

`npm run check:docs` enforces the size limit, the Section Map and the existence of cited source files ([Development Guide §12](DEVELOPMENT.md#12-testing-strategy)).

## Section Map

Each section number is listed once, with the file that holds its heading.

| Sections | File |
| --- | --- |
| 1, 2, 2.1, 2.2, 2.3, 3, 12, 18, 19, 20, 21, 22, 23 | [overview.md](architecture/overview.md) |
| 4, 5, 5.1, 5.2, 5.3, 5.4, 5.5, 6, 10, 11, 11.1, 11.2, 11.3 | [domain-model.md](architecture/domain-model.md) |
| 7, 7.1, 7.4, 7.5, 7.6 | [application.md](architecture/application.md) |
| 8, 8.7, 8.9, 8.10, 9, 9.1, 9.2, 9.3, 9.4 | [interaction.md](architecture/interaction.md) |
| 8.2, 8.2.1, 8.2.2, 8.4, 8.4.1, 8.4.2, 8.4.3, 8.4.4, 8.4.5, 8.5, 13.6 | [list-rendering.md](architecture/list-rendering.md) |
| 8.11, 8.11.1, 8.11.2, 8.11.3, 8.11.4, 8.11.5 | [appearance.md](architecture/appearance.md) |
| 8.3, 8.3.1, 8.3.2, 8.3.3, 8.3.4, 21.1, 21.1.1, 21.1.2, 21.1.3, 21.1.4, 21.1.5, 21.1.6, 21.1.7 | [vim.md](architecture/vim.md) |
| 7.2, 7.2.1, 7.2.2, 7.2.3, 8.6, 8.6.1, 8.6.2, 13.4 | [command-panel.md](architecture/command-panel.md) |
| 4.2, 4.2.1, 4.2.2, 4.2.3, 4.2.4, 4.2.5, 13.3, 13.3.1, 13.3.2, 13.3.3, 13.3.4, 21.2 | [search.md](architecture/search.md) |
| 8.8, 8.8.1, 8.8.2, 8.8.3, 8.8.4, 13.1 | [completion-and-tags.md](architecture/completion-and-tags.md) |
| 4.1, 7.3, 7.3.1, 7.3.2, 7.3.3, 8.1, 8.1.1, 8.1.2, 8.1.3, 8.1.4, 8.1.5, 8.1.6, 8.1.7 | [agenda.md](architecture/agenda.md) |
| 13, 13.5, 13.5.1, 13.5.2, 13.5.3, 13.5.4, 13.5.5, 13.9, 13.9.1, 13.9.2, 13.9.3, 13.10, 13.10.1, 13.10.2, 13.11 | [persistence.md](architecture/persistence.md) |
| 13.8, 13.8.1, 13.8.2, 13.8.3, 13.8.4, 13.8.5 | [save-scheduling.md](architecture/save-scheduling.md) |
| 13.7, 14, 14.1, 14.2, 15, 15.1, 15.2 | [attachments-and-clipboard.md](architecture/attachments-and-clipboard.md) |
| 16, 16.1, 16.2, 16.3, 17, 17.1 | [electron.md](architecture/electron.md) |
| 13.12, 13.12.1, 13.12.2, 13.12.3, 13.13, 13.13.1, 13.13.2, 13.13.3, 13.13.4, 13.13.5 | [desktop-data.md](architecture/desktop-data.md) |
| 13.14, 13.15, 13.15.1, 13.15.2, 13.15.3, 13.15.4, 13.15.5, 13.15.6, 13.16, 13.16.1, 13.16.2, 13.17, 13.17.1, 13.17.2, 13.17.3, 13.17.4 | [browser.md](architecture/browser.md) |

## Retired Numbers

A number whose content leaves the architecture is listed here with the document that now owns the content, or with the record of its removal. No number has been retired.
