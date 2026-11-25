# Browser Version

### 1.4 Browser Version

The browser version under `src/web/` can be built as
static files for HTTPS hosting. Once hosted, using it requires no local server.
Static hosting does not change the shared editor, compact ellipsis menu, appearance choices,
Agenda and Vim behavior. The browser version has no synchronization or accounts;
installation, offline access, app updates, storage protection, exporting, importing, backing up and restoring notes are defined in §24.

While an image preview is open, the browser's ellipsis menu button is hidden.
Closing the preview restores it. The preview close button stays 16 pixels from
the top and right edges of the content area.

The browser's ellipsis menu ends with **About Tree** below the Update App
button when present. It opens the About dialog, which §9.4 defines.

The browser Tree menu temporarily borrows editing focus. Closing it with Escape,
its trigger, or a setting action returns focus to the previous connected Tree or
Agenda editor/row, keeping the caret, selection direction and editing mode/session.
View changes and Vim toggles apply their own documented result.

The browser menu shows decorative icons beside Tree, Agenda, Export Notes… and Import Notes…; these items have text labels and accessible names. Tree and Agenda reuse their location glyphs; export and import use arrows pointing out of and into a tray. All menu labels share a text column, with a separate icon column. Icons inherit the item's normal, focused or disabled color; check marks are at the trailing edge. Other actions are text-only. When folder actions are available, a separator places them in their own text-only group below export/import, keeping each group's icon treatment consistent (§1.3).

An action that opens a dialog or file picker returns editing focus before opening it; the dialog then
owns focus, and cancellation/dismissal returns to the editor. A focused activity
message also returns editing focus when dismissed. No extra Tab is required.

Tab and Shift+Tab keep native menu navigation; leaving the menu or clicking another
control keeps that explicit destination. Without a connected previous editor, native
control focus remains. Opening/cancelling the menu creates no document edit or extra
save; buffered edits follow their ordinary commit rules when focus moves on.

When Tree detects an iPhone, iPad or Android device, it uses standard editing and
hides the Vim menu option, command-panel entry and mode indicator, even with an
external keyboard attached. Detection uses the browser's identity, including the
Mac identity with multiple touch points that iPadOS reports. An Android browser
requesting the desktop site can report a desktop identity that does not match
these checks. Vim editing then remains available.
When Tree disables Vim this way, it ignores the saved Vim preference without
overwriting it.

In the browser, rich text fields enable native editing in standard editing and
Vim Insert/Replace modes. Normal and Visual modes keep the same focusable field
without native editing, avoiding browser editing work during navigation. Mode
changes preserve text, focus, caret, selection and application editing commands.
These rules do not apply to plain textareas or to desktop editing.

Existing browser notes must not be cleared or migrated by building or installing
the package. Notes belong to the browser profile and exact origin: localhost and
the permanent HTTPS address have separate storage. The browser save and storage
limitations are described in [Browser version](../../src/web/README.md).

Only one Tree tab or installed window may edit an origin's notes at a time. If
startup cannot open local storage after acquiring ownership, that page retains
ownership until it closes or reloads. It shows: `Tree could not open local storage.
Reload this tab to try again. To use Tree in another tab, close this tab first.`
The editor does not open on this failure.

The browser Quit command flushes pending edits and requests window closure only
after saving succeeds. It does not show a successful-save dialog. If the browser
refuses scripted closure, the saved editor stays open and the user can close it
with the browser's window controls. A failed flush keeps the editor open and
shows the save failure. Native browser closing shows a warning for
pending edits. An accepted cut or paste counts as pending while it waits for clipboard or image data.
Undoing to the previously saved text also remains pending while an older write can replace it.
The save status and close warning cover both cases. Dismissing the warning lets Tree finish saving.

Copying a stored image starts the browser clipboard request during the user's
command while its image data loads asynchronously. A missing image or denied
clipboard access reports an operation error and leaves the document unchanged.
An image-read failure is handled even when it occurs before the browser consumes
the clipboard data; it must not also become an unhandled page error.

Browser keyboard paste uses the clipboard data supplied by the native paste event,
without requesting separate clipboard-read confirmation. Tree handles that data
through its text/image paste, size-limit, undo and save rules.

### 1.5 Keyboard Modifiers Outside Apple Platforms

The primary modifier is Cmd on Apple platforms (macOS, iOS, iPadOS) and Ctrl on every other platform. The supported desktop product targets macOS; Linux Electron smoke tests do not establish Linux desktop product support. This section defines the browser version's non-Apple shortcuts (§1.4), targeting Linux and Windows.

