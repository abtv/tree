# Clipboard and Paste

## 12. Clipboard

`Cmd+V` is the normal system paste operation.

Paste uses the current clipboard item created by the most recent copy operation. It does not use older clipboard history.

Malformed break tags in clipboard HTML must not stall paste through superlinear matching or prevent extraction of valid hyperlink metadata that follows the closed tag.

If the current clipboard item exposes both image and text representations, the image takes precedence. Paste the image and do not also paste the text representation.

PNG clipboard images larger than 25 MiB are rejected. The application reports an operation error stating the size limit, leaves the document unchanged, and does not fall back to the item's text representation. Existing attachment format and decoded-image limits still apply to images within this byte limit.

The application must support:

* plain text;
* multiline text;
* images.

When a valid HTTP or HTTPS URL is pasted, the URL is stored as a clickable hyperlink. The displayed link text is the URL itself. Plain-clicking a link places the editing caret, while `Cmd+click` opens it in the system's default hyperlink application. Links are underlined and use a distinct color that adapts to the light or dark appearance.

Only `http` and `https` URLs are hyperlinks. Invalid URLs and other schemes are pasted as ordinary text.

In the browser version, both primary-modifier click and Vim Normal `Enter` open hyperlinks in a new browsing context without an opener reference or an HTTP referrer. The destination must not be able to navigate the Tree page through `window.opener`.

---

## 13. Plain Text Paste

Plain text is inserted at the current cursor position.

It does not replace the entire node.

* Pasted valid HTTP(S) URLs receive hyperlink behavior at the inserted range immediately, including browser native paste without HTML hyperlink metadata in standard editing and Vim Insert. No subsequent edit is required.
* Plain-text paste recognizes complete whitespace-delimited HTTP(S) URLs within surrounding text, including later lines of a multiline node and text inserted from a Vim register. Surrounding text and whitespace remain unchanged. Explicit hyperlink ranges from rich clipboard content remain authoritative.
* A URL typed by hand becomes a hyperlink in any node while it is being typed: as soon as the whitespace-delimited word under the edit is a valid HTTP(S) URL, that word is underlined, colored as a link, and clickable, and the caret and focus stay where they were so typing continues without interruption. Typing more characters at its end extends the link.
* A word that is not (or no longer) a valid URL is ordinary text, so a prefix such as `http:/` is plain until the typed word becomes a valid URL.
* Typing whitespace inside a link splits it into words, and each resulting word that is a valid URL stays a link.
* During a native text composition (an input method's marked text) the hyperlink check waits until the first edit after the composition.
* A hyperlink is editable character by character in Insert mode, including at its first and last characters. The caret and Normal-mode character motions can stop at each character inside a link. `Backspace` and `Delete` remove one character at a time within or next to a link, as they do for ordinary text.

When an edit changes linked text into a valid HTTP(S) URL, its clickable destination follows the displayed text, and the link color and underline update immediately. If the edited text is no longer a valid HTTP(S) URL, the link color and underline disappear immediately and the text remains editable. When further editing makes that text a valid HTTP(S) URL again, link behavior and styling return immediately. Editing a link does not turn unrelated text or neighboring links into part of that link. Pasting text inside an existing hyperlink follows the same rule: the clickable destination follows the new covered text, and the link disappears when that text is no longer a valid HTTP(S) URL.

### 13.1 Selecting, copying, cutting, and pasting linked text

`Cmd+A` visibly selects all text in the currently focused node, including its hyperlinks.

`Cmd+C` copies the selected text. When the selection contains hyperlinks, the clipboard content preserves both the text and the clickable hyperlink ranges.

In Vim Normal, `Cmd+C` copies the attached image to the system clipboard when the block caret is on the image and there is no text selection. It leaves the caret and the Vim register in place.

Copying does not clear or otherwise change the visible text selection.

`Cmd+X` cuts the selected text. When the selection contains hyperlinks, the cut clipboard content preserves both the text and the clickable hyperlink ranges.

Cutting writes the selection to the clipboard before removing it from the node. If the node's content changes while the clipboard write is still pending, the cut does not remove any text: the changed document is preserved and the application reports an operation error explaining that the text changed. The clipboard may already contain the original selection, and the intervening changes are not reverted.

Pasting that content into another node inserts the text and preserves its clickable hyperlinks. If only part of a hyperlink is selected, only the selected portion is pasted as a hyperlink when the selected text remains the complete URL; otherwise it is pasted as ordinary text.

### 13.2 Editable-node context menu

Secondary-clicking an editable node text field opens the native macOS context menu with Look Up, Search with Google, Cut, Copy, Paste, and Select All. The menu is available for both plain-text nodes and nodes containing hyperlinks, and is not available on read-only fields or other application controls. A selected text value is bounded to 256 Unicode code points for the native menu request; longer selections are truncated with an ellipsis, and the same bounded text is used by Look Up and Search with Google.

The editing commands use the same selection, clipboard, hyperlink, image-paste, multiline-paste, undo, and persistence behavior as their keyboard commands. Within one node, secondary-clicking inside an existing selection preserves it; secondary-clicking elsewhere places the insertion point there. Selection and caret state are never shared between nodes.

Example:

```text
abc|def
```

Paste:

```text
XYZ
```

Result:

```text
abcXYZdef
```

---

## 14. Multiline Text Paste

In Tree, each pasted line becomes a separate node. Agenda inserts multiline text into the existing node instead (§23.9).

Paste accepts LF, CRLF, and CR line endings. Normalizing these line endings preserves the text covered by every clipboard hyperlink.

The first line is inserted at the current cursor position.

The remaining original text is moved to the final resulting node.

The final resulting node receives focus, with the caret after the final pasted line and before the remaining original text. Date or hyperlink decoration of any pasted line must preserve this destination, including when it is outside the previous visible range.

Example:

Current node:

```text
abc|def
```

Paste:

```text
one
two
three
```

Result:

```text
abcone
two
threedef
```

The final node contains the remainder of the original text.

If the original node had an image:

* the image remains attached to the final node containing the remainder of the original text;
* newly created intermediate nodes have no image.
