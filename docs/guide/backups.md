# Backups

A backup is one file that holds everything the keyboard stores: keys,
layers, behaviours, combos, macros, custom keys, pointing modes, lighting,
settings and the keyboard's name. It holds the complete profile, so restoring
it doesn't depend on what the keyboard had before.

Everything here is on the **Backups** screen. It needs a keyboard on current
firmware, or the demo.

## Export profile

**Export profile…** saves the profile the keyboard runs as a backup. It
changes nothing on the keyboard or in your draft. In Chrome the file goes to
your downloads; VS Code asks where to save it. The file is named like
`charybdis-2026-10-23.charybdis.json`.

In Live + review it exports what the keyboard runs, unsaved changes included.

Keep one somewhere safe before you try something big.

## Import profile

**Choose profile…**, or drop a backup file onto the **Import profile** card.
Ark checks the file and compares it with the keyboard before anything
changes. The sheet says:

- whether it fits the keyboard's memory ("This file fits: 5,408 of 130,048
  bytes"),
- how many things it changes, counted by what they are: keys on each layer,
  behaviours, lighting, macros and so on.

**Use as draft** makes the file your draft. Undo brings back the draft you
had. In Apply, the keyboard changes only once you review and apply it; in
Live + review the file is sent to the keyboard as unsaved edits, for you to
review and save.

A file that holds exactly what the keyboard runs changes nothing, so it can't
be used, unless your draft has edits: then using it puts the draft back to
the keyboard's profile, like **Discard all**.

Ark refuses a file it can't read, more than one file at a time, and a file
from older firmware. It never replaces your draft with a file it refused.

## Recovery copies

Before every Apply or Save, Ark saves a recovery copy of what the keyboard
held, and it doesn't write anything if it can't save one. A restart with
unsaved edits keeps a copy of those edits the same way.

- **In Chrome** the copies are kept in the browser and listed under **Saved
  before each Apply**, newest first, each with **Use as draft**, **Download**
  and **Delete**. Use as draft opens the same comparison as a backup file.
  Clearing the site's data deletes them, so download any you want to keep.
- **In VS Code** they are files in VS Code's storage for Ark. The message
  after Apply says where; open one with **Choose profile…**.

## Firmware updates

A backup restores onto the same firmware release. Ark works with the current
firmware only and converts nothing: when a firmware update changes how the
profile is stored, the keyboard starts from its built-in defaults and older
backups no longer import. Check the firmware's release notes before updating,
and export a fresh backup afterwards.

**Start from the firmware's defaults** is not available yet. Until then,
restore a backup made before your changes.