Outside Apple platforms, every Cmd shortcut in this document runs on Ctrl with the same Shift and Alt qualifiers, and the label `⌘Q` shows as `Ctrl+Q`. Option is Alt. The rules below settle the differences.

* Super/Meta combinations have no command. AltGr is character entry, never a shortcut.
* `Cmd+Left` and `Cmd+Right` are `Home` and `End`. `Option+Left` and `Option+Right` are `Ctrl+Left` and `Ctrl+Right`. In Agenda rows without an editor the same keys apply. `Home` and `End` never cross a node (§4.3); `Ctrl+Left` and `Ctrl+Right` behave as `Option+Left` and `Option+Right` do.
* `Ctrl+click` opens a link, and holding left Ctrl shows the link cursor. Ctrl+click is no context-menu gesture there.
* In Vim Normal, `Ctrl+D`, `Ctrl+U`, `Ctrl+O` and `Ctrl+R` stay Vim commands, because the application has no such Cmd shortcut. In the other non-Insert Vim modes they stay blocked. `Ctrl+V` pastes.
* In Vim Normal, `Ctrl+A` and `Ctrl+X` change numbers (§20.2.10), taking precedence over Select All and Cut. Outside Normal they have their application or native behavior.
* In the non-Insert Vim modes every unmapped Ctrl combination is blocked. In standard editing and Vim Insert it keeps its native behavior.
* `Ctrl+N` and `Ctrl+P` move the selection while a completion popup or the command panel is open (§20.2.28, §20.9.3). Otherwise `Ctrl+P` opens or closes Agenda.
* A bare Control keydown neither dismisses suggestions nor discards a pending Vim command.

| Shortcut | Consequence |
| --- | --- |
| `Ctrl+0` | Does nothing while a node has focus, like `Cmd+0`; the browser zoom reset is unavailable there. |
| `Ctrl+Y` | Previews an image; it does not redo. Redo is `Ctrl+Shift+Z`. |
| `Ctrl+Backspace` | Deletes the node; it does not delete a word. Undo restores it. |
| `Ctrl+P` | Opens Agenda; it replaces Print. |
| `Ctrl+N` | Cycles suggestions when delivered. Chrome assigns it to a new window, so it may not reach the page. Arrow keys remain available. |

## 24. Browser Data Safety

The browser version keeps notes in the storage of one browser profile and origin (§1.4). Clearing site data or deleting the profile removes them. This section defines how the user keeps an independent copy.

The controls are in a **Data** block of the ellipsis menu, below the Appearance choices and above the save status. They have no dedicated keyboard shortcuts and must also be available in the command panel (§20.2.28). Tree never prompts for them at startup.

Nothing in this section sends notes over the network. Notes leave browser storage only as a file or folder that the user chose.

### 24.1 Installation and Storage Protection

The browser version provides a web app manifest, so browsers that offer installation, such as Chrome on macOS, can install it as **Tree** in its own window. The installed app uses the same origin, storage and notes as the browser tab. It has a 192- and 512-pixel icon and an Apple touch icon taken from the Tree icon artwork, with transparent corners. Offline access and app updates follow §24.7 in both the installed app and an ordinary browser tab; installation is optional.

The browser's window color follows the Appearance choice (§20.5), including when the choice changes. An installed window launched in Dark, Gray, or White can briefly show the Light surface color from the manifest before the page applies its appearance. The browser manifest has a single startup color.

After the editor opens, Tree asks the browser once per page load to keep its storage when space runs low, unless the browser already reports persistent storage. The request never delays startup and shows no prompt of Tree's own. A refusal or an error changes nothing else. Persistent storage does not protect against clearing site data or deleting the profile, so export and folder backup remain the independent copies.

The ellipsis menu shows the result below the save status: `Storage is protected from automatic clearing.` or `Storage is not protected from automatic clearing.` Browsers without the storage API show no line.

### 24.2 Notes Archive

A notes archive is one ZIP file with the layout of the desktop data directory:

* `document.json` is the first entry. It holds the saved document in the stored schema as compact JSON, compressed with Deflate.
* Each referenced image follows as `attachments/<id>.png`, in ascending order of attachment ID, stored without further compression.
* The archive contains no other entries, no directory entries and no preferences.

Extracting an archive produces a folder that the desktop application opens as its data directory.

An archive holds at most 65,535 entries (`document.json` and 65,534 images). `document.json` is at most 256 MiB, each image at most 25 MiB (the attachment limit of §17), and the complete archive at most 2,147,483,647 bytes. Archives never use ZIP64 records.

### 24.3 Export

