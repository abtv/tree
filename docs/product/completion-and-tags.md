# Completion, Date Indicators, Emoji and Tags

### 20.9 Natural-Language Date Completion

Tree and Agenda node editors offer explicit date completion in standard editing and Vim Insert. Natural-language expressions remain ordinary text until accepted. A compact popup opens only after an edit inside a recognized expression; it never opens for paste, Undo, or programmatic text changes. Hyperlink text is excluded. Vim Normal, Visual and Replace do not offer completion.

Long digit runs in node text must not cause quadratic date-recognition work on the next edit. Numeric counts are recognized as complete runs, including leading zeros; unrelated digit runs must not prevent completion of a later expression.

#### 20.9.1 Recognized Expressions

* Recognition ignores case and permits repeated spaces between words.
* `toda` and `today` offer Today; prefixes of `tomorrow` from `tomo` onward offer tomorrow; prefixes of `yesterday` from `yest` onward offer yesterday. Suggestions describe the complete expression. Short ordinary words such as `yes` and `tom` remain silent.
* English weekday names accept prefixes from three letters through the full name, without requiring a preposition (`Wed`, `Wedne`, `Wednesday`). Suggestions describe the full weekday name and prefer the upcoming occurrence, including Today. The alternative is next week's occurrence when the current week's is Today or future, otherwise the current week's past occurrence. One- and two-letter fragments offer nothing.
* `this`, `next` and `last` plus a full weekday name offer that weekday in the current, next or previous Monday-based calendar week.
* Weekday names after `this`, `next` or `last`, and all month names after `in`, `last` or `in the end of`, accept prefixes from three letters through the full name (`next fri`, `next frid`, `next Friday`; `in sep`, `in sept`, `in September`). Shorter fragments offer nothing. Suggestions describe the full expression and exact canonical date.
* `next mon` and `last mon` offer both the qualified Monday and the three adjacent-month anchors, each labeled with its full interpretation. Continuing through `mond` to `Monday` leaves only Monday; `mont` and `month` leave only the month anchors. `this mon`, `on mon` and `by mon` retain their weekday meanings.
* Ambiguous `mon` initially selects the date closest to Today. If both interpretations share that date, Monday is preferred. Both labeled rows remain available when their dates coincide.
* After a separate `on` or `by`, weekday names accept prefixes from three letters onward (`on fri`, `by frid`) and offer the same dates as the full bare weekday. The preposition and its spacing stay outside the replacement span, preserving deadline meaning.
* `next wee` and `next week` offer next Monday first and then the remaining days in order. `last wee` and `last week` offer the previous Monday first and then the remaining days in order. Both use Monday-based calendar weeks. Continuing into another word, such as `next weekend`, closes suggestions without changing text.
* All English month names accept prefixes from three letters through the full name before a one- or two-digit day (`Sep 15`, `Sept 15`, `September 15`). They prefer the nearest upcoming occurrence and also offer the nearest past occurrence; February 29 uses valid leap years. Suggestions show the full month name and remain available while it is extended before the existing day. Preceding `on` or `by` stays outside the replacement span.
* `in N day(s)` and `N day(s) ago` offer the date N days after or before Today, with a nonnegative integer count written in digits or an English count from `one` through `one hundred`. Compound counts accept spaces or a hyphen between tens and units, such as `twenty five` and `twenty-five`; `one hundred` uses spaces. Thus `two days ago` and `in five days` offer the same dates as `2 days ago` and `in 5 days`.
* Relative day and week descriptions use the singular unit only for a count of one and the plural for all other counts, including zero. Both input forms remain recognized: `in 2 week` is described as `in 2 weeks`, and `one days ago` as `one day ago`. The typed text stays unchanged until acceptance.
* Suggestions stay within the canonical calendar; unavailable alternatives are omitted.
* Short uncertain fragments, including `t`, `to`, `mar` and `may`, and bare month names offer nothing.
* The recognized span never includes adjacent words or time expressions.

#### 20.9.2 Weeks and Months

