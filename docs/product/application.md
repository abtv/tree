# Application

## 9. Activation, Quit, and Application Menu

`Cmd+0` surfaces and activates the application.

It must work even when the application is not currently focused.

Behavior:

* if the application is minimized, restore the main window;
* if the application is inactive, bring it to the front and activate it;
* if the application is already active, do nothing.

When About is open, activation preserves the dialog and its focus within the main
window. Restoring a minimized main window must not dismiss About.

`Cmd+0` changes only application/window focus. It preserves the selected node, the text field that contains the caret, and the caret position.

`Cmd+0` must not change:

* current node;
* current parent;
* selected node;
* cursor position;
* undo history;
* redo history;
* navigation state.

Returning to the main window by any means — `Cmd+0`, the Dock, the application switcher or another window — keeps keyboard focus on the element that had it when the window was left, including after the application was hidden or minimized. The editor keeps its caret, selection and Vim mode, so the next key acts on it. Becoming active again does not move focus to another control, such as the first button of the location path.

When leaving the window closes the focused surface, as it cancels unconfirmed search entry (§20.2.26), the editor that the surface came from takes focus back, as with Escape. When the element that had focus no longer exists for another reason, the platform's default focus applies.

### 9.1 Cmd+Q

`Cmd+Q` quits the application, including when focus is in an editable node.

### 9.2 Window Close

Closing the main window quits the application on macOS, including when the application is inactive. It follows the same save-before-quit behavior as `Cmd+Q`: §16.1 defines that behavior, §16.2 defines quitting in the locked save-failure state, and §21 defines the exception for a terminated renderer process.

### 9.3 Application Menu

The command panel (§20.2.28) also runs Quit, Always on Top, Vim Editing, and the Appearance choices through the same application services as these menu items.

The menu bar has five menus, laid out as macOS applications do (§1.3):

* **Tree** holds **About Tree** and the update commands (§1.3, §26), then **Quit Tree** (`Cmd+Q`, §9.1).
* **File** holds **Export Notes…** and **Import Notes…** (§25).
* **Edit** holds the Find and global Search commands (§20.2.26) and a **Vim Editing** check item, checked while Vim editing is enabled (§20.2).
* **View** holds **Tree** and **Agenda**, then a separator and an **Appearance** submenu with five mutually exclusive items: **Automatic**, **Light**, **Dark**, **Gray**, and **White**. The item for the current appearance choice is checked (§20.5).
* **Window** holds an **Always on Top** check item, checked while the window floats above other windows.

The Appearance and Vim Editing items have no status-bar toggles. Choosing Vim Editing enters Normal mode or returns to standard editing with the caret kept (§20.2.3); the choice is saved and restored at the next start. Always on Top agrees with the pin toggle: either control pins or unpins the window, keeps editor focus, and saves the choice. The menu check marks and corresponding window, appearance and editing states always agree, including at startup. A newer selection made during startup takes precedence over an earlier preference read, including for the first editor keystroke.

Tree and Agenda invoke the same named view commands as the command panel (§20.2.28), without additional shortcuts. Selecting the already open view does nothing. Switching views finishes buffered editing and follows the origin/caret behavior (§23). These commands do nothing while no renderer is available or while its main frame is loading. The native Tree, Agenda, Export Notes… and Import Notes… items have text labels and show macOS symbols for connected nodes, a calendar, export and import. Other native items have their standard text/check-mark presentation.

If the command panel is open, a menu view command first closes it and restores the editing surface before applying the named command. While a modal dialog or image preview is open, menu view commands do nothing and leave the modal's focus and return target intact. Browser view actions use the same preparation.

### 9.4 About Tree

#### Desktop Application

About Tree opens an inline modal dialog and shows the
application version from the root `package.json`, also used for the packaged app,
followed by its UTC build date in English. The panel also shows a clickable
**GitHub repository** link to `https://github.com/abtv/tree`, opening in the default browser.
The dialog shows Tree's application icon, `© 2026 Andrei Butov` and `Licensed under the MIT License`,
with **MIT License** linking to `https://github.com/abtv/tree/blob/main/LICENSE`.

The About dialog uses the main application's selected palette (§20.5),
including its background, text and links. Automatic follows the system appearance.
It opens centered in the main window's content area and disappears as a whole when dismissed.
It shares the main window's renderer, including on first opening, and cannot move outside the main window.

It blocks interaction with its parent until closed with Escape or the focused **Close**
button (also activated by Enter), or a click in the main window's content outside About.
The outside click only dismisses About; it does not act on the editor.
Closing restores the previous focus and selection without changing editor state.
Repeated About commands focus the existing dialog. It closes with the main window.

While it is open, editor, view, data and Always on Top menu actions are disabled;
About Tree, Quit Tree and Appearance remain available. Closing restores the menu actions.
The shared inline dialog replaces the native About panel so its colors match Tree and it opens promptly.

#### Browser Version

