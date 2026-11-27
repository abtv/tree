# Images

## 15. Image Paste

Image paste follows the one-image limit of §17.

Images are displayed after the node's text.

If the node has no image:

* attach the pasted image to the current node.

If the node already has an image:

* create a new sibling immediately after the current node;
* the new node has empty text;
* attach the pasted image to the new node;
* select the new node.

After image paste:

* place the cursor at the end of the text portion of the affected node;
* for an image-only node, the text portion is empty.

An image-only node does not display an empty text row before its image in Normal mode. In Insert mode, its focused empty text editor expands to a normal-height line so the insertion caret is visible; if Insert mode ends before text is added, the line collapses again. When text is added, it appears above the image.

Images are attachments, not independently draggable objects.

Dragging a node moves its image together with the node.

### 15.1 Image Text Recognition

On Apple Silicon macOS Electron, Tree recognizes English text in images so that global
Search can find them. Recognition is unavailable in the browser, Linux and Intel
Electron. Apple Vision processes the image locally without model downloads, network
calls, telemetry or task creation. Recognized text never becomes visible node text.

Pasting a new image recognizes its English text automatically, including image paste
in Agenda. The recognized text participates only in global Search (`Cmd+;`), which
can show a short matching excerpt (§20.14.2). Local Find and Vim `/` do not use it.
It does not create children, tags, dates, or status feedback, and never moves focus.
Failures leave the image usable without search text.
Existing images are not automatically backfilled.

Recognition runs outside the UI thread through a sequential queue. Pending work
retains only image identities and is retired when its source disappears. Closing or
reloading the renderer cancels native work. Preparing to quit or install an update
retires pending recognition and rejects new requests until the save flush ends. An
archive export does not cancel recognition. A result that arrives while saving is
locked is discarded. Pending recognition is not saved or resumed on restart. Each
image is limited to 25 MiB and the pixel limits of §17. Native work times out after
60 seconds; results are limited to 1 MiB and 1,000 entries.

`reindex-all-images` in the command panel repeats hidden English text recognition for
every unique image in the document, including images with completed results. It is
available on the platforms above, in Tree and Agenda. It uses the same sequential queue,
does not duplicate pending image requests, and creates no children or Undo steps.
Existing hidden text stays usable until recognition succeeds; failures retain it.
The command does nothing while saving is locked or shutdown recognition is suspended.
Queue storage contains image identities, not image bytes, and grows linearly with the
number of unique images. Results use the ordinary metadata save policy.

Hidden text is saved with the attachment and survives restart and archive round trips.
Deleting or replacing the image removes its hidden text from search immediately. Late
results follow the cancellation rules above. Completed text follows the image through
Undo/Redo without adding an invisible undo step or clearing redo. Hidden text is derived
data: older Tree versions may discard it when re-saving the document.

An image without a completed hidden recognition result has a yellow border and the
tooltip `Image text recognition is not complete`. This includes queued work, errors,
timeouts, interrupted work after restart, older images, and platforms without OCR.
A successful empty result counts as completed and removes the border. No automatic
retry occurs. The border does not change image geometry or replace the image-caret
indicator, and appears in Tree and Agenda, including the current-parent image.

## 17. Images and Attachments

Each node may contain at most one image attachment.

Images are stored as local attachments rather than embedded directly into the document data.

An attachment is PNG data of at most 25 MiB, with at most 32,767 pixels per side and at most 67,108,864 pixels in total.

An attachment reference stores the image's width and height in pixels, read from the PNG header when the image is pasted or dropped. The size is derived data, like hidden recognized text (§15.1): older Tree versions may discard it when re-saving the document. A stored size that is missing one value, is not a positive whole number, or exceeds the limits above does not prevent the document from opening; Tree ignores it.

When a document opens with images that have no stored size, Tree reads their PNG headers in the background after the document is displayed, without delaying startup. It stores the sizes without an Undo step and without a save of its own; the next ordinary save writes them. An image whose header cannot be read keeps no size until the next launch.

Attachments belong to their nodes.

Moving a node moves the attachment with the node logically; the attachment does not need to be copied to another location.

Deleting a node must also delete its attachment when that attachment is no longer referenced.

