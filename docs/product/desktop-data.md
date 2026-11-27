# Desktop Notes Export and Import

## 25. Desktop Notes Export and Import

The desktop application exports and imports the notes archive of §24.2, so notes move between the desktop application and the browser version (§1.4) in both directions: an archive exported by either imports in the other.

### 25.1 Menu Commands

**Export Notes…** and **Import Notes…** are in the File menu, in that order. Both are also available in the command panel (§20.2.28) and through Vim Normal `<Leader>fe` and `<Leader>fi` (§20.2.32). Both are disabled while the window is starting, in the locked save-failure state (§16.2), and while an export or an import runs. Export is disabled when the stored notes cannot be opened. Import Notes… stays available when the stored document cannot be opened, so an archive can replace it. If Tree cannot read the import journal or finish the replacement it records (§25.4), both commands stay disabled until recovery succeeds.

Both native items show the corresponding export/import symbols (§9.3), including the system's disabled appearance when unavailable.

### 25.2 Export

Export Notes… opens a save panel named `Tree Notes YYYY-MM-DD.zip` with the local date. Cancelling the panel changes nothing. After a location is chosen, Tree saves pending edits, as Quit does, and exports the newest stored version that opens (§16.1) with every referenced image. Export never changes the stored notes.

Export otherwise follows §24.3: it runs in the background while editing remains available, shows its progress, Cancel and result in the bottom status bar, leaves out and counts missing or unusable images, and produces no file in the listed failure cases. The archive takes its name only when it is complete: Cancel, a failure or quitting leaves no archive and leaves an existing file of that name unchanged. A file that cannot be written gives `Export failed. The archive could not be saved: <reason>`.

The desktop activity remains visible alongside save or operation errors in the bottom status bar. Dismissing a focused activity returns focus to the previously focused editor or control. An archive-limit refusal has no folder-backup suffix because desktop folder backup is not available.

### 25.3 Import

Import Notes… opens an open panel for ZIP files. Cancelling it changes nothing. After a file is chosen, Tree saves pending edits and checks the archive in the background with the panel and Cancel of §24.4. Tree accepts exactly the archives that §24.4 accepts and reports the same reasons; older schema versions open after migration, and notes from a newer version of Tree are rejected. Because import moves every current image away (§25.4), images already stored under the same ID cannot conflict. Quitting during the check cancels it.

The **Replace Current Notes?** dialog of §24.4 says `Your current notes have 987 nodes and 40 images. Importing replaces them and moves them to the Replaced Notes folder.` Without stored notes it says `There are no saved notes.`; with notes that cannot be opened, `The saved notes cannot be opened. Importing replaces them and moves their files to the Replaced Notes folder.` Buttons, default, Escape and Export Current Notes First behave as in §24.4; Export Current Notes First opens the save panel of §25.2. Closing the dialog returns focus to where it was.

Tab and Shift+Tab move between the confirmation buttons and stay inside the dialog. When Export Current Notes First finishes or its save panel is cancelled, focus returns to Cancel, so Enter safely cancels until another button is selected.

* **Replace Notes** shows `Replacing Notes…`, disables the dialog, saves pending edits, replaces the notes (§25.4) and reloads the window, which opens the imported notes. Import does not change preferences.
* The panel then shows `Imported “Tree Notes 2026-10-20.zip”. Your previous notes are in “~/Library/Application Support/Tree/Replaced Notes/2026-10-23 14-05-09”.` with **Show in Finder** and **OK** until OK; Show in Finder selects that folder in the Finder.
* Without previous notes it shows `Imported “Tree Notes 2026-10-20.zip”.` and closes six seconds after appearing or with OK.
* After import, OK receives keyboard focus. Enter or Space closes the result; with previous notes, Shift+Tab reaches Show in Finder, and Tab returns to OK. Closing the focused result returns focus to the editor.
* Cancel and every failure before the replacement leave the notes unchanged and remove what the import prepared; failures show `Import failed. <reason>` until OK.
* A failure after replacement has committed keeps editing blocked and shows `Import failed. <reason> Restart Tree to complete the import.` The next start attempts the recovery described in §25.4.

### 25.4 Replaced Notes

Replace Notes moves the current `document.json`, its retained generations, any interrupted-save and legacy backup files, and the `attachments` folder into a new folder `Replaced Notes/YYYY-MM-DD HH-MM-SS` (local time) in `~/Library/Application Support/Tree/`, keeping the data-directory layout. Files are moved, not copied. When that name exists, ` 2`, ` 3`, … is appended; nothing is moved and no folder is created when there were no stored notes. Preferences stay in place. Once replacement completes, Tree never changes or deletes its Replaced Notes folder; the user removes old ones in the Finder.

The replacement is one logical unit, completed through resumable file moves rather than an all-or-nothing filesystem operation. Before its commit journal is installed, a failure leaves the current notes unchanged. After that point, recovery completes the import instead of rolling it back. The imported notes start without retained generations, and a replaced document or generation is never opened again after the replacement begins. If Tree stops during the replacement, the next start completes it before opening the notes and shows the result of §25.3. Quitting during the replacement waits for it.

If recovery cannot complete, loading fails with `The notes import could not be completed: <reason>` and opens no notes. An unreadable or invalid journal fails before recovery changes files. Recovery from a valid journal may move some files before a later failure; it retains the journal and remaining staged data while replacement is unfinished so a later start can continue. In either journal failure case, Tree shows `Restart Tree to complete the notes import.` and blocks another replacement. Repeated interruptions must preserve both the imported notes and the previous notes moved to Replaced Notes, without opening a partial replacement.