About Tree in the browser's ellipsis menu opens the shared modal dialog with the desktop About dialog's icon,
title, version, copyright, license and repository links, using the selected palette.
Close, Escape and clicking outside the dialog dismiss it and restore the previous editor focus and selection.
The information appears in the dialog rather than the menu.

All builds show the root
`package.json` version and UTC build date in English, for example
`Version 0.1.2 · Oct 29, 2026`. Both values are fixed at build time and describe the
loaded app, including offline and while a newer update is waiting.

A **GitHub repository** link opens
`https://github.com/abtv/tree` in a new tab.
The dialog reads `© 2026 Andrei Butov` and `Licensed under the MIT License`.
**MIT License** opens `https://github.com/abtv/tree/blob/main/LICENSE` in a new tab.

---

## 21. Unexpected Renderer Errors

If the renderer encounters an unexpected error while rendering, the application must not leave the window blank.

Instead, it displays an error message and a `Reload` action. Reloading restarts the renderer and loads the last saved document.

Changes that were queued in memory but not yet persisted may be lost when the user reloads.

If the renderer process itself terminates, its unsaved changes are already lost and no save can be confirmed. Quit and closing the window then quit the application immediately, without the save-before-quit wait of §16.1. A quit already waiting for a save when the renderer terminates completes the same way. If the renderer reloads while a quit waits, that quit ends without a save-failure message, and the next Quit saves through the reloaded renderer.

---

## 26. Desktop App Updates

Packaged macOS builds check published stable GitHub releases at startup and when
connectivity returns. These checks fetch release information, not the application
package. Only an explicit **Download Update** command starts the package download.
It runs without interrupting editing. Development builds do not check. No notes
are sent. Prereleases and downgrades are excluded.

During a download, the left side of the desktop status bar shows the noninteractive
text `Downloading update… <percent>%`. Once the package is downloaded it shows
`Update ready`, without a button or click action. Installation remains available
through the Tree menu and its command-panel equivalent. When a version is available but
not downloaded, the status reads `Update available. Choose Download Update.` Command input, command
feedback and current-action status messages take priority over this indicator.
Downloading continues while the indicator is hidden; dismissing higher-priority
content restores the current download status.

Background checks show no in-progress indicator. A check can still report an available
update or a failure in the status bar.

Failed checks show `Update failed. Check for Updates to retry.` Failed downloads show
`Download failed. Try Download Update again.` and do not retry automatically.
Finding the same version on a later check does not dismiss the download failure.
Saving and preparing installation show
`Preparing to restart…`. These messages have the same low priority as download progress.
Progress is published only when the whole percentage changes, uses bounded memory,
and performs no document writes, traversal or editor rerenders.

The native Tree menu always contains **Check for Updates…** after About Tree. The
next action is `Download Update <version>` when there is an undownloaded update, and
`Restart and Install <version>` when the download is complete. Without an update it
shows disabled **Restart and Install Update**. The panel exposes these actions as
`download-update` and `update-app`, with the same labels and availability as the menu.

Check for Updates fetches release information and shows a native result dialog.
It reports that Tree is up to date, an update is available to download, a package is
ready to install, or the check failed. The dialog never starts a download. Manual
and background checks share one in-flight request; repeated manual requests show
at most one result dialog. Both commands are disabled while checking, downloading,
applying, or displaying a modal. Development builds disable both commands.

Checks still contact the release provider when a package is ready. A failed recheck
reports failure even if the previous package remains ready. A successful check that
finds the same version keeps an already downloaded package ready. Finding a different
version replaces the offer and requires a new explicit download. A successful check
that finds no available update removes the offer to download or install the previous
version. This does not cancel work already handed to the macOS installer. A download
or install choice applies only to the version shown when the user chose it. Checks,
downloads and installation cannot run concurrently.

Restart and Install requires a downloaded package and is unavailable during a notes
operation. A document load error allows installation of a downloaded update and
preserves the unopened document.

Applying the update blocks editing, saves pending work including Vim buffers and attachments, and
asks the macOS installer to verify, install and restart Tree. A failed or timed-out
save leaves the application open and editable; it never offers to discard notes
to install an update. Repeated requests do not start concurrent installations.
When the user retries after a failure, a late response from the earlier attempt cannot
restore editing during the retry's save or installation. If the previous native operation
is still running, the saved retry waits for it before starting another installation.

An installation error or preparation timeout restores editing and allows another attempt. The timeout
message also offers quitting and reopening Tree to recover from an unresponsive macOS installer.
Ordinary Quit does not initiate installation of an update the user has not requested.
Closing the window or choosing Quit while macOS is still preparing the package uses the ordinary save-and-quit path. The installer takes over closing windows when Tree calls it to quit and install. If installation fails while the document cannot open, both errors remain visible.

Update checks add no document writes or document traversal. Explicit installation
uses the persistence flush of §16.1. Download/cache storage is proportional to the
application package; update state and listeners are bounded and independent of note count.