**Export Notes…** is available in every supported browser. It is disabled in the locked save-failure state (§16.2) and while another export or an import (§24.4) runs.

Choosing it closes the menu and first saves pending edits, as Quit does. It then exports the saved document and every referenced image in browser storage. Stored images that the document does not reference are not exported. Export never changes the stored notes.

Export runs in the background, and editing remains available. Changes made after the export started are not part of the archive.

While it runs, an activity in the bottom status bar shows `Exporting Notes…`, then `Exporting Notes… 3 of 120 images`, with a **Cancel** button. Cancel stops the export immediately, closes the activity and produces no file.

On success the browser downloads the archive as `Tree Notes YYYY-MM-DD.zip`, named with the local date, to its usual download location. The bottom status bar shows `Exported “Tree Notes 2026-10-20.zip”.` without an **OK** button and closes after five seconds.

A referenced image that is missing from browser storage, or stored there as empty or oversized data that an archive cannot hold, does not stop the export. The image is left out, the result adds `1 image could not be found and was not included.` (or the count of such images), and the panel stays until **OK**. This matches §16.1: a document opens with a missing image and shows the image error.

Export produces no file and leaves the notes unchanged when:

* pending edits cannot be saved: `Export failed. Your latest changes could not be saved: <reason>`;
* browser storage holds no saved document, for example after site data was cleared while the page was open: `Export failed. There are no saved notes to export.`;
* the stored document is invalid: `Export failed. The saved notes are invalid, so they cannot be exported.`;
* the notes exceed a limit of §24.2: `Export failed. Your notes have too many images to export as one archive.`, `Export failed. Your notes are too large to export as one archive.` or `Export failed. Your notes and images are too large to export as one archive.`;
* browser storage cannot be read: `Export failed. The notes could not be read: <reason>`;
* the background export cannot start or stops for another reason: `Export failed. The export stopped unexpectedly.`

A failure activity stays until **OK**. It remains visible alongside the save-failure message of §16.2 in the bottom status bar.

In a browser that supports folder backup (§24.5), an archive-limit refusal adds `Use Back Up to Folder… instead.`

### 24.4 Import

Desktop import uses the same archive validation with the replacement behavior of §25.

**Import Notes…** is available in every supported browser. It is disabled in the locked save-failure state (§16.2) and while an export or another import runs. It stays available when the stored document cannot be opened, so an archive can replace invalid stored notes.

Choosing it closes the menu and opens the browser's file chooser. After a file is chosen, Tree saves pending edits, as Quit does, and checks the archive in the background while editing remains available. The panel of §24.3 shows `Importing Notes…`, then `Importing Notes… 3 of 120 images`, with **Cancel**.

Tree accepts only an archive as export writes it (§24.2):

* The ZIP end record is the last part of the file. Comments, extra fields, ZIP64 records, split archives and encryption reject the archive.
* Each entry is Stored or Deflate and named exactly `document.json` or `attachments/<id>.png`, without a byte-order mark. The ID has at most 251 characters (the file-name limit of the desktop data directory) and uses only letters, digits, underscores and hyphens.
* Any other name rejects the archive, as do directory entries and two names that differ only in letter case. An archive that the Finder or another tool re-packed, for example with an added folder level, `__MACOSX` or `.DS_Store`, is therefore rejected.
* The limits of §24.2 apply to the declared sizes and to the bytes actually produced. Each entry must match its declared size and CRC-32, and its local header must repeat its central-directory record.
* `document.json` must be a saved document, without a byte-order mark, that opens as described in §16.1.
* Each image that the document references must be a PNG within the attachment limits of §17 that the browser can decode.

Entries that the document does not reference are ignored and not stored. A referenced image that the archive does not contain does not reject it; its node shows the image error of §17.1. An image that is already stored under the same ID with equal bytes is kept; different bytes reject the archive. Import never replaces or deletes a stored image.

Before anything is replaced, a dialog **Replace Current Notes?** compares the archive with the current notes:

* `“Tree Notes 2026-10-20.zip” (2.5 MB) contains 1,234 nodes and 56 images.`
* `Your current notes have 987 nodes and 40 images. Importing replaces them, and this cannot be undone.` The counts are those saved when the archive check ends. Without stored notes it says `There are no saved notes in this browser.`; with invalid stored notes, `The notes saved in this browser are invalid and cannot be opened. Importing replaces them.`
* When images are missing: `3 images that the notes use are not in the archive. Their nodes will show “Image could not be loaded.”`