Deleting a subtree must clean up attachments belonging to deleted nodes when they are no longer referenced.

An attachment is no longer referenced only after every live document reference, every retained runtime (undo/redo) reference, and every valid retained recovery document reference is gone. A temporary or backup document that still references an attachment keeps that file available for recovery until a later save rotation removes the reference and a subsequent cleanup runs. Cleanup must not remove an attachment that a valid recovery document still references.

A failed attachment cleanup does not lock the editor and does not trigger document saves. It is surfaced to the user, retried at the idle interval for at most three consecutive failed attempts, and attempted again on the next document save or quit.

Image attachments must survive application restart.

A completed image insertion is flushed to local storage before the document that references it is saved, so an attachment that a saved document references is not lost to an abrupt application termination. Power-loss durability has the same storage-device cache limitation as document saves (§16.1).

### 17.1 Inline Presentation and Preview

An attached image is displayed inline beneath its node's text.

Inline images are constrained to a 200×200 CSS-pixel bounding box while preserving their aspect ratio. An image whose natural size exceeds the box is scaled down to fit. An image whose natural size is smaller than the box is displayed at its natural size; it is not enlarged.

An image with a stored size (§17) occupies its fitted box from the first frame in which its row is displayed, before its bytes load, so the rows below it do not move when it appears. This holds when a branch opens, when a list window moves to rows not yet displayed, for example after `G`, and when a node is left. When the decoded image's size differs from the stored size, the image is displayed at its decoded size and Tree corrects the stored size without an Undo step or a save of its own; the next ordinary save writes it.

A recently displayed image appears in the first frame when its row is displayed again, for example after Agenda closes or after leaving a node, without an empty placeholder. This holds while the image is in the bounded in-memory image cache; an image no longer in the cache loads again.

Clicking an attached image opens an image preview.

`Cmd+Y` opens the image preview for the selected node or the editable current parent when that node has an attached image, in every Vim mode and whether or not Vim mode is enabled. When neither the selected node nor the current parent has an image, `Cmd+Y` does nothing. The shortcut is scoped to Tree, where it previews attachments rather than files. [Finder uses the same shortcut for Quick Look](https://support.apple.com/en-us/102650).

The image preview is a modal overlay within the application window and can be closed immediately. If the image is still loading after 200 ms, the overlay shows `Loading image…`. An image that finishes loading after dismissal does not reopen the preview. When ready, the image is fitted within the available window area while preserving its aspect ratio, without enlarging it beyond its natural size.

* A trackpad pinch or `Cmd++` / `Cmd+-` zooms the preview image. `Cmd+=` also zooms in without requiring Shift. Zoom ranges from the initial fitted size to 16 times that size, including enlargement beyond natural size.
* Keyboard zoom uses the window center; pinch zoom keeps the point under the pointer in place until an image edge is reached.
* Two-finger scrolling and unmodified arrow keys pan the enlarged image in the corresponding viewing direction, stopping at its edges; an axis that fits stays centered.
* With Vim editing enabled, unmodified `h/j/k/l` pan like Left/Down/Up/Right, independently of the editor's Vim mode. These preview bindings take precedence over popup button navigation (§20.2.29).
* Zoom and pan affect only the image, leave the close button fixed and available, and never edit notes or change the application's page zoom.
* Reopening the preview restores the initial fit and centered position.
* Resizing the window refits the base image and constrains its current zoom and position to the new bounds.

Only one preview is open at a time. The preview has a visible close button and also closes on `Esc` and on a mouse click anywhere in the window, including on the image itself. When the preview opens, focus moves to the close button (§20.7 applies to how it was opened). Closing the preview returns focus to the element that was focused before the preview opened.

If an attached image cannot be displayed — because its stored bytes are missing, because reading them fails, or because the image data cannot be decoded by the browser — the application shows `Image could not be loaded.` in place of that image. This applies both to the inline image and to the preview. The message does not delete the attachment, does not report a document-save failure, and does not prevent the rest of the document from being edited or the preview from being closed.

When the inline image's box was reserved (its size is stored or was measured earlier), the message takes the image's place and keeps at least the box's height, so the rows below do not move when it appears. For an image shorter than one line of the message, the message keeps its own height.
