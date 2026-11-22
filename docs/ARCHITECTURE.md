# Architecture

This document is the index of the architecture description. It holds no architecture text. The text is in the files under `docs/architecture/`, which state how the software is structured.

## Citation Convention

`ARCHITECTURE.md §N` is the stable identifier of an architecture section. A section is its number together with all its numbered subsections, wherever they are stored. A section number never changes and is never reused. A new section takes the next free number under its parent. A heading title may change; the number is the identifier. A phrase such as "in this section" therefore names the whole numbered section, in whatever files its subsections are stored.

<a id="desktop-notes-replacement"></a>

ADR 0024 links to the former heading "Desktop notes replacement" of this file. That text is §13.12 in [desktop-data.md](architecture/desktop-data.md).

## Section Map

Each section number is listed once, with the file that holds its heading.

| Sections | File |
| --- | --- |
| 1, 2, 3, 12, 18, 19, 20, 21, 22, 23 | [overview.md](architecture/overview.md) |
| 4, 5, 6, 10, 11 | [domain-model.md](architecture/domain-model.md) |
| 7, 7.1 | [application.md](architecture/application.md) |
| 8, 8.7, 8.9, 8.10, 9, 13.2 | [interaction.md](architecture/interaction.md) |
| 8.2, 8.4, 8.5, 13.6 | [list-rendering.md](architecture/list-rendering.md) |
| 8.11 | [appearance.md](architecture/appearance.md) |
| 8.3, 21.1 | [vim.md](architecture/vim.md) |
| 7.2, 7.2.1, 7.2.2, 7.2.3, 8.6, 8.6.1, 8.6.2, 13.4 | [command-panel.md](architecture/command-panel.md) |
| 4.2, 13.3, 21.2 | [search.md](architecture/search.md) |
| 8.8, 8.8.1, 8.8.2, 8.8.3, 8.8.4, 13.1 | [completion-and-tags.md](architecture/completion-and-tags.md) |
| 4.1, 7.3, 8.1 | [agenda.md](architecture/agenda.md) |
| 13, 13.5, 13.9, 13.10, 13.11 | [persistence.md](architecture/persistence.md) |
| 13.8 | [save-scheduling.md](architecture/save-scheduling.md) |
| 13.7, 14, 15 | [attachments-and-clipboard.md](architecture/attachments-and-clipboard.md) |
| 16, 17 | [electron.md](architecture/electron.md) |
| 13.12, 13.13 | [desktop-data.md](architecture/desktop-data.md) |
| 13.14, 13.15, 13.16, 13.17 | [browser.md](architecture/browser.md) |

## Retired Numbers

A number whose content leaves the architecture is listed here with the document that now owns the content, or with the record of its removal. No number has been retired.