The dialog's buttons are **Export Current Notes First**, **Replace Notes** and **Cancel**. Cancel is the default button, and Escape also cancels, because replacing the notes is destructive (§1.3). Export Current Notes First runs the export of §24.3 with the dialog still open and shows its progress and result in the dialog; it is hidden when there are no valid stored notes.

**Replace Notes** shows `Replacing Notes…` in the dialog and disables its buttons and Escape. It saves pending edits, then replaces the stored document in one step and reloads the page, which opens the imported notes. The replaced document is not kept elsewhere; Export Current Notes First keeps a copy. Import does not change preferences.

If the background import stops while those pending edits are still being saved, the import fails without reloading and the current notes remain writable. Finishing that save later must not resume the failed import or affect a new attempt. If the background import stops after storage replacement has been requested, its result may be unknown; Tree reloads to open the document that storage contains.

Cancel, at any point before Replace Notes, leaves the notes unchanged. A failure known to occur before storage replacement shows `Import failed. <reason>` in the panel until **OK** and leaves the notes unchanged. In both cases the images that the import already stored are removed. When the tab closes or reloads before the notes are replaced, those images are removed the next time Tree opens. The reason names the first problem found, for example:

* `The file is not a Tree notes archive, or it is damaged.` or `The import stopped unexpectedly.`
* `The archive contains “__MACOSX/._document.json”, which a Tree notes archive cannot contain. Import the original file that Tree exported.`
* `“attachments/a1.png” is damaged.` or `“attachments/a1.png” is not a usable image. <reason>`
* `document.json does not contain valid Tree notes. <reason>`
* `“attachments/a1.png” differs from an image that is already stored with the same ID.`
* `Your latest changes could not be saved: <reason>` or `Your notes could not be replaced: <reason>`

### 24.5 Automatic Folder Backup

**Back Up to Folder…** appears in the Data block only when the browser provides a directory picker and writable file handles (Chromium-based browsers). Like the other Data controls, it follows the shortcut and command-panel rule of §24. Choosing it opens a read/write folder picker. Cancelling leaves the backup choice and all files unchanged. It is disabled while another Data operation runs or editing is locked (§16.2).

A new folder starts a backup after pending edits are saved and the folder choice is stored. The choice belongs to this browser profile and origin and is stored with Tree's other preferences. An active backup changes the command to **Stop Backing Up**. Stopping removes the choice and stops the worker; it never removes files. Choose Back Up to Folder… again to change folders.

If the chosen folder contains `document.json`, Tree opens **This Folder Already Contains Notes** with the folder name and an explanation of replacement. It offers **Restore from This Folder**, **Replace Backup with Current Notes**, **Choose Another Folder**, and default **Cancel**. Escape cancels. Nothing is overwritten before an explicit Replace choice. Unrelated folder content and existing image files are kept.

Restore from This Folder restores the chosen folder as described in §24.6. It does not enable automatic backup.

The worker makes one backup at startup, then coalesces successful browser saves. Runs start at least 10 seconds apart, with a deadline that continuous typing cannot postpone. A saved version waits at most 10 seconds for the next run when no run is in flight; folder I/O time adds to this delay. Closing the page stops the worker without waiting or warning; saved notes remain in IndexedDB and the next start copies them.

The folder uses the desktop data-directory layout (§24.2), without ZIP compression or preferences. Each run reads the saved document once and writes compact `document.json`. The worker scans `attachments/` once at startup and writes each missing referenced image once, closing each file before writing the document. An image-write failure leaves the previous document intact. A referenced image missing from browser storage is skipped and counted, as in export. Backup never deletes files or rewrites known image files.

An empty image file left by a failed write is not a completed image; the next startup retries it. An image name that differs only in letter case from an existing file rejects the run before overwriting it, with a message to choose a different folder. This protects case-insensitive destination filesystems.

The bottom status bar shows muted backup status: `Folder backup is off.`, `Backing up to “Tree Backup”…`, or `Backed up to “Tree Backup”.` Missing images add their count and say they were not included. Failures say `Backup failed. <reason>`, distinguishing a missing folder or full destination. They retry at the same interval and on later saved versions. Failures affect backup only; browser editing and saving remain available.

Startup checks permission without prompting. If access is not granted, the footer says `Backup paused — permission needed. Choose Resume Backing Up…`, and the command becomes **Resume Backing Up…**. Its dialog offers **Resume Backing Up**, **Stop Backing Up**, **Choose Another Folder**, and default **Cancel**. Only the Resume click requests write permission. Worker startup failures also offer Resume. A small dot and accessible attention label on the ellipsis button appear only for failure or permission-needed states and clear after success or stopping.