* `next month` and `last month` offer the 1st, 15th and actual last day of the next or previous calendar month. The closest date to Today is initially selected: the 1st for next month, the last day for last month. Year transitions and leap years apply; months outside years 0000–9999 offer nothing.
* `in N week(s)` and `N week(s) ago` use the same counts as relative days and offer the date exactly N × 7 days after or before Today.
* `in` plus a full English month name offers one date when it names the current month: the 15th of that month on days 1–10 inclusive, and the actual last day of that month from day 11 onward. For another month, it prefers the nearest upcoming month start and also offers the nearest past month start. For example, on October 8, 2026, `in September` offers September 1, 2026 and September 1, 2027, with 2027 selected initially; the past alternative means the nearest past occurrence, rather than necessarily the previous calendar year.
* `last` plus a full English month name offers the nearest month start strictly before Today.
* For example, on October 8, 2026, `in 3 weeks` offers `2026-10-29`, `3 weeks ago` offers `2026-09-17`, `in October` offers `2026-10-15`, and `last October` offers `2026-10-01`. On October 10, `in October` still offers `2026-10-15`; on October 11 it offers `2026-10-31`.
* The same case, spacing, expression-boundary and canonical-calendar rules apply.

`in the end of` plus a full English month name offers the nearest month end on or after Today. During October, `in the end of October` offers October 31 of the current year, including on October 31 itself; after October it offers October 31 of the next year. The suggestion uses the month's actual last day, including February 29 in leap years. The same case, spacing, expression-boundary and canonical-calendar rules apply.

#### 20.9.3 Popup

* The popup uses the document surface, a thin location-border-colored border and a soft shadow. It aligns its left edge with the expression's first character and sits directly below the edited row without covering it.
* When the window has too little room below the row, the popup sits directly above the row instead, and it shifts left as far as needed to stay inside the window's right edge.
* The popup sizes to its content, keeping dates and descriptions on one line when they fit within the window. Its width never exceeds the window; longer content wraps only when the window requires it.
* Dates appear chronologically, oldest first. The expression's preferred date is initially selected, independently of its position; week lists prefer Monday. Each row shows its canonical date and weekday/expression description. The selected row uses the shared selection highlight pair and stays visible.
* Further edits in the same expression retain the selected date while available, even if its index changes. Otherwise, or for a different node or expression start, select the expression's preferred date. Dismissal clears the selection.
* When multiple interpretations share a date, retain the selected labeled interpretation first. If that interpretation disappears but its date remains available, retain that date under its remaining interpretation.
* The footer reads `↑ ↓ select · Enter/Tab accept · Esc dismiss`.
* Plain `↓` and `↑` cycle to the next and previous suggestions in standard editing and Vim Insert, wrapping at either end; `Ctrl+N` and `Ctrl+P` remain alternatives. Popup arrows take precedence over caret reconciliation and node navigation, retain editor focus and the text caret, and never move to another node. Without a popup, arrows keep their ordinary behavior. Modified arrows keep their ordinary editing behavior.
* Plain `Enter` or `Tab` accepts, and clicking a suggestion accepts it without moving focus from the editor. Acceptance replaces only the recognized span as one undoable edit, places the collapsed caret after the canonical date, and preserves the editing mode. Enter deliberately overrides ordinary node creation and Tab overrides ordinary indentation while the popup is open, including in Vim Insert, so completion uses the same keyboard controls in both editing modes. Without a popup, Tab keeps its ordinary behavior. Modified Enter and Tab keep their ordinary behavior; modified Tab dismisses the popup, including `Shift+Tab` (§20.2.24, §23.10).

Escape closes the popup without changing the expression, caret, focus or editing mode. In Vim Insert, it preserves the current Insert session; another Escape with no popup enters Normal (§20.2.4). Moving the caret outside the expression, selecting text, leaving the editor, changing mode or starting composition closes the popup. Native composition remains uninterrupted and offers completion only after its committed edit. After dismissal or acceptance, the popup reopens only after a new qualifying edit. One Undo restores the accepted expression and does not reopen the popup.

Pressing a modifier key alone, including Command, does not dismiss suggestions. An actual Command shortcut still dismisses them. This lets an external keyboard remapper send a plain arrow after the initial Command keydown without losing the popup; the application does not bind `Cmd+J` or `Cmd+K` itself.

### 20.10 Date-Like Text Indicator

Text that strongly resembles an attempted date but is not a valid canonical date (§23.2) is marked with a 1px wavy underline in a muted red (`#b4554b` in the light appearance, `#cc9393` in the dark appearance, `#b3434e` in Gray and White), in Tree and Agenda alike. Text resembles a date only when it has a four-digit year, a hyphen, a one- or two-digit month, a hyphen and a one- or two-digit day, with no digit touching either end, and is not a valid `YYYY-MM-DD` date. Impossible dates such as `2026-02-31` and incomplete forms such as `2026-10-1` qualify; arbitrary text, hyperlink text and valid dates never do. The mark changes no text, caret position or Agenda membership.

