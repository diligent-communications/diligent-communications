---
build_step: 1
consumes: ["../connections/CONTEXT.md","../../contracts/CONTEXT.md#captured-record","../../contracts/CONTEXT.md#archive-manifest","../../contracts/CONTEXT.md#saved-decision","../../contracts/CONTEXT.md#action-receipt","../../contracts/CONTEXT.md#command-list"]
produces: ["Readable originals","Readable saved decisions and receipts","Versioned manifest","Backups and restored records","Evidence folder access","Backup list for commands","Restore preview for commands","Restored decisions and receipts for commands"]
---
# archive — Keep originals and lasting records

## Inputs

- Working: None in this planning repository.
- Reference: [Captured record](../../contracts/CONTEXT.md#captured-record)
- Reference: [Archive manifest](../../contracts/CONTEXT.md#archive-manifest)
- Reference: [Saved decision](../../contracts/CONTEXT.md#saved-decision)
- Reference: [Action receipt](../../contracts/CONTEXT.md#action-receipt)
- Reference: [Command list](../../contracts/CONTEXT.md#command-list)

## Process

1. Accept only the captured record shape from capture. Save the original payload byte for byte and refuse a source ID already in the manifest.
2. Keep the evidence folder in this layout: a read-me file, the manifest, and the folders `originals/`, `decisions/` and `receipts/`. Do not encrypt it in step 1, so its files open without the program. Anyone who can open the evidence folder or a backup can read what is in it.
3. Accept the evidence folder and the separate backup folder locations from commands. Keep both as local settings outside the evidence folder and out of the archive and backups. Use the evidence folder setting to resolve the folder for commands and queries. If a saved folder is missing, report it. Never replace it with a new empty archive.
4. Accept saved decisions and receipts from state as readable archive records. Step 1 has no live producer of them: state starts producing them in step 2. In step 1, prove that archive accepts them with made-up records.
5. In step 1, handle setup's backup and restore requests through commands. Make every backup a complete, separate copy of the evidence folder in the second folder the person picks. Never delete a backup.
6. For restore, give commands the backup list: the backups found in the backup folder, with each unfinished or unreadable one listed with the reason and not available to pick. Check the backup the person picks and return its restore preview to commands. Restore it into the evidence folder location only if it is empty, or on a retry, if it already matches that backup exactly. Restore never overwrites or deletes an archive. A restore copies beside the destination and moves the copy into place only when it is complete, so a stopped copy never leaves the destination partly filled. A leftover from a stopped copy is reported and left alone. Give the restored decisions and receipts to the restore command for delivery to state.

## Outputs

- Readable originals
- Readable saved decisions and receipts
- Versioned manifest
- Backups and restored records
- Evidence folder access
- Backup list for commands
- Restore preview for commands
- Restored decisions and receipts for commands

## Check

A contributor backs up a synthetic archive with originals, decisions, and receipts, empties the disposable test copy, restores it, and verifies every file and ID against the baseline.
The contributor also verifies that backups appear in the selected backup folder, that restore lists and uses the selected backup, and that archive still resolves both local settings after restart without including either location in the backup.
The contributor also verifies that an unfinished or unreadable backup is listed with a reason and cannot be picked, and that the picked backup is checked and its restore preview returned to commands.
The contributor also verifies that restore refuses a destination that is neither empty nor a matching retry, that a missing folder is reported and not replaced, and that no backup is deleted.

## Folder rules

| Rule | Passes when |
| --- | --- |
| **An archive is created once.** When an archive is created or accepted at the evidence folder, its archive ID is remembered in the settings file. From then on, opening requires that archive at that folder. Creating happens only when no archive ID is remembered for that evidence folder and the folder is empty. Choosing a different evidence folder clears the remembered ID; saving the same folder again keeps it. "The same folder" is judged by file identity when both can be read, and by path text otherwise, so another spelling of the same place keeps the ID and never adopts a different archive without a report. | After an archive is created, an empty folder, a missing folder or a different archive at that folder is reported and nothing is created. Saving the same folder again, under any spelling, keeps the ID, and choosing another folder clears it. |
| **Both folders must already exist when they are set.** Their real locations are what is saved. | A folder that does not exist is refused and not created. A folder chosen through a folder link is saved as its real location. |
| **What a drive root means.** On Windows, a drive letter's top folder or a share's top folder. On Linux and macOS, `/` only. Stated limit: the top folder of a mounted drive is allowed there. | Each of these roots is refused as either folder, and a folder below one is accepted. |
| **Same folder by another name.** Besides real paths, each folder's file identity is compared with the other folder and with each of its parent folders. Stated limit: a share that starts below the other folder is not caught. | A second spelling of the same folder, or of a folder inside the other, is refused. |
| **What a valid archive is.** A folder whose manifest starts with a header line of a known version. Other files in the folder do not make it invalid. Checking every listed file belongs to verifying, a later step. | A folder with such a header and other files opens. A folder without one is refused and left unchanged. |
| **A folder that cannot be read is its own result.** A folder the program cannot read, a link loop, or a drive or share that is not available is reported as unavailable. It is never treated as empty, missing or safe to create in. This holds for the backup folder as well as the evidence folder: the program tries to list each one, so a folder it can find but cannot read is unavailable and is not accepted. The status of one folder never hides the status of the other. | An evidence or backup folder that cannot be read or listed is reported as unavailable and is not accepted, nothing is created, and the other folder's status is still reported. |
| **Creating never overwrites.** The read-me and the manifest are created only if no file of that name exists; a file that appears in the meantime is not replaced. A creation that stopped partway is left alone, and is reported as a stopped creation only when the folder's contents could be nothing but its leftovers: the record folders are empty, any manifest is only a short unfinished header, any read-me is the program's own, and no archive ID is remembered for that folder. Anything else is reported as having no manifest or a bad header. No message ever advises emptying or deleting a folder; it suggests choosing a new empty one. | A file that appears before creation finishes keeps its contents. Only leftovers like these are reported as a stopped creation; a record folder holding a file, a manifest beside saved files, or a folder with a remembered archive ID is reported as having no manifest or a bad header. Every case leaves the folder unchanged, and no message advises emptying or deleting it. |

## Lanes

### Storage · Step 4 (draft)

#### Inputs

- Working: None in this planning repository.
- Reference: [connections](../connections/CONTEXT.md)

#### Process

1. Use Google Drive as a second place to keep the evidence folder.

#### Outputs

- Drive backup and restored archive

#### Check

A contributor restores the same backup from Drive and from local storage and compares every file and ID.