Use one backup folder for one browser profile on one computer. Two computers writing the same folder, including through iCloud Drive, can overwrite each other's notes. Selecting a synchronized folder lets that service copy the unencrypted notes off the machine. Tree itself performs no network transfer. Browser folder writes do not provide desktop recovery generations or a power-loss guarantee.

### 24.6 Restore from Folder

**Restore from Folder…** follows Back Up to Folder… in the Data block and appears under the same browser condition (§24.5). It is disabled in the locked save-failure state (§16.2) and while an export, import or another restore runs. It stays available when the stored document cannot be opened and when browser storage was cleared, so a backup folder can recover the notes. Tree never offers it at startup.

Choosing it closes the menu and opens a read-only folder picker, which starts where the backup picker was last used. Cancelling the picker changes nothing and shows nothing. Restoring needs no write permission and never writes to the chosen folder.

Tree reads only `document.json` and the `attachments/<id>.png` files that it references. Other folder content is ignored; the reject-everything-else rule of §24.4 applies to archives only. Restore then uses the validation, limits, staging, image-conflict checks, progress panel and confirmation of §24.4, with these differences:

* The panel shows `Restoring Notes…`, then `Restoring Notes… 3 of 120 images`, with **Cancel**.
* The confirmation names the folder and the total size of the files read: `“Tree Backup” (2.5 MB) contains 1,234 nodes and 56 images.` It says `Restoring replaces them`, and missing images are reported as not in the folder.
* A failure shows `Restore failed. <reason>` until **OK**. Besides the reasons of §24.4, a folder without `document.json` gives `“Tree Backup” does not contain document.json. Choose the folder that Tree backed up to.`; a folder that cannot be read gives `The folder could not be read: <reason>`; a browser storage failure gives `The notes could not be restored: <reason>`; a picker that fails gives `The folder could not be opened: <reason>`; and a stopped background check gives `The restore stopped unexpectedly.`

Cancel and failures reported before storage replacement keep the current notes unchanged and remove the images that the restore stored, as in §24.4. An unknown result after replacement was requested reloads as in §24.4. Restore does not change the backup choice. An active backup keeps running and, after the reload, copies the restored notes to its folder as its next version. An active backup trails the saved notes by seconds and keeps no earlier versions, so restoring from its own folder returns the latest saved notes, not an earlier state.

### 24.7 Offline Access and App Updates

The hosted browser version downloads its complete application package on the first online
visit. The ellipsis menu says **Ready to work offline** only after installation succeeds.
After that, Tree can open after a browser restart without Internet, edit and save local notes,
display stored images, and run its local archive operations. External links still require
their destination to be reachable. The first visit and restoring a removed application cache
require Internet. Clearing site data also removes local notes (§24); installation is not a backup.

If a deployment changes during the first visit, the downloaded package may differ from the
already open editor. In that case Tree offers **Update App** to finish offline setup through
the same save-first reload, and does not claim that the current editor is ready offline.
An interrupted first installation retries when connectivity returns.

Tree checks for updates at startup and when connectivity returns. It downloads a complete
new package in the background without interrupting editing. A failed or interrupted download
leaves the installed version usable. Updates never clear or upload notes.

When the new version is ready, **Update App** appears directly above **About Tree**, which ends the ellipsis menu (§1.4), and
a small dot appears on its trigger. The trigger also describes the update for assistive
technology. The dot shares the position of the backup-attention dot of §24.5. No update prompt steals
focus or reloads an open editor. Applying a waiting update requires no network connection.

Update App saves pending work, including buffered Vim edits, before activating the new package
and reloading this window. Interaction is temporarily unavailable during this operation.
A save error or timeout keeps the editor open and displays a retryable message in the menu.
After dismissing that menu, typing continues at the selected Find result and its text position.
Repeated requests do not start concurrent updates. A running data operation must finish first.
An update can also run from the document-load error screen. It preserves the unopened document.

If other Tree tabs or windows are open, Tree asks the user to close them and retry, without
activating the update. This edge follows the durability principle (§1.1) and the single writer
restriction of §1.4: an update must not switch another window's runtime underneath its work.
These controls and the offline package apply only to the browser version, not Electron.

If a new tab arrives during the final switch, it displays a message asking the user to reload before opening the editor. The same other-window check applies when the first page needs to reload an already installed package. If an older worker cannot check open tabs or confirm activation, Tree saves the notes and asks the user to close all Tree tabs and reopen the app.

A preparation timeout cancels that attempt's permission to switch. If the browser has already been asked to activate the package, a timeout explains that the request was sent. The open editor can continue saving. A late controller change leaves the current page open. An explicit retry saves any further edits before reloading it.