While a node is being edited, a token is not underlined when the caret or selection is inside it or directly adjacent to it, so intermediate typing states such as `2026-10-1` are never flagged; the underline appears when the caret leaves the token or the node is no longer being edited. The rule is the same in standard editing and in every Vim mode. Occurrences that are not being edited, including live mirrors in Agenda, always show the underline.

---

### 20.11 Date Visualization in Tree

Every recognized canonical date (§23.2) in Tree node text, including the current-parent heading, uses regular font weight. Color indicates its relation to the local calendar's Today. Past dates are red, today's dates use a yellow or amber accent, and future dates are green. The light appearance uses dark red, dark yellow and dark green for legibility on its light surface. The dark appearance uses muted lighter variants. Gray and White use Dayfox red, amber and green accents. Tree evaluates Today when rendering date decorations. Agenda uses the Today captured when it opens (§23.1).

Date colors yield to struck-through text color (§2.5). Recognition and hyperlink exclusions are identical in both presentations. Styling updates while editing in standard editing and every Vim mode, without changing text, caret offsets or selection direction, including when Today changes between renders. Whole-node Visual selection uses the shared selection foreground for dates, as in Agenda.

---

### 20.12 Optional Emoji Completion

Tree and Agenda editors offer optional emoji completion in standard editing and Vim Insert. Typing a colon at the start of text or after whitespace immediately opens suggestions. English letters, digits, underscores, plus signs and hyphens refine the shortcode query, including numeric and signed aliases such as `:100`, `:+1` and `:-1`. Matching ignores case. The caret must be at the end of the fragment. A space, other punctuation or no matches closes suggestions without changing literal text. URLs, time expressions and hyperlink text do not trigger suggestions.

The bundled Unicode catalog uses gemoji v4.1.0 English shortcodes and aliases. Search runs locally without network access and matches query characters in order, allowing gaps; it does not correct typos or translate queries. All matches are available in a compact scrollable popup; each shows the emoji and its full `:shortcode:`.

* Typing only `:` lists previously accepted shortcodes in most-recently-used order, followed by the remaining catalog in shortcode order. Without history, the whole list uses shortcode order.
* Keyboard navigation and pointer scrolling can reach every match. For example, `:rkt` offers `:rocket:` and `:wtech` offers `:woman_technologist:`. A closing colon is not required for acceptance.

* Accepting an emoji with Enter, Tab or a click moves its shortcode to the front of a unique history shared by Tree and Agenda and saved locally between launches. Typing, dismissal and Undo/Redo do not change this history.
* History retains at most 100 shortcodes, following the bounded command-history precedent and §22 responsiveness principle. It is an application preference independent of the notes and excluded from notes archives; missing, unreadable or invalid entries are ignored.
* A failed history write uses the existing operation-error surface and remains retryable on the next acceptance or persistence flush. Reaccepting the first entry requires no history write.
* History changes prepare the initial order once; typing performs no history writes or document traversal. Writes are asynchronous and serialized, with at most one small preference write per changed acceptance, no added document writes or syncs, and memory bounded by the fixed catalog and history (§22.1).

Results rank exact names first, then name prefixes, prefixes of words after `_`, contiguous substrings inside words, and finally matches with gaps. The first four groups use shortcode order. Matches with gaps prefer more matched word-start characters, then fewer skipped characters between the first and last match, then an earlier start, then a shorter shortcode, then shortcode order. A word starts at the beginning of a name or after `_`.

When several alignments match a name, its best alignment determines its rank. As soon as a character follows `:`, results depend only on the query and catalog, ignoring history. For example, `:cat` selects `:cat:` before `:cat2:` and `:joy_cat:`; Enter accepts 🐱.

* The popup uses the date completion geometry, appearance, footer and lifecycle (§20.9), including modifier-only key handling.
* Keyboard selection scrolls the selected option into view, and the popup height adapts to the available space above or below the edited row.
* Plain `↓`/`↑` and `Ctrl+N`/`Ctrl+P` cycle suggestions; plain `Enter`, plain `Tab` or clicking an option replaces only the fragment with its complete Unicode emoji sequence as one undoable edit.
* The caret sits after that sequence, focus stays in the editor and the editing mode remains unchanged.
* These shortcuts override ordinary commands only while suggestions are open, following the approved keyboard-first completion interaction in standard editing and Vim Insert.

Without a popup, Enter and Tab retain their ordinary actions; modified Enter always keeps its ordinary behavior. Modified Tab dismisses suggestions and retains its ordinary behavior, including Shift+Tab's structural action (§20.2.24, §23.10).

