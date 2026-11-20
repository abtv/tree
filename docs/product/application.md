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

### 9.1 Cmd+Q

`Cmd+Q` quits the application, including when focus is in an editable node.

### 9.2 Window Close

Closing the main window quits the application on macOS, including when the application is inactive. It follows the same save-before-quit behavior as `Cmd+Q`: §16.1 defines that behavior, §16.2 defines quitting in the locked save-failure state, and §21 defines the exception for a terminated renderer process.

### 9.3 Application Menu

The command panel (§20.2.28) also runs Quit, Always on Top, Vim Editing, and the Appearance choices through the same application services as these menu items.

The menu bar has five menus, laid out as macOS applications do (§1.3):

* **Tree** holds **Quit Tree** (`Cmd+Q`, §9.1).
* **File** holds **Export Notes…** and **Import Notes…** (§25).
* **Edit** holds a **Vim Editing** check item, checked while Vim editing is enabled (§20.2).
* **View** holds **Tree** and **Agenda**, then a separator and an **Appearance** submenu with five mutually exclusive items: **Automatic**, **Light**, **Dark**, **Gray**, and **White**. The item for the current appearance choice is checked (§20.5).
* **Window** holds an **Always on Top** check item, checked while the window floats above other windows.

The Appearance and Vim Editing items have no status-bar toggles. Choosing Vim Editing enters Normal mode or returns to standard editing with the caret kept (§20.2.3); the choice is saved and restored at the next start. Always on Top agrees with the pin toggle: either control pins or unpins the window, keeps editor focus, and saves the choice. The menu check marks and corresponding window, appearance and editing states always agree, including at startup. A newer selection made during startup takes precedence over an earlier preference read, including for the first editor keystroke.

Tree and Agenda invoke the same named view commands as the command panel (§20.2.28), without additional shortcuts. Selecting the already open view does nothing. Switching views finishes buffered editing and follows the origin/caret behavior (§23). These commands do nothing while no renderer is available or while its main frame is loading. The native Tree, Agenda, Export Notes… and Import Notes… items have text labels and show macOS symbols for connected nodes, a calendar, export and import. Other native items have their standard text/check-mark presentation.

If the command panel is open, a menu view command first closes it and restores the editing surface before applying the named command. While a modal dialog or image preview is open, menu view commands do nothing and leave the modal's focus and return target intact. Browser view actions use the same preparation.

---

## 21. Unexpected Renderer Errors

If the renderer encounters an unexpected error while rendering, the application must not leave the window blank.

Instead, it displays an error message and a `Reload` action. Reloading restarts the renderer and loads the last saved document.

Changes that were queued in memory but not yet persisted may be lost when the user reloads.

If the renderer process itself terminates, its unsaved changes are already lost and no save can be confirmed. Quit and closing the window then quit the application immediately, without the save-before-quit wait of §16.1. A quit already waiting for a save when the renderer terminates completes the same way. If the renderer reloads while a quit waits, that quit ends without a save-failure message, and the next Quit saves through the reloaded renderer.

---

## 26. Desktop App Updates

The owner selects desktop releases by explicitly increasing the version; ordinary
commits do not release another desktop version.

Packaged macOS builds check published stable GitHub releases at startup and when
connectivity returns. Downloads run in the background without stealing focus;
offline or failed downloads leave the installed application usable. Development
builds do not check. No notes are sent. Prereleases and downgrades are excluded.

During a download, the left side of the desktop status bar shows the noninteractive
text `Downloading update… <percent>%`. Once the package is downloaded it shows
`Update ready`, without a button or click action. Installation remains available
through the Tree menu and its command-panel equivalent. Command input, command
feedback and current-action status messages take priority over this indicator.
Downloading continues while the indicator is hidden; dismissing higher-priority
content restores the current download status. Background checks alone show no status.

Failed checks or downloads show `Update failed. Check for Updates to retry.` instead
of leaving a stale percentage. Saving and preparing installation show
`Preparing to restart…`. These messages have the same low priority as download progress.
Progress is published only when the whole percentage changes, uses bounded memory,
and performs no document writes, traversal or editor rerenders.

The native Tree menu always contains **Check for Updates…** after About Tree, followed
by **Restart and Install Update**, which becomes `Restart and Install <version>`
when a package is ready. The command panel shows the same version in its description.

Check for Updates checks and downloads an available update, then
shows a native result dialog: `Tree is up to date.`, `An update is ready to install.`
with instructions to restart and install that version, or `Could not check for updates.` with retry
guidance. Manual and background checks share one in-flight request; repeated manual
requests show at most one result dialog. Both commands are disabled while checking,
applying, or displaying a modal. Development builds disable both commands.

Checks still contact the release provider when a package is ready. A failed recheck
reports failure even if the previous package remains ready. Once another available
package begins downloading, the previous package is no longer offered for installation;
only the newly completed package becomes installable. A failed download can be retried
through Check for Updates. Checks and installation cannot run concurrently.

Restart and Install stays disabled until the package is downloaded, following the native
menu convention of keeping unavailable commands visible. It is also unavailable
during a notes operation. A document load error allows installation of a downloaded
update and preserves the unopened document.

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
uses the existing persistence flush. Download/cache storage is proportional to the
application package; update state and listeners are bounded and independent of note count.
