# Persistence

## 16. Persistence

The application automatically saves changes.

There is no Save button.

### 16.1 Automatic Save Policy

The application does not save on every keystroke.

A save is performed when:

* an image is inserted;
* a hyperlink is inserted;
* ten words have been inserted since the last successful save;
* no document change has occurred for ten seconds while changes are pending.

Editing the characters of an existing hyperlink is a text edit, not a new hyperlink insertion; it follows the word-volume, idle, and quit triggers rather than saving immediately for each changed URL.

Changes that do not insert content — creating, splitting, deleting, reordering, or undoing/redoing nodes, changing the selected node or a node's expansion, and changing an Agenda timeline day fold (§23.5) — do not by themselves trigger a save. They remain pending and are saved by the next volume, idle, or quit trigger.

Only inserted words count toward the volume threshold. Deletions and other changes still reset the idle timer and keep changes pending.

Every pending change is flushed before a normal quit completes. A pending Replace-mode replacement counts as a pending change: it is completed as one edit before that flush, so quitting or closing the window saves it.

Editing remains available while a normal quit waits for saves. Edits made while emoji history is being saved also finish saving before quit completes. A failure saving those late edits keeps the application open under the same rules as any other save failure.

After the final save, the desktop editor stops accepting edits before confirming quit to the main process. It stays closed to input while archive cleanup finishes. If the current quit request fails or times out, its input lock is released.

If a save fails, the pending changes are retained and the failure is surfaced. The application retries at the next idle interval. After three consecutive failed save attempts, the application enters the locked save-failure state defined in §16.2. A later successful save clears the error.

The document must persist between application restarts.

Every Tree release must open valid notes saved in any document format used by an earlier release. Users can upgrade directly from any earlier release, skipping any number of application releases and document format versions. Tree must preserve the notes when it migrates them and use the current document format on the next save.

The main window's size and position must persist between application restarts. On the next launch, the application restores the last saved size and position. If no valid window geometry has been saved, the application uses its default window size and position.

When the user quits, the application waits for queued automatic saves to finish. If saving cannot finish within five seconds or reports an error, the application remains open and displays the failure so the user can retry without silently losing changes. In the locked save-failure state, the user can also explicitly confirm quitting without saving, as defined in §16.2. A terminated renderer process is the exception defined in §21.
If a Find jump completes during saving, the final save includes its destination and the folds that Escape would leave (§20.2.31). A jump still pending when the final save completes cannot move the selection afterward.

Pending cut and paste operations, including image attachment writes, must finish and their resulting document changes must be saved before quit completes. Successful attachment cleanup does not resolve a failed document save; that failure remains visible and blocks quit until a document save succeeds.

The application keeps recent document generations. Each save preserves the document it replaces as a retained generation. When a generation written more than 30 seconds ago exists, Tree retains the newest such generation and the generations written after it. An abrupt termination can lose only work newer than the newest surviving generation. Spreading generations over time reduces the chance that a power loss removes every copy, but it does not guarantee it: a power loss can still lose recently flushed data because the storage device's own cache is not forced to stable media.

On load, the newest stored document that can be parsed and validated becomes the document, whether it is the primary file, a retained generation, or an interrupted save. The application must open that document rather than start empty or refuse to start. Unreadable or invalid candidates are skipped while older candidates are considered, and the loaded candidate becomes the primary file. Retained generations count as references during attachment cleanup, so recovery remains possible after the newest document is damaged.

A document opens even when an attachment file it references is missing; the affected image shows the image error instead of preventing the document from opening.

If stored document files exist but none can be loaded, loading fails without changing those files. If no document files exist, the normal first-launch behavior applies.

A primary file containing JSON `null` is invalid stored data, not a first launch. Loading shows an error and preserves the stored document files.

If the primary file declares a newer document format, Tree shows the load error and preserves the primary and its recovery files through an update attempt.
Tree also preserves a newer-format interrupted save whose modification time is equal to or later than the newest readable candidate. It keeps all attachments until a compatible version can open the notes. A strictly newer readable candidate can still recover an older interrupted save.

The following state must be persisted:

* the ordered top-level root nodes and their trees;
* stable node IDs;
* the current parent, or the root-level location when there is no current parent;
* the selected node, including a descendant displayed by inline expansion;
* each node's remembered inline expansion (§2.4);
* each explicit Agenda timeline day fold choice (§23.5);
* the scroll position, as where the selected node's row sits in the window.

On launch, the application scrolls so the selected node's row sits at the same distance from the top of the window as when the document was saved, or as close to it as a shorter window allows while showing the whole row, and keeps it there while rows and images finish laying out, until the user scrolls, types, or clicks. When scrolling had moved the selected row off-screen, it is shown at the nearest edge of the visible content area instead (below the toolbar at the top), so the selected node is always visible at launch.

Scrolling by the user is a pending change like a selection change, but it does not reset an idle timer that is already running, so continuous scrolling cannot postpone the idle save of an earlier change. Every save, including the quit flush, records the position shown at that moment.

The scroll position is restored only at launch; the restore does not apply to navigation within a running session.

The exact text cursor position does not need to be persisted.

The runtime navigation history does not need to be persisted.

Undo/redo history does not need to be persisted.

### 16.2 Locked Save-Failure State

A save attempt fails when the application cannot persist the current document.

After three consecutive failed save attempts, the application stops saving automatically and enters the locked save-failure state:

* every document-mutating command is disabled: text editing, creating and splitting nodes, deleting nodes, reordering, cut, paste including image paste, and undo/redo;
* navigation, selection, and copy remain available so the document can still be viewed;
* no further automatic save attempts are made;
* the save failure remains visible together with `Saving failed repeatedly. The last saved version is safe. Fix the problem and restart the application. Changes made since the last successful save are not saved.`

A paste started before the lock must not change the document or restart automatic saving when its clipboard read or image write finishes after the lock. An image already being written is cleaned up if no document references it.

Quitting and closing the window from the locked state still attempt a final save:

* if the save succeeds, the application exits with every pending change persisted;
* if the save fails, the application asks `Quit without saving? Changes made since the last successful save will be lost.` Confirming quits without saving, and the next launch opens the newest stored version that can be parsed and validated. Cancelling keeps the application open.

The quit confirmation takes focus above other open surfaces, including About, Search and a Find draft. Cancel restores the previous surface and its input. The user can immediately retry a reported save failure.

A failed save, including when the storage is full, must never destroy or damage the previously saved document. The next launch opens the document that the load rule of §16.1 selects.