Escape dismisses suggestions and preserves text, caret, focus and the editing mode, including the current Vim Insert session. Another Escape with no popup enters Normal (§20.2.4). Selection, caret movement outside the fragment, blur, row/view/mode changes, paste, Undo and external changes dismiss without acceptance. Composition suspends suggestions until the committed edit. Only a new qualifying edit opens suggestions; one Undo restores the accepted fragment without reopening them.

---

### 20.13 Tags

People (`@name`) and events (`&name`) follow all tag recognition, highlighting,
completion, and lifecycle rules below, with independent name catalogs for `#`,
`@`, and `&`. Names never contain spaces: `@Anna_Smith`, `@anna-smith`, and
`&weekly-review` are valid. The literal prefix remains visible.

Tags use muted
violet, people muted teal, and events warm ochre in light appearance and peach in
dark appearance, with the same subtle rounded background treatment. Light
foregrounds are `#76517d`, `#306b74`, and `#8a522e`; dark foregrounds are `#d3afd7`,
`#8cd0d3`, and `#dfaf8f` respectively, coordinated with the existing palette.
Completion labels are `Tag suggestions`,
`People suggestions`, and `Events suggestions` respectively.

People and events remain text markers, without separate entity records or calendar
integration. Their names can identify either a specific event or a recurring activity;
equal spellings within one prefix identify the same marker across dates. Typing an
isolated `&` remains ordinary text. Email addresses and embedded prefixes are excluded
by the same start-of-text or whitespace boundary as tags.

Global Search (§20.14) accepts `@` for people and `&` for events using all the tag
search rules: continuous case-insensitive suggestions, acceptance, complete
case-sensitive node matches, hyperlink exclusions, and result highlighting.
Headings are `People` and `Events`; each prefix searches only its own catalog.
The input placeholder is `Search text, #tag, @person or &event`.

A word beginning with `#` at the start of text or after whitespace is a tag. Names contain one or more Unicode letters, decimal digits, hyphens or underscores. Other characters end the tag. A bare `#` is not a tag. Tags are case-sensitive: `#Work` and `#work` are distinct. Hyperlink ranges and hashes embedded in other words or URLs are excluded. Tags remain ordinary editable text; typing a new name creates a tag without accepting a suggestion. No separate tag record is persisted.

* In Tree and Agenda, newly typed letters inside a `#`, `@`, or `&` name are automatically lowercased, including typing in the middle of an existing name and replacing selected text. Only the newly entered characters change; existing characters retain their spelling.
* This applies to standard editing, Vim Insert and Vim Replace, and to committed composition text after native composition ends.
* Text outside recognized marker names, including email addresses and hyperlinks, keeps its case. Existing documents are never normalized on load.
* Paste, accepted suggestions, Undo/Redo, Vim puts and explicit case-changing commands preserve their text. Catalogs retain existing case variants as separate names; global Search applies per-term smart case (§20.14).
* Automatic lowercasing is an owner-requested text-entry convention and a deliberate Vim divergence.

In every appearance, Tree and Agenda highlight tags with a muted violet foreground and subtle rounded background, at ordinary font weight. The literal `#` remains visible. Recognized dates inside tags keep their date foreground. Highlighting does not add padding, change text size, or interfere with selection, caret placement, links or existing date interpretation. Whole-node selection retains its selection colors, and struck-through tags retain the muted completion color.

Typing `#` in standard editing or Vim Insert offers all distinct tags from the entire current document, including folded nodes and nodes outside the current Tree or Agenda scope. The actively edited occurrence is excluded from suggestions; other occurrences in the same node still count. A tag disappears from suggestions after its last occurrence is removed; Undo and Redo restore the matching catalog. With no available matches, no popup is shown and the text remains literal.

Matching ignores case and uses the emoji ordering: exact name, prefix, word prefix, substring, then ordered subsequences with gaps. Words start at the beginning or after `_` or `-`; remaining ties use deterministic lexical order of original names. Case variants remain separate suggestions and acceptance preserves their spelling.

The popup initially selects the first result and resets selection on refinement. All matching names are reachable. Accepting with Enter, Tab or a click replaces only the fragment with the full `#name` as one undoable edit and leaves the caret after it. The geometry, keyboard controls, dismissal and composition lifecycle follow §20.12. Ignoring or dismissing suggestions preserves the typed tag.

Getting the suggestion list from the prepared in-memory index must take less than 1 ms in the automated representative scale workload. This budget covers recognition, active-occurrence exclusion and ranking; it excludes initial index construction and popup layout/painting. Index updates and real typing responsiveness have separate scale guards (§22.1).
